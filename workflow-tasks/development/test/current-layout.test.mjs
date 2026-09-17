import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const taskRoot = new URL("../", import.meta.url);
const installRoot = new URL("../files/.github/", import.meta.url);

test("the current Development Task is a complete copy-owned file set", async () => {
  const workflow = await readFile(new URL("workflows/github-development-ticket.yml", installRoot), "utf8");
  assert.match(workflow, /^name: Loop Engineering - GitHub Development Ticket$/m);

  const controllerFiles = (await readdir(new URL("loop-engineering/", installRoot))).sort();
  assert.deepEqual(controllerFiles, [
    "development-worktree.sh",
    "github-development-ticket.mjs",
    "stop-hook-drain.mjs",
    "thread-record.mjs",
  ]);
});

test("current behavior tests import production files from the current task", async () => {
  const tests = (await readdir(new URL("test/", taskRoot)))
    .filter((path) => path.endsWith(".test.mjs") && path !== "current-layout.test.mjs");
  assert.notEqual(tests.length, 0);

  for (const filename of tests) {
    const source = await readFile(new URL(`test/${filename}`, taskRoot), "utf8");
    assert.doesNotMatch(source, /workflow-definitions\/github-development-ticket/);
  }

  await access(new URL("loop-engineering/github-development-ticket.mjs", installRoot));
});
