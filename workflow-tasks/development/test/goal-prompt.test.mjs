import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controller = readFileSync(
  new URL("../files/.github/loop-engineering/github-development-ticket.mjs", import.meta.url),
  "utf8",
);

test("Goal Prompt requires evidence-based Acceptance Criteria updates", () => {
  assert.match(controller, /逐项依据实际验证结果/);
  assert.match(controller, /只将已满足项的复选框更新为已勾选/);
  assert.match(controller, /适用时的验收条件状态同步都完成后才能结束 Goal/);
});
