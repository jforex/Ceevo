import { aiJSON } from "@/lib/ai";
import type { FieldDetection } from "./detectField";

export type JobLead = {
  role: string;          // suggested role title
  why: string;           // one line: why it fits this candidate
  search_query: string;  // ready-to-paste search string
};

export type JobLeads = {
  leads: JobLead[];
  where_to_search: string[]; // platforms/boards suited to this field + country
};

const schema = {
  type: "object",
  properties: {
    leads: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          why: { type: "string" },
          search_query: { type: "string" },
        },
        required: ["role", "why", "search_query"],
        additionalProperties: false,
      },
    },
    where_to_search: { type: "array", items: { type: "string" } },
  },
  required: ["leads", "where_to_search"],
  additionalProperties: false,
};

export async function recommendJobs(
  cvText: string,
  country: string,
  field: FieldDetection
): Promise<JobLeads> {
  const system = [
    "You are a career advisor.",
    `The candidate works in ${field.field} (${field.seniority}, targeting ${field.target_role}).`,
    `They are job-hunting in ${country}.`,
    "Suggest 4-6 realistic roles that match their actual experience — adjacent and step-up roles included.",
    "For each: a clear role title, one line on why it fits THIS candidate's background, and a ready-to-paste job-search query.",
    "where_to_search: name the job boards / platforms best suited to this field and country (be specific and realistic).",
    "Base everything on the CV — do not suggest roles the candidate has no foundation for.",
    "Return JSON only.",
  ].join(" ");

  const user = `CV:\n"""\n${cvText}\n"""`;

  return aiJSON<JobLeads>(system, user, schema);
}