import { config } from "dotenv";
config({ path: ".env.local" });
import OpenAI from "openai";

// OpenRouter uses the OpenAI-compatible API — same SDK, different base URL.
export const ai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
});

// Free model with reliable structured-output (JSON) support.
export const AI_MODEL = "google/gemma-4-26b-a4b-it:free";

// Helper: send a prompt, get back parsed JSON matching a schema.
export async function aiJSON<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>
): Promise<T> {
  const res = await ai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "result", strict: true, schema },
    },
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as T;
}