import { readFile } from "node:fs/promises";

import { githubRequest } from "./github-api.mjs";
import { buildCheck } from "./pr-review-case.mjs";

const target = JSON.parse(await readFile("pr-review-artifact/pr-review-target.json", "utf8"));
const review = JSON.parse(await readFile("pr-review-artifact/review-result.json", "utf8"));
const check = buildCheck(review, target);

const current = await githubRequest(`/repos/${target.repository}/pulls/${target.number}`);
if (current.head.sha !== target.headSha) throw new Error("stale-target: PR head changed before publication");

const summary = [
  `Standards: ${review.standards.verdict}`,
  ...review.standards.findings.map((finding) => `- ${finding}`),
  `Spec: ${review.spec.verdict}`,
  ...review.spec.findings.map((finding) => `- ${finding}`),
  `Runtime: ${review.runtime.summary}`,
].join("\n");
await githubRequest(`/repos/${target.repository}/check-runs`, {
  method: "POST",
  body: {
    name: check.name,
    head_sha: check.headSha,
    status: "completed",
    conclusion: check.conclusion,
    output: { title: "PR Review", summary },
  },
});
