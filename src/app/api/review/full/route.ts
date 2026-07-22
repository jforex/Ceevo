import { requirePayment } from "@/lib/paywall";
import { NextRequest, NextResponse } from "next/server";
import { parseCV } from "@/lib/parseCV";
import { detectField } from "@/agent/detectField";
import { scoreCV } from "@/agent/scoreCV";
import { rewriteCV } from "@/agent/rewriteCV";
import { recommendJobs } from "@/agent/recommendJobs";

export const runtime = "nodejs";
export const maxDuration = 60; // this route runs several AI calls

export async function POST(req: NextRequest) {
  try {
    const gate = await requirePayment(req);
    if (gate) return gate;
    const form = await req.formData();
    const file = form.get("cv") as File | null;
    const jobTitle = (form.get("jobTitle") as string) ?? "";
    const jobDescription = (form.get("jobDescription") as string) ?? "";
    const country = (form.get("country") as string) ?? "US";

    if (!file) return NextResponse.json({ error: "No CV file uploaded." }, { status: 400 });
    if (!jobDescription.trim()) return NextResponse.json({ error: "Job description is required." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const cvText = await parseCV(buffer, file.name);
    if (cvText.length < 50) {
      return NextResponse.json(
        { error: "Could not read enough text from that file. Try another format." },
        { status: 422 }
      );
    }

    // Full pipeline
    const field = await detectField(cvText);
    const score = await scoreCV(cvText, jobTitle, jobDescription, field);
    const [rewritten, jobs] = await Promise.all([
      rewriteCV(cvText, jobDescription, country, field),
      recommendJobs(cvText, country, field),
    ]);

    return NextResponse.json({ field, score, rewritten, jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}