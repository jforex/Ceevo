import { NextRequest, NextResponse } from "next/server";
import { extractReviewInput, ReviewInputError } from "@/lib/reviewInput";
import { detectField } from "@/agent/detectField";
import { scoreCV } from "@/agent/scoreCV";

export const runtime = "nodejs"; // parsers need Node, not Edge

export async function POST(req: NextRequest) {
  try {
    const { cvText, jobTitle, jobDescription } = await extractReviewInput(req);

    // Agent: detect field, then score (free tier — no rewrite)
    const field = await detectField(cvText);
    const score = await scoreCV(cvText, jobTitle, jobDescription, field);

    return NextResponse.json({ ok: true, field, score });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    const status = err instanceof ReviewInputError ? 422 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}