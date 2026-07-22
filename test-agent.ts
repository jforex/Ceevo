import { config } from "dotenv";
config({ path: ".env.local" });
import { detectField } from "./src/agent/detectField";
import { scoreCV } from "./src/agent/scoreCV";
import { rewriteCV } from "./src/agent/rewriteCV";

const sampleCV = `
John Adeyemi
Lagos, Nigeria | john@email.com

EXPERIENCE
Frontend Developer, TechCorp (2022-present)
- Built React dashboards used by 5000 users
- Worked with TypeScript and Tailwind

Junior Developer, StartupXYZ (2020-2022)
- Fixed bugs, wrote some tests

SKILLS
JavaScript, React, HTML, CSS

EDUCATION
BSc Computer Science, University of Lagos, 2020
`;

const sampleJD = `
Senior Frontend Engineer
We need a React expert with strong TypeScript, Next.js,
state management, testing (Jest), and CI/CD experience.
5+ years preferred.
`;

async function main() {
  console.log("1. Detecting field...");
  const field = await detectField(sampleCV);
  console.log(field);

  console.log("\n2. Scoring against job...");
  const score = await scoreCV(sampleCV, sampleJD, field);
  console.log(score);

  console.log("\n3. Rewriting for US...");
  const rewritten = await rewriteCV(sampleCV, sampleJD, "US", field);
  console.log(rewritten);
}

main().catch(console.error);