import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the current static gate covers the task contract without claiming Consumer validation", () => {
  const gate = read("../CANDIDATE-GATE.md");
  for (const category of [
    "routing", "Goal Prompt", "mapping", "runner and authentication", "Action and CLI pin",
    "permissions", "validation", "SHA freshness", "idempotency", "fail-closed", "Check", "Fresh Goal Run", "concurrency",
  ]) assert.match(gate, new RegExp(category, "i"), category);
  assert.match(gate, /PASS for current-layout implementation only/);
  assert.match(gate, /Candidate frozen at v0\.3\.0.*no Stable Supported Profile/i);
  assert.match(gate, /Fake Action.*不证明真实 Consumer compatibility/s);
  assert.match(gate, /历史 Evidence 也不证明当前实现已通过真实 Consumer 验证/);
});

test("the current task carries every runtime asset in its own copyable tree", () => {
  assert.deepEqual(readdirSync(new URL("../files/.github/graph-engineering/", import.meta.url)).sort(), [
    "capture-review.mjs",
    "check-publication.mjs",
    "codex-compatibility-profile.json",
    "codex-compatible-executor.mjs",
    "github-api.mjs",
    "pr-review-case.mjs",
    "pr-review-config.json",
    "pr-review-contract.mjs",
    "prepare-review.mjs",
    "publish-review.mjs",
    "review-result.schema.json",
    "route-review.mjs",
  ]);
  assert.deepEqual(readdirSync(new URL("../files/.github/workflows/", import.meta.url)), ["github-pr-review.yml"]);
});
