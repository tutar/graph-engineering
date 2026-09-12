import { readFile } from "node:fs/promises";

import { buildCheck } from "./pr-review-case.mjs";

const target = JSON.parse(await readFile("pr-review-artifact/pr-review-target.json", "utf8"));
const review = JSON.parse(await readFile("pr-review-artifact/review-result.json", "utf8"));
const check = buildCheck(review, target);

const current = await github(`/repos/${target.repository}/pulls/${target.number}`);
if (current.head.sha !== target.headSha) throw new Error("stale-target: PR head changed before publication");

const summary = [
  `Standards: ${review.standards.verdict}`,
  ...review.standards.findings.map((finding) => `- ${finding}`),
  `Spec: ${review.spec.verdict}`,
  ...review.spec.findings.map((finding) => `- ${finding}`),
  `Runtime: ${review.runtime.summary}`,
].join("\n");
await github(`/repos/${target.repository}/check-runs`, {
  method: "POST",
  body: {
    name: check.name,
    head_sha: check.headSha,
    status: "completed",
    conclusion: check.conclusion,
    output: { title: "PR Review", summary },
  },
});

async function github(path, options = {}) {
  const response = await fetch(`${process.env.GITHUB_API_URL ?? "https://api.github.com"}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${required("GH_TOKEN")}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(`GitHub API ${path} returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
