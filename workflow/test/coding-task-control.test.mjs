import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  classifyAgentResult,
  classifyDelivery,
  deleteTaskWorkspace,
  needsLabelReconciliation,
  verifyDeliveryFacts,
} from "../.github/graph-engineering/coding-task-control.mjs";

test("result classifications keep machine, Agent and delivery conclusions distinct", () => {
  assert.equal(classifyAgentResult("failure", ""), "unavailable");
  assert.equal(classifyAgentResult("success", '{"status":"completed","summary":"done"}'), "completed");
  assert.equal(classifyAgentResult("success", '{"status":"blocked","summary":"wait"}'), "blocked");
  assert.throws(() => classifyAgentResult("success", '{"status":"other"}'), /completed or blocked/);
  assert.equal(classifyDelivery("blocked", "success"), "not-run");
  assert.equal(classifyDelivery("completed", "failure"), "failed");
  assert.equal(classifyDelivery("completed", "success"), "passed");
});

test("non-success after a claim always requests label reconciliation", () => {
  assert.equal(needsLabelReconciliation({ claim: "failure", delivery: "failed", labels: "", repository: "" }), false);
  assert.equal(needsLabelReconciliation({ claim: "success", delivery: "failed", labels: "", repository: "" }), true);
  assert.equal(needsLabelReconciliation({ claim: "success", delivery: "passed", labels: "failure", repository: "" }), true);
  assert.equal(needsLabelReconciliation({ claim: "success", delivery: "passed", labels: "success", repository: "failure" }), true);
  assert.equal(needsLabelReconciliation({ claim: "success", delivery: "passed", labels: "success", repository: "success" }), false);
});

test("delivery verification accepts only the four exact facts", () => {
  const calls = [];
  const responses = ["", "1", "abc", "abc\trefs/heads/agent/issue-70", '[{"url":"u","isDraft":true,"state":"OPEN"}]'];
  verifyDeliveryFacts({
    cwd: "/fixture",
    repository: "owner/repo",
    baseBranch: "main",
    targetBranch: "agent/issue-70",
    run(command, args) {
      calls.push([command, args]);
      return responses.shift();
    },
  });
  assert.deepEqual(calls.map(([command, args]) => [command, args.slice(0, 2)]), [
    ["git", ["status", "--porcelain"]],
    ["git", ["rev-list", "--count"]],
    ["git", ["rev-parse", "HEAD"]],
    ["git", ["ls-remote", "origin"]],
    ["gh", ["pr", "list"]],
  ]);
});

test("task workspace deletion is bounded and fail-closed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "coding-task-cleanup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "identity", "workspace");
  await mkdir(join(workspace, ".git"), { recursive: true });
  await writeFile(join(workspace, "work.txt"), "recoverable\n");
  assert.throws(() => deleteTaskWorkspace(root, root), /refusing to delete/);
  assert.equal(await readFile(join(workspace, "work.txt"), "utf8"), "recoverable\n");
  deleteTaskWorkspace(root, workspace);
  await assert.rejects(readFile(join(workspace, "work.txt")), /ENOENT/);
});
