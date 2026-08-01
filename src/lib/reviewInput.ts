import type { NextRequest } from "next/server";
import { parseCV } from "@/lib/parseCV";

export type ReviewInput = {
  cvText: string;
  jobTitle: string;
  jobDescription: string;
  country: string;
  source: "multipart" | "json" | "text"; // how the body arrived, for logging
};

const MIN_CV_CHARS = 50;

/**
 * Extract review inputs from any body shape the endpoint may receive:
 *
 *  - multipart/form-data  → the browser UI: a `cv` file plus jobTitle/jobDescription/country fields
 *  - application/json      → an agent caller: { cv?, cvText?, jobTitle?, jobDescription/description?, country? }
 *  - text/plain (or empty ct) → the x402 replay: the raw task description as the body
 *
 * The x402 paid replay sends the task description as the business body with NO file
 * upload, so a file must never be required. When no CV text is supplied separately,
 * the task description itself is used as the CV-and-brief so the pipeline can still run.
 *
 * `opts.requireCountry`: the paid /full endpoint rewrites the CV to a specific country's
 * hiring norms — that's the product's core promise (US vs Nigeria formats genuinely
 * differ) — so a missing country must be a clear error, not a silent US default the
 * buyer never agreed to. The free /basic endpoint doesn't rewrite anything, so country
 * is irrelevant there and stays optional.
 */
export async function extractReviewInput(
  req: NextRequest,
  opts: { requireCountry?: boolean } = {}
): Promise<ReviewInput> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("cv");
    const jobTitle = str(form.get("jobTitle"));
    const jobDescription = str(form.get("jobDescription")) || str(form.get("description"));
    const country = str(form.get("country"));

    let cvText = str(form.get("cvText")) || str(form.get("cv"));
    if (file && typeof file !== "string") {
      const buffer = Buffer.from(await file.arrayBuffer());
      cvText = await parseCV(buffer, file.name);
    }
    return finalize({ cvText, jobTitle, jobDescription, country, source: "multipart" }, opts);
  }

  const raw = await req.text();

  if (contentType.includes("application/json") || looksLikeJson(raw)) {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Malformed JSON — fall through and treat the raw string as the task description.
    }
    const jobDescription =
      str(body.jobDescription) || str(body.description) || str(body.task) || str(body.prompt);
    const cvText = str(body.cvText) || str(body.cv) || str(body.resume);
    return finalize(
      {
        cvText,
        jobTitle: str(body.jobTitle) || str(body.title),
        jobDescription,
        country: str(body.country),
        source: "json",
      },
      opts
    );
  }

  // Raw text body (the typical x402 replay): the whole body is the brief.
  return finalize({
    cvText: "",
    jobTitle: "",
    jobDescription: raw,
    country: "US",
    source: "text",
  });
}

/**
 * When no CV was supplied separately, use the task description as the CV text so the
 * pipeline has something to analyze. Guarantees a non-empty cvText or throws a clear,
 * catchable error the route turns into a structured non-2xx body.
 *
 * The CV-as-brief fallback below is ONLY valid for the raw-text x402-replay source,
 * where there is genuinely one undifferentiated blob and no way to ask for a second
 * field. For json/multipart callers that supplied a cv but omitted jobDescription,
 * silently scoring the CV against itself produces a meaningless "perfect match" —
 * that must be a clear 422 telling the caller what's missing, not a paid 200 with
 * fabricated-looking output.
 *
 * Same reasoning applies to country when opts.requireCountry is set: the paid rewrite
 * is tailored to that country's hiring norms (US resume conventions genuinely differ
 * from Nigeria's, for example), so silently defaulting to "US" would rewrite the CV to
 * a country the buyer never asked for, with no indication anything was assumed.
 */
function finalize(input: ReviewInput, opts: { requireCountry?: boolean } = {}): ReviewInput {
  const cvText = input.cvText.trim();
  const jd = input.jobDescription.trim();
  const country = input.country.trim();

  if (input.source !== "text") {
    if (cvText.length < MIN_CV_CHARS) {
      throw new ReviewInputError(
        `Not enough CV text to review (need at least ${MIN_CV_CHARS} characters). Provide a CV file or a "cvText"/"cv"/"resume" field.`
      );
    }
    if (jd.length < MIN_CV_CHARS) {
      throw new ReviewInputError(
        `Job description is required (need at least ${MIN_CV_CHARS} characters). Provide a "jobDescription"/"description"/"task"/"prompt" field.`
      );
    }
    if (opts.requireCountry && !country) {
      throw new ReviewInputError(
        `Target country is required — the rewrite is tailored to that country's CV/resume norms. Provide a "country" field (two-letter code, e.g. US, UK, NG).`
      );
    }
    return { ...input, cvText, jobDescription: jd, country: country || "US" };
  }

  // source === "text": one raw blob, no separate fields possible — reuse it as both.
  // Country can't be asked for separately here either, so it stays defaulted to US
  // regardless of opts.requireCountry — same as jobDescription's fallback above.
  const effectiveCv = cvText || jd;
  if (effectiveCv.length < MIN_CV_CHARS) {
    throw new ReviewInputError(
      `Not enough text to review (need at least ${MIN_CV_CHARS} characters). Provide a CV file, a "cvText" field, or a task description in the request body.`
    );
  }
  return { ...input, cvText: effectiveCv, jobDescription: jd || effectiveCv, country: country || "US" };
}

export class ReviewInputError extends Error {}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function looksLikeJson(s: string): boolean {
  const t = s.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}
