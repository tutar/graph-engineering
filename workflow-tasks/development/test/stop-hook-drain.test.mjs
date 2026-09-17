import assert from "node:assert/strict";
import test from "node:test";

import {
  STOP_HOOK_WAIT_TIMEOUT_MS,
  expireStopHookTimeouts,
  shouldAwaitStopHooks,
} from "../files/.github/loop-engineering/stop-hook-drain.mjs";

test("Stop hook waits have a one-minute upper bound", () => {
  assert.equal(STOP_HOOK_WAIT_TIMEOUT_MS, 60_000);
});

test("only expired Stop hook waits are removed", () => {
  const awaiting = new Map([
    ["expired-turn", 1_000],
    ["pending-turn", 2_001],
  ]);

  assert.deepEqual(expireStopHookTimeouts(awaiting, 2_000), ["expired-turn"]);
  assert.deepEqual([...awaiting], [["pending-turn", 2_001]]);
});

test("only Turns in the Goal Thread wait for its Stop hooks", () => {
  assert.equal(shouldAwaitStopHooks({
    turnThreadId: "goal-thread",
    goalThreadId: "goal-thread",
    completedHookCount: 0,
    configuredHookCount: 1,
  }), true);
  assert.equal(shouldAwaitStopHooks({
    turnThreadId: "subagent-thread",
    goalThreadId: "goal-thread",
    completedHookCount: 0,
    configuredHookCount: 1,
  }), false);
  assert.equal(shouldAwaitStopHooks({
    turnThreadId: "goal-thread",
    goalThreadId: "goal-thread",
    completedHookCount: 1,
    configuredHookCount: 1,
  }), false);
});
