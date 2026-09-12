import { writeFile } from "node:fs/promises";

import { formGoalPrompt } from "./pr-review-case.mjs";

const repository = required("GITHUB_REPOSITORY");
const pullRequestNumber = Number.parseInt(required("PULL_REQUEST_NUMBER"), 10);
if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) throw new Error("PULL_REQUEST_NUMBER must be positive");

const response = await fetch(`${process.env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${repository}/pulls/${pullRequestNumber}`, {
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${required("GH_TOKEN")}`,
    "X-GitHub-Api-Version": "2022-11-28",
  },
});
if (!response.ok) throw new Error(`Could not read PR facts: GitHub returned ${response.status}`);
const pull = await response.json();
const target = {
  repository,
  number: pullRequestNumber,
  baseSha: pull.base.sha,
  headSha: pull.head.sha,
};

await writeFile("pr-review-target.json", `${JSON.stringify(target, null, 2)}\n`);
await writeFile("pr-review-context.md", [
  `# PR #${pullRequestNumber}: ${pull.title}`,
  "",
  pull.body || "No pull request description was provided.",
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
