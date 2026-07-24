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
 */
export async function extractReviewInput(req: NextRequest): Promise<ReviewInput> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("cv");
    const jobTitle = str(form.get("jobTitle"));
    const jobDescription = str(form.get("jobDescription")) || str(form.get("description"));
    const country = str(form.get("country")) || "US";

    let cvText = str(form.get("cvText")) || str(form.get("cv"));
    if (file && typeof file !== "string") {
      const buffer = Buffer.from(await file.arrayBuffer());
      cvText = await parseCV(buffer, file.name);
    }
    return finalize({ cvText, jobTitle, jobDescription, country, source: "multipart" });
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
    return finalize({
      cvText,
      jobTitle: str(body.jobTitle) || str(body.title),
      jobDescription,
      country: str(body.country) || "US",
      source: "json",
    });
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
 */
function finalize(input: ReviewInput): ReviewInput {
  const cvText = input.cvText.trim();
  const jd = input.jobDescription.trim();

  const effectiveCv = cvText || jd;
  if (effectiveCv.length < MIN_CV_CHARS) {
    throw new ReviewInputError(
      `Not enough text to review (need at least ${MIN_CV_CHARS} characters). Provide a CV file, a "cvText" field, or a task description in the request body.`
    );
  }

  return {
    ...input,
    cvText: effectiveCv,
    // If only a CV came in, reuse it as the brief so scoring still has a target.
    jobDescription: jd || effectiveCv,
  };
}

export class ReviewInputError extends Error {}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function looksLikeJson(s: string): boolean {
  const t = s.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}
