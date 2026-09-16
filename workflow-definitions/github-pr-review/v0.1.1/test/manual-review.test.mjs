import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const scripts = new URL("../files/.github/loop-engineering/", import.meta.url);

test("the manual Workflow Instance runs a controlled Action and publishes its trusted Check", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pr-review-case-"));
  const requests = [];
  let pullRequestReads = 0;
  let checkReads = 0;
  let currentHead = "head-456";
  let headRepository = "acme/widgets";
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/repos/acme/widgets/pulls/42") {
      pullRequestReads += 1;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        title: "Add the widget contract",
        body: "Closes #41 and preserves the public API.",
        base: { sha: "base-123", ref: "main" },
        head: { sha: currentHead, ref: "feature/widget", repo: { full_name: headRepository } },
      }));
      return;
    }
    if (request.method === "GET" && request.url.startsWith("/repos/acme/widgets/commits/") && request.url.includes("/check-runs")) {
      checkReads += 1;
      const isOriginalHead = request.url.includes("/commits/head-456/check-runs");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        check_runs: [
          { name: "tests", conclusion: "success" },
          ...(isOriginalHead ? requests.filter((write) => write.body.external_id).map((write) => ({
            id: 7,
            name: write.body.name,
            head_sha: "head-456",
            external_id: write.body.external_id,
          })) : []),
        ],
      }));
      return;
    }
    if (
      (request.method === "POST" && request.url === "/repos/acme/widgets/check-runs")
      || (request.method === "PATCH" && request.url === "/repos/acme/widgets/check-runs/7")
    ) {
      let body = "";
      for await (const chunk of request) body += chunk;
      requests.push({ method: request.method, body: JSON.parse(body) });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ id: 7 }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const apiUrl = `http://127.0.0.1:${server.address().port}`;
  const commonEnv = { ...process.env, GH_TOKEN: "test-token", GITHUB_API_URL: apiUrl };

  try {
    await execute(process.execPath, [new URL("prepare-review.mjs", scripts).pathname], {
      cwd: directory,
      env: {
        ...commonEnv,
        GITHUB_REPOSITORY: "acme/widgets",
        PULL_REQUEST_NUMBER: "42",
        EVENT_PROMPT: "Review this change against repository rules.",
        GITHUB_OUTPUT: join(directory, "github-output"),
      },
    });
    const goal = await readFile(join(directory, "pr-review-goal.md"), "utf8");
    assert.match(goal, /PR #42/);
    assert.match(goal, /base-123/);
    assert.match(goal, /head-456/);
    assert.match(goal, /Completion Condition/);
    assert.match(goal, /Standards/);
    assert.match(goal, /Spec/);
    assert.match(goal, /code-review/);
    const context = await readFile(join(directory, "pr-review-context.md"), "utf8");
    assert.match(context, /Base branch: main/);
    assert.match(context, /Head branch: feature\/widget/);
    assert.match(context, /tests=success/);

    const target = JSON.parse(await readFile(join(directory, "pr-review-target.json"), "utf8"));
    const controlledFinalMessage = JSON.stringify({
      repository: target.repository,
      pullRequestNumber: target.number,
      baseSha: target.baseSha,
      headSha: target.headSha,
      standards: { verdict: "pass", findings: [] },
      spec: { verdict: "pass", findings: [] },
    });
    await execute(process.execPath, [new URL("capture-review.mjs", scripts).pathname], {
      cwd: directory,
      env: { ...commonEnv, FINAL_MESSAGE: controlledFinalMessage, TRUSTED_TARGET: JSON.stringify(target) },
    });

    const artifact = join(directory, "pr-review-artifact");
    await mkdir(artifact);
    await copyFile(join(directory, "pr-review-target.json"), join(artifact, "pr-review-target.json"));
    await copyFile(join(directory, "review-result.json"), join(artifact, "review-result.json"));
    await execute(process.execPath, [new URL("publish-review.mjs", scripts).pathname], {
      cwd: directory,
      env: commonEnv,
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].body.name, "Loop Engineering / PR Review");
    assert.equal(requests[0].body.head_sha, "head-456");
    assert.equal(requests[0].body.conclusion, "success");
    assert.match(requests[0].body.output.summary, /Standards: pass/);
    assert.match(requests[0].body.output.summary, /Spec: pass/);
    const captured = JSON.parse(await readFile(join(directory, "review-result.json"), "utf8"));
    assert.equal(captured.runtime.terminal, "completed");
    assert.match(captured.runtime.summary, /openai\/codex-action/);

    await execute(process.execPath, [new URL("publish-review.mjs", scripts).pathname], {
      cwd: directory,
      env: commonEnv,
    });
    assert.equal(requests[1].method, "PATCH");
    assert.equal(requests[1].body.external_id, requests[0].body.external_id);
    assert.equal("head_sha" in requests[1].body, false);

    currentHead = "head-789";
    await assert.rejects(
      execute(process.execPath, [new URL("publish-review.mjs", scripts).pathname], {
        cwd: directory,
        env: commonEnv,
      }),
      /stale-target/,
    );
    assert.equal(requests.length, 2, "stale results never write a Check");

    await execute(process.execPath, [new URL("prepare-review.mjs", scripts).pathname], {
      cwd: directory,
      env: {
        ...commonEnv,
        GITHUB_REPOSITORY: "acme/widgets",
        PULL_REQUEST_NUMBER: "42",
        EVENT_PROMPT: "Review this change against repository rules.",
      },
    });
    const newTarget = JSON.parse(await readFile(join(directory, "pr-review-target.json"), "utf8"));
    await execute(process.execPath, [new URL("capture-review.mjs", scripts).pathname], {
      cwd: directory,
      env: {
        ...commonEnv,
        TRUSTED_TARGET: JSON.stringify(newTarget),
        FINAL_MESSAGE: JSON.stringify({
          repository: newTarget.repository,
          pullRequestNumber: newTarget.number,
          baseSha: newTarget.baseSha,
          headSha: newTarget.headSha,
          standards: { verdict: "pass", findings: [] },
          spec: { verdict: "pass", findings: [] },
        }),
      },
    });
    await copyFile(join(directory, "pr-review-target.json"), join(artifact, "pr-review-target.json"));
    await copyFile(join(directory, "review-result.json"), join(artifact, "review-result.json"));
    await execute(process.execPath, [new URL("publish-review.mjs", scripts).pathname], {
      cwd: directory,
      env: commonEnv,
    });
    assert.equal(requests[2].method, "POST");
    assert.equal(requests[2].body.head_sha, "head-789");
    assert.notEqual(requests[2].body.external_id, requests[0].body.external_id);
    headRepository = "someone/widgets-fork";
    await assert.rejects(
      execute(process.execPath, [new URL("prepare-review.mjs", scripts).pathname], {
        cwd: directory,
        env: {
          ...commonEnv,
          GITHUB_REPOSITORY: "acme/widgets",
          PULL_REQUEST_NUMBER: "42",
          EVENT_PROMPT: "Review this change against repository rules.",
        },
      }),
      /same-repository/,
    );
    assert.equal(pullRequestReads, 7, "every preparation and publication rereads PR facts");
    assert.equal(checkReads, 5, "every preparation and fresh publication rereads Check facts");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
