import { ai, AI_MODEL } from "@/lib/ai";
import type { FieldDetection } from "./detectField";
import { COUNTRY_RULES, COUNTRY_LABELS } from "@/data/countryRules";

export async function rewriteCV(
  cvText: string,
  jobDescription: string,
  country: string,
  field: FieldDetection
): Promise<string> {
  const countryRule = COUNTRY_RULES[country] ?? COUNTRY_RULES.US;
  const countryName = COUNTRY_LABELS[country] ?? country;

  const system = [
    "You are an expert CV writer.",
    `Rewrite the CV to target this job in ${countryName}.`,
    `Field context: ${field.field} (${field.seniority}, targeting ${field.target_role}).`,
    `Country norms to follow: ${countryRule}`,
    "STRICT TRUTHFULNESS RULES — these override everything else:",
    "- Use ONLY skills, tools, employers, dates, and achievements that appear in the original CV.",
    "- NEVER add a skill or keyword just because the job description wants it. If it is not in the original CV, it does not go in the rewrite.",
    "- Do not inflate numbers, titles, or dates. You may rephrase and quantify ONLY what the source already states.",
    "- If the CV is missing something the job needs, leave it out — the scoring step already tells the user what is missing.",
    "You MAY: reorder, reword with stronger action verbs, improve formatting, and surface relevant existing experience.",
    "Tailor emphasis to the job and the conventions of this field, within the truthfulness rules above.",
    "Return the rewritten CV as clean Markdown only — no commentary, no preamble.",
  ].join(" ");

  const user = [
    `TARGET JOB:\n"""\n${jobDescription}\n"""`,
    `ORIGINAL CV:\n"""\n${cvText}\n"""`,
  ].join("\n\n");

  const res = await ai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return res.choices[0]?.message?.content ?? "";
}