import { requirePayment } from "@/lib/paywall";
import { NextRequest, NextResponse } from "next/server";
import { extractReviewInput, ReviewInputError } from "@/lib/reviewInput";
import { detectField } from "@/agent/detectField";
import { scoreCV } from "@/agent/scoreCV";
import { rewriteCV } from "@/agent/rewriteCV";
import { changePlan } from "@/agent/changePlan";
import { coverLetter } from "@/agent/coverLetter";
import { recommendJobs, type JobLeads } from "@/agent/recommendJobs";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby hard cap

// Leave headroom under maxDuration so we always answer ourselves rather than being
// killed by the platform mid-request.
const DEADLINE_MS = 52_000;

/**
 * Resolve to `fallback` if the promise misses the deadline or rejects, so one slow
 * section cannot take down a review the user already paid for.
 */
async function settleWithin<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([p.catch(() => fallback), guard]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const gate = await requirePayment(req);
    if (gate) return gate;

    // Accept multipart (browser), JSON (agent), or a raw-text body (the x402 replay,
    // which sends the task description with no file). See extractReviewInput.
    const { cvText, jobTitle, jobDescription, country } = await extractReviewInput(req);

    // Full pipeline: detect -> score -> plan, then rewrite/letter/leads in parallel.
    // The plan is grounded in the score and the rewrite follows the plan, so the first
    // three stay sequential. The last three depend only on the CV, so the parallel block
    // costs one stage instead of three.
    //
    // The whole route must finish inside Hobby's 60s cap. Each AI call is individually
    // bounded (see lib/ai.ts), and the parallel block is additionally capped below: the
    // user has already paid by this point, so a slow provider must degrade to partial
    // results rather than let the platform return a 504 with nothing at all.
    const field = await detectField(cvText);
    const score = await scoreCV(cvText, jobTitle, jobDescription, field);
    const plan = await changePlan(cvText, jobDescription, country, field, score);

    // Keywords the job wants but the CV lacks. The generators must not claim these,
    // so they are passed down and verified against the generated text.
    const forbidden = score.missing_keywords ?? [];

    const remainingMs = Math.max(5_000, DEADLINE_MS - (Date.now() - startedAt));
    const [rewritten, letter, jobs] = await Promise.all([
      settleWithin(rewriteCV(cvText, jobDescription, country, field, forbidden), remainingMs, ""),
      settleWithin(coverLetter(cvText, jobTitle, jobDescription, country, field, forbidden), remainingMs, ""),
      settleWithin<JobLeads | null>(recommendJobs(cvText, country, field), remainingMs, null),
    ]);

    return NextResponse.json({
      ok: true,
      field,
      score,
      plan,
      rewritten,
      letter,
      jobs,
      // Tells the client which optional sections to hide rather than render empty.
      partial: {
        rewritten: rewritten === "",
        letter: letter === "",
        jobs: jobs === null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    // Bad/insufficient input is the caller's fault (422), not a server fault (500).
    // Either way return an explicit { ok:false, error } body so a failed x402 replay
    // shows the reason instead of a silent empty deliverable.
    const status = err instanceof ReviewInputError ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}