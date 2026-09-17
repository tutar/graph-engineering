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
  const checks = await readCheckHistory(target, check.name);
  const publication = planCheckPublication({ target, existingChecks: checks, checkName: check.name });

  // History queries can take multiple requests. Recheck freshness before writing.
  const beforeWrite = await githubRequest(`/repos/${target.repository}/pulls/${target.number}`);
  if (beforeWrite.head.sha !== target.headSha) throw new Error("stale-target: PR head changed before publication");

  // Nonsecret audit signal: never print tokens, headers or Agent contents.
  console.log(JSON.stringify({
    publicationMethod: publication.method,
    externalId: publication.externalId,
    existingCheckId: publication.method === "PATCH" ? Number(publication.path.split("/").at(-1)) : null,
    historyCount: checks.length,
  }));

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

async function readCheckHistory(target, name) {
  const history = [];
  const ids = new Set();
  for (let page = 1; page <= 100; page += 1) {
    const response = await githubRequest(
      `/repos/${target.repository}/commits/${target.headSha}/check-runs?check_name=${encodeURIComponent(name)}&filter=all&per_page=100&page=${page}`,
    );
    if (!Array.isArray(response.check_runs) || response.check_runs.length > 100) {
      throw new Error("check-history: malformed Check listing");
    }
    for (const check of response.check_runs) {
      if (!Number.isSafeInteger(check?.id) || check.id <= 0 || ids.has(check.id)) {
        throw new Error("check-history: invalid or repeated Check ID across pages");
      }
      if (typeof check.name !== "string" || !check.name
        || check.head_sha !== target.headSha
        || !(check.external_id === null || typeof check.external_id === "string")) {
        throw new Error("check-history: incomplete or mismatched Check identity fields");
      }
      ids.add(check.id);
      history.push(check);
    }
    if (response.check_runs.length < 100) return history;
  }
  // Never interpret incomplete history as absence or create a new Check.
  throw new Error("check-history: pagination limit reached before complete listing");
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
