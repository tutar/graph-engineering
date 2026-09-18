import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const taskRoot = new URL("../", import.meta.url);
const installRoot = new URL("../.github/", import.meta.url);

test("the current Development Task is a complete copy-owned file set", async () => {
  const workflow = await readFile(new URL("workflows/github-development-ticket.yml", installRoot), "utf8");
  assert.match(workflow, /^name: Graph Engineering - GitHub Development Ticket$/m);

  const supportFiles = (await readdir(new URL("graph-engineering/", installRoot))).sort();
  assert.deepEqual(supportFiles, ["coding-task-control.mjs", "coding-task-repository.sh", "development-worktree.sh"]);
});

test("the current Coding Task is a separate copy-owned Candidate", async () => {
  const workflow = await readFile(new URL("workflows/github-coding-task.yml", installRoot), "utf8");
  assert.match(workflow, /^name: Graph Engineering - GitHub Coding Task$/m);
  assert.match(workflow, /coding-ticket/);
  assert.doesNotMatch(workflow, /development-ticket/);
});

test("current behavior tests import production files from the current task", async () => {
  const tests = (await readdir(new URL("test/", taskRoot)))
    .filter((path) => path.endsWith(".test.mjs") && path !== "current-layout.test.mjs");
  assert.notEqual(tests.length, 0);

  for (const filename of tests) {
    const source = await readFile(new URL(`test/${filename}`, taskRoot), "utf8");
    assert.doesNotMatch(source, /workflow-definitions\/github-development-ticket/);
  }
});
