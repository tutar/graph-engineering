import { writeFile } from "node:fs/promises";

import { mapActionExecution } from "./pr-review-case.mjs";

const target = JSON.parse(process.env.TRUSTED_TARGET);
const execution = mapActionExecution({
  actionOutcome: process.env.ACTION_OUTCOME ?? "success",
  finalMessage: process.env.FINAL_MESSAGE,
}, target);

await writeFile("review-execution.json", `${JSON.stringify(execution, null, 2)}\n`);
if (execution.review) await writeFile("review-result.json", `${JSON.stringify(execution.review, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) {
  await writeFile(process.env.GITHUB_OUTPUT, `terminal=${execution.terminal}\n`, { flag: "a" });
}
if (execution.terminal !== "completed") throw new Error(execution.diagnostic);
