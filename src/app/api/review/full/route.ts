import { requirePayment, paymentChallenge } from "@/lib/paywall";
import { NextRequest, NextResponse } from "next/server";
import { extractReviewInput, ReviewInputError } from "@/lib/reviewInput";
import { detectField } from "@/agent/detectField";
import { scoreCV } from "@/agent/scoreCV";
import { rewriteCV } from "@/agent/rewriteCV";
import { changePlan } from "@/agent/changePlan";
import { coverLetter } from "@/agent/coverLetter";
import { recommendJobs, type JobLeads } from "@/agent/recommendJobs";
import { markdownToDocx } from "@/lib/exportDocx";
import { markdownToPdf } from "@/lib/exportPdf";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby hard cap

// Leave headroom under maxDuration so we always answer ourselves rather than being
// killed by the platform mid-request.
const DEADLINE_MS = 52_000;

type ExportFile = { filename: string; mimeType: string; base64: string };
type ExportFiles = { rewrittenCv: { pdf: ExportFile; docx: ExportFile } | null; coverLetter: { pdf: ExportFile; docx: ExportFile } | null };

/**
 * Render the rewrite and cover letter into PDF + DOCX, base64-encoded for the JSON
 * response. Each document's pair is generated in parallel; a failure on one document
 * (e.g. a pathological Markdown construct) is logged and that document's `files` entry
 * is simply omitted rather than failing content the buyer already paid for.
 */
async function buildExportFiles(input: {
  rewritten: string;
  letter: string;
  country: string;
}): Promise<ExportFiles> {
  async function renderPair(md: string, baseName: string): Promise<{ pdf: ExportFile; docx: ExportFile } | null> {
    if (!md) return null;
    try {
      const [pdfBuf, docxBuf] = await Promise.all([
        markdownToPdf(md, input.country),
        markdownToDocx(md, input.country),
      ]);
      return {
        pdf: { filename: `${baseName}.pdf`, mimeType: "application/pdf", base64: pdfBuf.toString("base64") },
        docx: {
          filename: `${baseName}.docx`,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          base64: docxBuf.toString("base64"),
        },
      };
    } catch (err) {
      console.error("[export] failed to render", baseName, err);
      return null;
    }
  }

  const [rewrittenCv, coverLetterFiles] = await Promise.all([
    renderPair(input.rewritten, "CV"),
    renderPair(input.letter, "Cover Letter"),
  ]);

  return { rewrittenCv, coverLetter: coverLetterFiles };
}

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

// The x402 verification probe (agent x402-check) sends a GET. Without a GET handler
// Next returns 405, so the probe never sees the 402 challenge and the service reads as
// invalid. GET returns the same 402 + accepts array as an unpaid POST. Payment itself
// happens on the POST replay, so a GET carrying a payment header is told to use POST
// rather than run the (body-dependent) review.
// Machine-readable description of the request body, so callers don't have to guess
// field names. Advertised on the GET 402 challenge via the `X-Input-Schema` header
// (the challenge body itself must stay the SDK-built x402 payload for agent x402-check).
const INPUT_SCHEMA = {
  contentTypes: ["multipart/form-data", "application/json", "text/plain"],
  fields: {
    cv: {
      aliases: ["cv", "cvText", "resume"],
      required: true,
      description:
        "The CV. A file (PDF/DOCX/TXT) under multipart; a string under JSON; or the raw request body under text/plain.",
    },
    jobDescription: {
      aliases: ["jobDescription", "description", "task", "prompt"],
      required: true,
      description: "The target job description.",
    },
    jobTitle: { aliases: ["jobTitle", "title"], required: false, description: "The target job title." },
    country: {
      aliases: ["country"],
      required: false,
      default: "US",
      description: "Two-letter target country code (US, UK, NG, …).",
    },
  },
} as const;

export async function GET(req: NextRequest) {
  if (req.headers.get("x-payment") || req.headers.get("payment-signature")) {
    return NextResponse.json(
      { ok: false, error: "Send the paid request as POST with the review body." },
      { status: 405, headers: { Allow: "POST" } }
    );
  }
  // Return the SDK-built 402 challenge unchanged (agent x402-check depends on it).
  // The input schema is surfaced in the 422 body when a paid caller sends the wrong
  // fields — the place a caller actually needs it — rather than on this challenge.
  return paymentChallenge(req);
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    // x402 gate. Either an immediate response (402 challenge or payment error), or a
    // `settle` continuation to call AFTER the paid content is produced (the SDK model:
    // verify signature -> run business logic -> settle on-chain -> deliver).
    const gate = await requirePayment(req);
    if ("response" in gate) return gate.response;
    const settle = gate.settle;

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

    // Content is ready — settle the payment on-chain now. If settlement fails, return its
    // error (402) rather than delivering unpaid content.
    const settleError = await settle();
    if (settleError) return settleError;

    // Render the rewrite and cover letter into downloadable PDF/DOCX, base64-encoded
    // into the JSON body (the service is stateless — no file storage to link out to).
    // Generated only for content that actually came back (not the "" timeout fallback),
    // and per-file: a rendering failure must not cost the buyer the review they already
    // paid for, so each export degrades to omitted rather than 500ing the whole response.
    // Bounded separately from the AI budget — rendering is normally sub-second, but the
    // payment has already settled by this point, so a stall here must still resolve
    // before Vercel's hard 60s cap rather than costing the buyer a paid-for response.
    const files = await settleWithin(
      buildExportFiles({ rewritten, letter, country }),
      Math.max(3_000, 55_000 - (Date.now() - startedAt)),
      { rewrittenCv: null, coverLetter: null }
    );

    return NextResponse.json({
      ok: true,
      field,
      score,
      plan,
      rewritten,
      letter,
      jobs,
      files,
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
    // On an input error, return the schema so the caller learns the expected fields
    // instead of guessing again.
    const body =
      err instanceof ReviewInputError
        ? { ok: false, error: message, inputSchema: INPUT_SCHEMA }
        : { ok: false, error: message };
    return NextResponse.json(body, { status });
  }
}