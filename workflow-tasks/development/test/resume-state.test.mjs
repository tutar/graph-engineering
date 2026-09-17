import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controller = readFileSync(
  new URL("../files/.github/loop-engineering/github-development-ticket.mjs", import.meta.url),
  "utf8",
);

test("a terminal Goal is observed as active before requesting resume", () => {
  const resizeBudget = controller.indexOf('request("thread/goal/set", { threadId, tokenBudget })');
  const activateLocally = controller.indexOf('goal = { ...goal, status: "active" };');
  const requestResume = controller.indexOf('request("thread/goal/set", { threadId, status: "active" })');
  assert.notEqual(resizeBudget, -1);
  assert.notEqual(activateLocally, -1);
  assert.notEqual(requestResume, -1);
  assert.ok(resizeBudget < activateLocally);
  assert.ok(activateLocally < requestResume);
});

test("controller drains configured Stop hooks before closing app-server", () => {
  assert.match(controller, /request\("hooks\/list", \{ cwds: \[process\.cwd\(\)\] \}\)/);
  assert.match(controller, /message\.method === "hook\/completed"/);
  assert.match(controller, /message\.params\.run\.eventName === "stop"/);
  assert.match(controller, /expireStopHookTimeouts\(awaitingStopHooks\)/);
  assert.match(controller, /STOP_HOOK_TIMEOUT/);
  assert.match(controller, /awaitingStopHooks\.size === 0/);
});

test("controller grants the Runner Node executable to the sandbox", () => {
  assert.match(controller, /const nodeExecutable = resolveExecutable\("node"\)/);
  assert.match(controller, /JSON\.stringify\(nodeExecutable\).*="read"/);
});

test("workflow cancellation interrupts active Turns and drains their Stop hooks", () => {
  assert.match(controller, /process\.on\("SIGINT", requestCancellation\)/);
  assert.match(controller, /process\.on\("SIGTERM", requestCancellation\)/);
  assert.match(controller, /request\("turn\/interrupt", \{ threadId: activeThreadId, turnId \}\)/);
  assert.match(controller, /CANCEL_DRAINED/);
});
