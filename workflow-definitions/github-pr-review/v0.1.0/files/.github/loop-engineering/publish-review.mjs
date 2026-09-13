import { readFile, writeFile } from "node:fs/promises";

import { githubRequest } from "./github-api.mjs";
import { loadBundledCompatibility } from "./codex-compatible-executor.mjs";
import { planCheckPublication } from "./check-publication.mjs";
import { buildCheck } from "./pr-review-case.mjs";

try {
  await publish();
} catch (error) {
  await writeDiagnostic(error.message);
  throw error;
}

async function publish() {
  const compatible = await loadBundledCompatibility();
  const upstreamResult = process.env.UPSTREAM_RESULT ?? "success";
  if (upstreamResult !== "success") {
    const execution = await readOptionalJson("pr-review-artifact/review-execution.json");
    throw new Error(execution?.diagnostic ?? `upstream-review: review job ended with ${upstreamResult}`);
  }

  const target = JSON.parse(await readFile("pr-review-artifact/pr-review-target.json", "utf8"));
  const review = JSON.parse(await readFile("pr-review-artifact/review-result.json", "utf8"));
  const check = buildCheck(review, target, compatible.check);

  const current = await githubRequest(`/repos/${target.repository}/pulls/${target.number}`);
  if (current.head.sha !== target.headSha) throw new Error("stale-target: PR head changed before publication");
  const checks = await githubRequest(
    `/repos/${target.repository}/commits/${target.headSha}/check-runs?check_name=${encodeURIComponent(check.name)}&filter=latest&per_page=100`,
  );
  const publication = planCheckPublication({ target, existingChecks: checks.check_runs ?? [], checkName: check.name });

  const summary = [
  `Standards: ${review.standards.verdict}`,
  ...review.standards.findings.map((finding) => `- ${finding}`),
  `Spec: ${review.spec.verdict}`,
  ...review.spec.findings.map((finding) => `- ${finding}`),
  `Runtime: ${review.runtime.summary}`,
  ].join("\n");
  const body = {
  name: check.name,
  external_id: publication.externalId,
  status: "completed",
  conclusion: check.conclusion,
  output: { title: check.title, summary },
  };
  if (publication.method === "POST") body.head_sha = check.headSha;

  await githubRequest(publication.path, { method: publication.method, body });
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeDiagnostic(message) {
  const text = `## PR Review diagnostic\n\n${message}\n\nNo Check Run was published.\n`;
  await writeFile("review-diagnostic.md", text);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, text, { flag: "a" });
}
