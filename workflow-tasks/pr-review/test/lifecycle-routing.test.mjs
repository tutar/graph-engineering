import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { enforceManualPullRequestState, planReviewRun, routeReviewEvent } from "../files/.github/loop-engineering/route-review.mjs";
import profile from "../files/.github/loop-engineering/codex-compatibility-profile.json" with { type: "json" };
import config from "../files/.github/loop-engineering/pr-review-config.json" with { type: "json" };

const execute = promisify(execFile);
const router = new URL("../files/.github/loop-engineering/route-review.mjs", import.meta.url).pathname;

for (const action of ["opened", "reopened", "synchronize", "ready_for_review"]) {
  test(`a ready pull request ${action} event starts a fresh review`, () => {
    assert.deepEqual(routeReviewEvent({
      eventName: "pull_request",
      event: { action, pull_request: { number: 42, draft: false } },
    }), { shouldStart: true, pullRequestNumber: 42, reason: "supported-pull-request-event" });
  });
}

test("draft pull request events stay quiet until ready_for_review", () => {
  assert.deepEqual(routeReviewEvent({
    eventName: "pull_request",
    event: { action: "synchronize", pull_request: { number: 42, draft: true } },
  }), { shouldStart: false, pullRequestNumber: 42, reason: "draft-pull-request" });
  assert.equal(routeReviewEvent({
    eventName: "pull_request",
    event: { action: "ready_for_review", pull_request: { number: 42, draft: false } },
  }).shouldStart, true);
});

test("manual dispatch enters the same review path", () => {
  assert.deepEqual(routeReviewEvent({
    eventName: "workflow_dispatch",
    event: { inputs: { pull_request_number: "42" } },
  }), { shouldStart: true, pullRequestNumber: 42, reason: "manual-dispatch" });
});

test("manual dispatch obeys trusted current PR state and fails closed", async () => {
  const planned = planReviewRun({
    eventName: "workflow_dispatch",
    event: { inputs: { pull_request_number: "42" } },
    config,
    profile,
  });
  assert.equal((await enforceManualPullRequestState(planned, { repository: "acme/widgets", request: async () => ({ state: "open", draft: false }) })).shouldStart, true);
  assert.deepEqual(
    pick(await enforceManualPullRequestState(planned, { repository: "acme/widgets", request: async () => ({ state: "open", draft: true }) })),
    { shouldStart: false, reason: "draft-pull-request" },
  );
  assert.deepEqual(
    pick(await enforceManualPullRequestState(planned, { repository: "acme/widgets", request: async () => ({ state: "closed", draft: false }) })),
    { shouldStart: false, reason: "manual-pull-request-not-open" },
  );
  assert.deepEqual(
    pick(await enforceManualPullRequestState(planned, { repository: "acme/widgets", request: async () => { throw new Error("unreadable"); } })),
    { shouldStart: false, reason: "manual-pull-request-unreadable" },
  );
});

test("unsupported events do not start a review", () => {
  assert.equal(routeReviewEvent({
    eventName: "pull_request",
    event: { action: "closed", pull_request: { number: 42, draft: false } },
  }).shouldStart, false);
  assert.equal(routeReviewEvent({ eventName: "push", event: {} }).shouldStart, false);
});

test("the production router adapter covers lifecycle, draft-to-ready, and manual reruns", async () => {
  const cases = [
    ["pull_request", { action: "opened", pull_request: { number: 1, draft: false } }, true],
    ["pull_request", { action: "reopened", pull_request: { number: 2, draft: false } }, true],
    ["pull_request", { action: "synchronize", pull_request: { number: 3, draft: false } }, true],
    ["pull_request", { action: "synchronize", pull_request: { number: 4, draft: true } }, false],
    ["pull_request", { action: "ready_for_review", pull_request: { number: 4, draft: false } }, true],
    ["pull_request", { action: "closed", pull_request: { number: 5, draft: false } }, false],
  ];

  for (const [eventName, event, expected] of cases) {
    const directory = await mkdtemp(join(tmpdir(), "pr-review-route-"));
    try {
      const eventPath = join(directory, "event.json");
      const outputPath = join(directory, "output");
      await writeFile(eventPath, JSON.stringify(event));
      await execute(process.execPath, [router], {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: eventName,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: outputPath,
        },
      });
      const output = await readFile(outputPath, "utf8");
      assert.match(output, new RegExp(`should_start<<[^\\n]+\\n${expected}\\n`));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("the production manual router reads Draft state from a fake GitHub API", async () => {
  for (const [draft, expected] of [[true, false], [false, true]]) {
    const directory = await mkdtemp(join(tmpdir(), "pr-review-manual-route-"));
    const server = createServer((request, response) => {
      assert.equal(request.url, "/repos/acme/widgets/pulls/6");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ state: "open", draft }));
    });
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address();
      const eventPath = join(directory, "event.json");
      const outputPath = join(directory, "output");
      await writeFile(eventPath, JSON.stringify({ inputs: { pull_request_number: "6" } }));
      await execute(process.execPath, [router], {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: outputPath,
          GITHUB_REPOSITORY: "acme/widgets",
          GITHUB_API_URL: `http://127.0.0.1:${port}`,
          GH_TOKEN: "test-token",
        },
      });
      const output = await readFile(outputPath, "utf8");
      assert.match(output, new RegExp(`should_start<<[^\\n]+\\n${expected}\\n`));
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  }
});

function pick(value) {
  return { shouldStart: value.shouldStart, reason: value.reason };
}
