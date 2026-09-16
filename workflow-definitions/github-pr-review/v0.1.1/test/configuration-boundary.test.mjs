import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { resolveCompatibleExecution } from "../files/.github/loop-engineering/codex-compatible-executor.mjs";
import { buildCheck } from "../files/.github/loop-engineering/pr-review-case.mjs";
import { planReviewRun, routeReviewEvent } from "../files/.github/loop-engineering/route-review.mjs";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const config = readJson("../files/.github/loop-engineering/pr-review-config.json");
const profile = readJson("../files/.github/loop-engineering/codex-compatibility-profile.json");
const execute = promisify(execFile);
const bundledScripts = fileURLToPath(new URL("../files/.github/loop-engineering/", import.meta.url));

test("allowed Consumer configuration resolves through the locked Codex profile", () => {
  const resolved = resolveCompatibleExecution({
    config: {
      ...config,
      events: { pullRequestActions: ["opened", "ready_for_review"], manualDispatch: false, includeDrafts: false },
      eventPrompt: "Review the public API and issue acceptance criteria.",
      codex: { ...config.codex, model: "gpt-5-codex", effort: "high" },
      check: { name: "Acme / PR Review", title: "Acme review" },
    },
    profile,
  });

  assert.deepEqual(resolved.runnerLabels, ["self-hosted", "Linux", "X64", "codex"]);
  assert.equal(resolved.eventPrompt, "Review the public API and issue acceptance criteria.");
  assert.deepEqual(resolved.action, {
    uses: "openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e",
    codexVersion: "0.153.4",
    model: "gpt-5-codex",
    effort: "high",
    permissionProfile: ":read-only",
    safetyStrategy: "read-only",
  });
  assert.deepEqual(resolved.check, { name: "Acme / PR Review", title: "Acme review" });
  assert.deepEqual(buildCheck({
    repository: "acme/widgets",
    pullRequestNumber: 42,
    baseSha: "base-123",
    headSha: "head-456",
    standards: { verdict: "pass", findings: [] },
    spec: { verdict: "pass", findings: [] },
    runtime: { terminal: "completed", summary: "done" },
  }, {
    repository: "acme/widgets", number: 42, baseSha: "base-123", headSha: "head-456",
  }, resolved.check).name, "Acme / PR Review");
  assert.equal(routeReviewEvent({
    eventName: "pull_request",
    event: { action: "synchronize", pull_request: { number: 42, draft: false } },
    eventConfiguration: resolved.events,
  }).shouldStart, false);
  assert.equal(routeReviewEvent({
    eventName: "workflow_dispatch",
    event: { inputs: { pull_request_number: "42" } },
    eventConfiguration: resolved.events,
  }).shouldStart, false);
});

test("missing configuration and forbidden override surfaces hand off", () => {
  const invalid = [
    ["missing", { ...config, eventPrompt: undefined }],
    ["action", { ...config, action: { source: "attacker/action" } }],
    ["revision", { ...config, revision: "main" }],
    ["provider", { ...config, provider: "other" }],
    ["capabilities", { ...config, capabilities: ["github-write"] }],
    ["runner", { ...config, runner: "ubuntu-24.04" }],
  ];
  for (const [name, candidate] of invalid) {
    assert.throws(() => resolveCompatibleExecution({ config: candidate, profile }), /configuration-handoff/, name);
    const planned = planReviewRun({
      eventName: "pull_request",
      event: { action: "opened", pull_request: { number: 42, draft: false } },
      config: candidate,
      profile,
    });
    assert.equal(planned.configurationStatus, "handoff", name);
    assert.equal(planned.shouldStart, false, name);
    assert.equal(planned.reason, "configuration-handoff", name);
    assert.match(planned.diagnostic, /configuration-handoff/, name);
  }
});

test("profile mismatch and weaker security never fall back", () => {
  assert.throws(() => resolveCompatibleExecution({
    config: { ...config, profile: "github-pr-review/other/v0.1.1" },
    profile,
  }), /configuration-handoff.*profile/i);
  assert.throws(() => resolveCompatibleExecution({
    config,
    profile: { ...profile, action: { ...profile.action, commit: "0000000000000000000000000000000000000000" } },
  }), /configuration-handoff.*commit/i);
  assert.throws(() => resolveCompatibleExecution({
    config: { ...config, codex: { ...config.codex, safetyStrategy: "unsafe" } },
    profile,
  }), /configuration-handoff.*safetyStrategy/i);
  assert.throws(() => resolveCompatibleExecution({
    config: { ...config, codex: { ...config.codex, permissionProfile: ":workspace" } },
    profile,
  }), /configuration-handoff.*permissionProfile/i);
});

test("production adapters cover allowed, missing, forbidden, and mismatched configuration", async () => {
  const allowed = {
    ...config,
    eventPrompt: "Review the configured API contract.",
    codex: { ...config.codex, model: "gpt-5-codex", effort: "high" },
    check: { name: "Acme / PR Review", title: "Acme review" },
  };
  const { eventPrompt: _missing, ...missing } = config;
  const cases = [
    ["allowed", allowed, profile, true],
    ["missing", missing, profile, false],
    ["forbidden", { ...config, provider: "other" }, profile, false],
    ["profile-mismatch", { ...config, profile: "github-pr-review/other/v0.1.1" }, profile, false],
  ];

  for (const [name, candidate, candidateProfile, shouldStart] of cases) {
    const directory = await mkdtemp(join(tmpdir(), `pr-review-config-${name}-`));
    const scripts = join(directory, "loop-engineering");
    try {
      await cp(bundledScripts, scripts, { recursive: true });
      await writeFile(join(scripts, "pr-review-config.json"), JSON.stringify(candidate));
      await writeFile(join(scripts, "codex-compatibility-profile.json"), JSON.stringify(candidateProfile));
      const eventPath = join(directory, "event.json");
      const outputPath = join(directory, "github-output");
      const summaryPath = join(directory, "summary.md");
      await writeFile(eventPath, JSON.stringify({ action: "opened", pull_request: { number: 42, draft: false } }));
      await execute(process.execPath, [await realpath(join(scripts, "route-review.mjs"))], {
        cwd: directory,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: outputPath,
          GITHUB_STEP_SUMMARY: summaryPath,
        },
      });
      const outputs = parseGithubOutputs(await readFile(outputPath, "utf8"));
      assert.equal(outputs.should_start, String(shouldStart), name);
      if (shouldStart) {
        assert.equal("runner" in outputs, false);
        assert.equal(outputs.event_prompt, "Review the configured API contract.");
        assert.equal(outputs.codex_model, "gpt-5-codex");
        assert.equal(outputs.codex_effort, "high");
        await assertConfiguredPublisher({ directory, scripts });
      } else {
        assert.equal(outputs.configuration_status, "handoff", name);
        assert.equal(outputs.reason, "configuration-handoff", name);
        assert.match(await readFile(summaryPath, "utf8"), /configuration-handoff/, name);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

async function assertConfiguredPublisher({ directory, scripts }) {
  const artifact = join(directory, "pr-review-artifact");
  await mkdir(artifact);
  const target = { repository: "acme/widgets", number: 42, baseSha: "base-123", headSha: "head-456" };
  await writeFile(join(artifact, "pr-review-target.json"), JSON.stringify(target));
  await writeFile(join(artifact, "review-result.json"), JSON.stringify({
    repository: target.repository,
    pullRequestNumber: target.number,
    baseSha: target.baseSha,
    headSha: target.headSha,
    standards: { verdict: "pass", findings: [] },
    spec: { verdict: "pass", findings: [] },
    runtime: { terminal: "completed", summary: "done" },
  }));
  const writes = [];
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/repos/acme/widgets/pulls/42") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ head: { sha: "head-456" } }));
      return;
    }
    if (request.method === "GET" && request.url.includes("/check-runs")) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ check_runs: [] }));
      return;
    }
    if (request.method === "POST" && request.url === "/repos/acme/widgets/check-runs") {
      let body = "";
      for await (const chunk of request) body += chunk;
      writes.push(JSON.parse(body));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ id: 1 }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await execute(process.execPath, [join(scripts, "publish-review.mjs")], {
      cwd: directory,
      env: {
        ...process.env,
        GH_TOKEN: "publisher-token",
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
        UPSTREAM_RESULT: "success",
      },
    });
    assert.equal(writes[0].name, "Acme / PR Review");
    assert.equal(writes[0].output.title, "Acme review");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function parseGithubOutputs(text) {
  const lines = text.split("\n");
  const outputs = {};
  for (let index = 0; index < lines.length;) {
    const [key, delimiter] = lines[index].split("<<");
    if (!delimiter) break;
    const end = lines.indexOf(delimiter, index + 1);
    outputs[key] = lines.slice(index + 1, end).join("\n");
    index = end + 1;
  }
  return outputs;
}
