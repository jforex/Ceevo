import { aiJSON } from "@/lib/ai";
import type { FieldDetection } from "./detectField";
import type { CVScore } from "./scoreCV";
import { COUNTRY_RULES, COUNTRY_LABELS } from "@/data/countryRules";

export type PlannedChange = {
  change: string; // what will be changed, concretely
  reason: string; // why — grounded in the job, country norm, or field convention
};

export type ChangePlan = {
  changes: PlannedChange[];
};

const schema = {
  type: "object",
  properties: {
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          change: { type: "string" },
          reason: { type: "string" },
        },
        required: ["change", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["changes"],
  additionalProperties: false,
};

export async function changePlan(
  cvText: string,
  jobDescription: string,
  country: string,
  field: FieldDetection,
  score: CVScore
): Promise<ChangePlan> {
  const countryRule = COUNTRY_RULES[country] ?? COUNTRY_RULES.US;
  const countryName = COUNTRY_LABELS[country] ?? country;

  const system = [
    "You are an expert CV editor planning a rewrite before making it.",
    `The candidate works in ${field.field} (${field.seniority}, targeting ${field.target_role}).`,
    `They are applying in ${countryName}.`,
    `Country norms that apply: ${countryRule}`,
    "List 4-8 specific changes you will make to this CV, each with the reason for it.",
    "STRICT TRUTHFULNESS RULES — these override everything else:",
    "- Never plan to ADD a skill, tool, employer, date, or achievement that is not already in the CV.",
    "- Plans may reorder, reword, reformat, quantify what the source already states, and surface existing experience.",
    "- If the job needs something the CV lacks, do NOT plan to add it. The score step already reports that gap.",
    "Ground every reason in one of: a specific requirement in the job description, a norm of this country, or a convention of this field.",
    "'change' is concrete and specific to THIS CV — name the actual section, bullet, or wording. Never generic advice.",
    "'reason' is one short sentence explaining why that change helps for this job.",
    "Return JSON only.",
  ].join(" ");

  const user = [
    `TARGET JOB:\n"""\n${jobDescription}\n"""`,
    `SCORE CONTEXT: ${score.score}/100. Missing keywords: ${
      score.missing_keywords.join(", ") || "(none)"
    }. Gaps: ${score.gaps.join("; ") || "(none)"}`,
    `CV:\n"""\n${cvText}\n"""`,
  ].join("\n\n");

  return aiJSON<ChangePlan>(system, user, schema);
}
