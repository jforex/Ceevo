import { aiJSON } from "@/lib/ai";
import type { FieldDetection } from "./detectField";

export type CVScore = {
  score: number;          // 0-100 ATS-style match
  matched_keywords: string[];
  missing_keywords: string[];
  gaps: string[];         // concrete things to fix
  summary: string;        // one-line verdict
};

const schema = {
  type: "object",
  properties: {
    score: { type: "number" },
    matched_keywords: { type: "array", items: { type: "string" } },
    missing_keywords: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["score", "matched_keywords", "missing_keywords", "gaps", "summary"],
  additionalProperties: false,
};

export async function scoreCV(
  cvText: string,
  jobDescription: string,
  field: FieldDetection
): Promise<CVScore> {
  const system = [
    "You are an ATS (applicant tracking system) and hiring expert.",
    `The candidate's field is ${field.field} (${field.seniority}, targeting ${field.target_role}).`,
    "Score how well the CV matches the job description on a 0-100 scale.",
    "Judge by the norms of this specific field — relevant skills, keywords, and signals hiring managers in this field look for.",
    "matched_keywords: important JD terms present in the CV.",
    "missing_keywords: important JD terms absent from the CV.",
    "gaps: specific, actionable fixes (not vague advice).",
    "Return JSON only.",
  ].join(" ");

  const user = [
    `JOB DESCRIPTION:\n"""\n${jobDescription}\n"""`,
    `CV:\n"""\n${cvText}\n"""`,
  ].join("\n\n");

  return aiJSON<CVScore>(system, user, schema);
}