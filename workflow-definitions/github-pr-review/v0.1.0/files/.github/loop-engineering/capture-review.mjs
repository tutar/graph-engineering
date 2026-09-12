import { writeFile } from "node:fs/promises";

import { parseSuccessfulResult } from "./pr-review-case.mjs";

const target = JSON.parse(process.env.TRUSTED_TARGET);
const review = parseSuccessfulResult({
  terminal: "completed",
  finalMessage: process.env.FINAL_MESSAGE,
  summary: "openai/codex-action completed and returned final-message.",
}, target);

await writeFile("review-result.json", `${JSON.stringify(review, null, 2)}\n`);
