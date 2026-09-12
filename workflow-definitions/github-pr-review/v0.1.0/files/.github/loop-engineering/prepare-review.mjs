import { writeFile } from "node:fs/promises";

import { githubRequest } from "./github-api.mjs";
import { formGoalPrompt } from "./pr-review-case.mjs";

const repository = required("GITHUB_REPOSITORY");
const pullRequestNumber = Number.parseInt(required("PULL_REQUEST_NUMBER"), 10);
if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) throw new Error("PULL_REQUEST_NUMBER must be positive");

const pull = await githubRequest(`/repos/${repository}/pulls/${pullRequestNumber}`);
const checks = await githubRequest(`/repos/${repository}/commits/${pull.head.sha}/check-runs`);
const target = {
  repository,
  number: pullRequestNumber,
  baseSha: pull.base.sha,
  headSha: pull.head.sha,
  baseRef: pull.base.ref,
  headRef: pull.head.ref,
};

await writeFile("pr-review-target.json", `${JSON.stringify(target, null, 2)}\n`);
await writeFile("pr-review-context.md", [
  `# PR #${pullRequestNumber}: ${pull.title}`,
  "",
  pull.body || "No pull request description was provided.",
  "",
  `Base branch: ${target.baseRef}`,
  `Head branch: ${target.headRef}`,
  `Existing Checks on head: ${(checks.check_runs ?? []).map((check) => `${check.name}=${check.conclusion ?? check.status}`).join(", ") || "none"}`,
  "",
].join("\n"));
await writeFile("pr-review-goal.md", `${formGoalPrompt({
  eventPrompt: required("EVENT_PROMPT"),
  pullRequest: target,
})}\n`);
if (process.env.GITHUB_OUTPUT) {
  await writeFile(process.env.GITHUB_OUTPUT, [
    `base_sha=${target.baseSha}`,
    `head_sha=${target.headSha}`,
    `target_json=${JSON.stringify(target)}`,
    "",
  ].join("\n"), { flag: "a" });
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
