import { aiJSON } from "@/lib/ai";

export type FieldDetection = {
  field: string;        // e.g. "Software Engineering", "Nursing", "Finance"
  seniority: string;    // e.g. "junior", "mid", "senior", "lead"
  target_role: string;  // best-guess role the CV is aimed at
  confidence: number;   // 0-1
};

const schema = {
  type: "object",
  properties: {
    field: { type: "string" },
    seniority: { type: "string" },
    target_role: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["field", "seniority", "target_role", "confidence"],
  additionalProperties: false,
};

export async function detectField(cvText: string): Promise<FieldDetection> {
  const system = [
    "You are a CV analysis expert.",
    "Read the CV and identify its professional field, the candidate's seniority, and the role it is aimed at.",
    "Base your answer only on evidence in the CV. Be specific with the field (industry + discipline).",
    "Return JSON only.",
  ].join(" ");

  const user = `CV:\n"""\n${cvText}\n"""`;

  return aiJSON<FieldDetection>(system, user, schema);
}