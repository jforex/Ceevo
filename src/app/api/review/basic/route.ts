import { NextRequest, NextResponse } from "next/server";
import { parseCV } from "@/lib/parseCV";
import { detectField } from "@/agent/detectField";
import { scoreCV } from "@/agent/scoreCV";

export const runtime = "nodejs"; // parsers need Node, not Edge

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("cv") as File | null;
    const jobTitle = (form.get("jobTitle") as string) ?? "";
    const jobDescription = (form.get("jobDescription") as string) ?? "";

    if (!file) {
      return NextResponse.json({ error: "No CV file uploaded." }, { status: 400 });
    }
    if (!jobDescription.trim()) {
      return NextResponse.json({ error: "Job description is required." }, { status: 400 });
    }

    // File -> text
    const buffer = Buffer.from(await file.arrayBuffer());
    const cvText = await parseCV(buffer, file.name);

    if (cvText.length < 50) {
      return NextResponse.json(
        { error: "Could not read enough text from that file. Try another format." },
        { status: 422 }
      );
    }

    // Agent: detect field, then score (free tier — no rewrite)
    const field = await detectField(cvText);
    const score = await scoreCV(cvText, jobTitle, jobDescription, field);

    return NextResponse.json({ field, score });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}