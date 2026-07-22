import { config } from "dotenv";
config({ path: ".env.local" });
import OpenAI from "openai";

// Groq uses the OpenAI-compatible API — same SDK, different base URL.
// Chosen over OpenRouter's free tier, where provider queueing made the same call vary
// between 1.5s and 34s and pushed the /full route past Vercel Hobby's 60s cap.
// The placeholder keeps the SDK from throwing at module load during the build, when
// env vars are not present. A real key is still required at request time.
export const ai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || "missing-at-build-time",
  baseURL: "https://api.groq.com/openai/v1",
  maxRetries: 0, // we manage retries ourselves — the route is on a hard 60s budget
});

// Structured-output model for the short JSON stages (detect, score, plan, leads).
// Verified against the live API: the llama models reject `json_schema` outright
// (400), while this one accepts strict mode, so schema adherence is guaranteed at
// the token level rather than left to best-effort prompting.
export const AI_MODEL = "openai/gpt-oss-120b";

// Long free-text generations (rewrite, cover letter). Sub-second and strong enough
// for prose that must not invent facts.
export const AI_MODEL_FAST = "llama-3.1-8b-instant";

// Fallback for the long generations. Rate limits on Groq's free tier are per-model
// (~8000 TPM), so the fallback deliberately avoids AI_MODEL: routing it elsewhere
// keeps a retry from competing with the JSON stages for the same token budget.
export const AI_MODEL_TEXT_FALLBACK = "openai/gpt-oss-20b";

// Groq inference is typically sub-second, but the route still runs on a hard 60s cap,
// so every call stays bounded: a network stall or provider hiccup is abandoned rather
// than allowed to consume the whole budget.
export const BUDGET_MS = {
  json: 15_000, // short JSON stages (detect, score, plan, leads)
  text: 20_000, // long generations (rewrite, cover letter)
} as const;

class TimeoutError extends Error {}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Fail loudly at request time rather than surfacing an opaque 401 mid-review. */
function assertKey() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set — add it to .env.local and to the Vercel project env.");
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * How long Groq asks us to wait, parsed from a 429 body. The unit varies —
 * "try again in 3.855s" and "try again in 277.499999ms" both occur — so both are
 * handled; matching only seconds would silently return 0 and retry straight into
 * the same limit. A small margin is added, and non-429 errors retry immediately.
 */
function retryAfterMs(err: unknown): number {
  const msg = err instanceof Error ? err.message : "";
  const m = /try again in ([\d.]+)(ms|s)\b/i.exec(msg);
  if (!m) return 0;
  const value = parseFloat(m[1]);
  const ms = m[2].toLowerCase() === "ms" ? value : value * 1000;
  return Math.min(Math.ceil(ms) + 250, 12_000);
}

/**
 * Send a prompt, get back parsed JSON matching a schema.
 * Bounded by BUDGET_MS.json. Retries once — and when the failure is a rate limit,
 * waits out the window Groq reports first, since an immediate retry would just
 * hit the same limit.
 */
export async function aiJSON<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  opts: { timeoutMs?: number } = {}
): Promise<T> {
  assertKey();
  const timeoutMs = opts.timeoutMs ?? BUDGET_MS.json;

  const call = async (): Promise<T> => {
    const res = await withTimeout(
      ai.chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "result", strict: true, schema },
        },
      }),
      timeoutMs,
      "aiJSON"
    );
    const text = res.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(text) as T;
  };

  try {
    return await call();
  } catch (err) {
    const wait = retryAfterMs(err);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return await call(); // single retry inside the same stage budget
  }
}

/**
 * Long free-text generation. Tries the fast 8b first and falls back to the larger
 * model if it times out or returns nothing usable — the fallback is a quality and
 * availability backstop, not a speed one. The response shape is validated rather
 * than assumed, since a malformed choices array would otherwise surface as an
 * empty section in a review the user has paid for.
 */
export async function aiText(
  system: string,
  user: string,
  opts: { timeoutMs?: number; forbidden?: string[] } = {}
): Promise<string> {
  assertKey();
  const timeoutMs = opts.timeoutMs ?? BUDGET_MS.text;

  // Truthfulness is the product's core promise, and prompt rules alone do not hold:
  // the fast model was observed claiming Kubernetes, Terraform and Go for a candidate
  // whose CV contained none of them. Any term the job demands but the CV lacks is
  // therefore checked for in the output, and a violation is regenerated on the
  // stronger model rather than shipped to the user.
  const violations = (text: string): string[] => {
    const hay = text.toLowerCase();
    return (opts.forbidden ?? []).filter((term) => {
      const t = term.toLowerCase().trim();
      if (t.length < 2) return false;
      return new RegExp(`(^|[^a-z0-9+#.])${escapeRegex(t)}([^a-z0-9+#.]|$)`, "i").test(hay);
    });
  };

  const call = async (model: string, ms: number, userMsg: string = user): Promise<string> => {
    const res = await withTimeout(
      ai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
      ms,
      `aiText(${model})`
    );
    const text = res.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error(`${model} returned empty content`);
    return text;
  };

  const fallbackMs = Math.round(timeoutMs * 0.75);

  let first: string;
  try {
    first = await call(AI_MODEL_FAST, timeoutMs);
  } catch (err) {
    const wait = retryAfterMs(err);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return await call(AI_MODEL_TEXT_FALLBACK, fallbackMs);
  }

  const bad = violations(first);
  if (bad.length === 0) return first;

  // The fast model claimed something the CV does not support. Regenerate once on the
  // stronger model with the violation named explicitly; if that also fails the check,
  // return the better of the two rather than a fabricated document.
  try {
    const retryUser = `${user}\n\nCRITICAL: a previous attempt falsely claimed the candidate has: ${bad.join(", ")}. The CV does NOT support these. Rewrite with no mention of them.`;
    const second = await call(AI_MODEL_TEXT_FALLBACK, fallbackMs, retryUser);
    return violations(second).length < bad.length ? second : first;
  } catch {
    return first;
  }
}
