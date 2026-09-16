import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { mapActionExecution } from "../files/.github/loop-engineering/pr-review-case.mjs";

const execute = promisify(execFile);
const scripts = new URL("../files/.github/loop-engineering/", import.meta.url);
const target = {
  repository: "acme/widgets",
  number: 42,
  baseSha: "base-123",
  headSha: "head-456",
};
const completedOutput = {
  repository: target.repository,
  pullRequestNumber: target.number,
  baseSha: target.baseSha,
  headSha: target.headSha,
  standards: { verdict: "pass", findings: [] },
  spec: { verdict: "pass", findings: [] },
};

test("Action and Goal outcomes have explicit terminal mappings", () => {
  assert.equal(mapActionExecution({
    actionOutcome: "success",
    finalMessage: JSON.stringify(completedOutput),
  }, target).terminal, "completed");
  assert.equal(mapActionExecution({
    actionOutcome: "success",
    finalMessage: JSON.stringify({
      repository: target.repository,
      pullRequestNumber: target.number,
      baseSha: target.baseSha,
      headSha: target.headSha,
      handoff: { summary: "The requested specification is unavailable." },
    }),
  }, target).terminal, "handoff");
  assert.equal(mapActionExecution({ actionOutcome: "failure", finalMessage: "" }, target).terminal, "failed");
  assert.equal(mapActionExecution({ actionOutcome: "cancelled", finalMessage: "" }, target).terminal, "cancelled");
});

test("empty, malformed, incomplete, mismatched, and spoofed output fails closed", () => {
  const cases = [
    ["empty", ""],
    ["malformed", "not-json"],
    ["missing-axis", JSON.stringify({ ...completedOutput, spec: undefined })],
    ["mismatched-target", JSON.stringify({ ...completedOutput, headSha: "attacker-sha" })],
    ["spoofed-publication", JSON.stringify({ ...completedOutput, published: true })],
  ];

  for (const [name, finalMessage] of cases) {
    const execution = mapActionExecution({ actionOutcome: "success", finalMessage }, target);
    assert.equal(execution.terminal, "failed", name);
    assert.match(execution.diagnostic, /candidate-output/i, name);
    assert.equal(execution.review, undefined, name);
  }
});

test("a failed upstream execution cannot cause a Check write", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pr-review-failure-"));
  const artifact = join(directory, "pr-review-artifact");
  await mkdir(artifact);
  await writeFile(join(artifact, "review-execution.json"), JSON.stringify({
    terminal: "failed",
    diagnostic: "candidate-output: malformed JSON",
  }));

  let requestCount = 0;
  const server = createServer((_request, response) => {
    requestCount += 1;
    response.statusCode = 500;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await assert.rejects(execute(process.execPath, [new URL("publish-review.mjs", scripts).pathname], {
      cwd: directory,
      env: {
        ...process.env,
        GH_TOKEN: "publisher-token",
        GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
        UPSTREAM_RESULT: "failure",
      },
    }), /candidate-output: malformed JSON/);
    assert.equal(requestCount, 0);
    assert.match(await readFile(join(directory, "review-diagnostic.md"), "utf8"), /No Check Run was published/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("the trusted publisher rejects invalid artifacts before any GitHub request", async () => {
  const invalidReviews = [
    ["empty", ""],
    ["malformed", "not-json"],
    ["missing-axis", JSON.stringify({ ...completedOutput, spec: undefined, runtime: { terminal: "completed", summary: "done" } })],
    ["mismatched-target", JSON.stringify({ ...completedOutput, headSha: "attacker-sha", runtime: { terminal: "completed", summary: "done" } })],
    ["spoofed-publication", JSON.stringify({ ...completedOutput, published: true, runtime: { terminal: "completed", summary: "done" } })],
  ];
  let requestCount = 0;
  const server = createServer((_request, response) => {
    requestCount += 1;
    response.statusCode = 500;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    for (const [name, review] of invalidReviews) {
      const directory = await mkdtemp(join(tmpdir(), `pr-review-${name}-`));
      const artifact = join(directory, "pr-review-artifact");
      await mkdir(artifact);
      await writeFile(join(artifact, "pr-review-target.json"), JSON.stringify(target));
      await writeFile(join(artifact, "review-result.json"), review);
      await assert.rejects(execute(process.execPath, [new URL("publish-review.mjs", scripts).pathname], {
        cwd: directory,
        env: {
          ...process.env,
          GH_TOKEN: "publisher-token",
          GITHUB_API_URL: `http://127.0.0.1:${server.address().port}`,
          UPSTREAM_RESULT: "success",
        },
      }), undefined, name);
      assert.match(await readFile(join(directory, "review-diagnostic.md"), "utf8"), /No Check Run was published/, name);
      await rm(directory, { recursive: true, force: true });
    }
    assert.equal(requestCount, 0);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
