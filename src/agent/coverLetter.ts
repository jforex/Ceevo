import { aiText } from "@/lib/ai";
import type { FieldDetection } from "./detectField";
import { COUNTRY_RULES, COUNTRY_LABELS } from "@/data/countryRules";

export async function coverLetter(
  cvText: string,
  jobTitle: string,
  jobDescription: string,
  country: string,
  field: FieldDetection,
  // Terms the job wants but the CV lacks — verified absent from the output.
  forbidden: string[] = []
): Promise<string> {
  const countryRule = COUNTRY_RULES[country] ?? COUNTRY_RULES.US;
  const countryName = COUNTRY_LABELS[country] ?? country;

  const system = [
    "You are an expert cover letter writer.",
    `Write a cover letter for this candidate applying in ${countryName}.`,
    `Field context: ${field.field} (${field.seniority}, targeting ${field.target_role}).`,
    `Country norms to follow: ${countryRule}`,
    "STRICT TRUTHFULNESS RULES — these override everything else:",
    "- Every claim must trace to something in the CV. Use ONLY real employers, skills, dates, and achievements from it.",
    "- NEVER invent enthusiasm for the company, prior knowledge of its products, or a personal connection to it.",
    "- NEVER claim years of experience, qualifications, or results the CV does not state.",
    "- Do not assert the candidate 'has always admired' or 'has long followed' anything — you cannot know that.",
    "- If the job asks for something the candidate lacks, do not claim it and do not apologize for it. Emphasize genuine adjacent strengths instead.",
    "You MAY: connect real CV experience to stated job requirements, and express straightforward professional interest in the role itself.",
    "Keep it to 3-4 short paragraphs. Open with the role, evidence the fit from the CV, close with a plain call to action.",
    "Use placeholders like [Hiring Manager] only where a real name is genuinely unknown.",
    "Return the cover letter as clean Markdown only — no commentary, no preamble.",
  ].join(" ");

  const user = [
    `ROLE: ${jobTitle || "(not specified)"}`,
    `TARGET JOB:\n"""\n${jobDescription}\n"""`,
    `CANDIDATE CV:\n"""\n${cvText}\n"""`,
  ].join("\n\n");

  return aiText(system, user, { forbidden });
}
