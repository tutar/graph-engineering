import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { parseDocument } from "yaml";

const taskRoot = new URL("../", import.meta.url);
const installRoot = new URL("../.github/", import.meta.url);

test("the current Development Task is a complete copy-owned file set", async () => {
  const workflow = await readFile(new URL("workflows/github-development-ticket.yml", installRoot), "utf8");
  assert.match(workflow, /^name: Graph Engineering - GitHub Development Ticket$/m);

  const supportFiles = (await readdir(new URL("graph-engineering/", installRoot))).sort();
  assert.deepEqual(supportFiles, ["development-worktree.sh"]);
  for (const file of ["action.yml", "dist/main.js", "scripts/install-runtime.mjs", "package.json", "LICENSE", "NOTICE", "UPSTREAM.md"]) {
    const source = await readFile(new URL(`actions/development-codex/${file}`, installRoot));
    const installed = await readFile(new URL(`../.github/actions/development-codex/${file}`, taskRoot));
    assert.deepEqual(installed, source, `${file} must match the installed Action`);
  }
  const action = await readFile(new URL("actions/development-codex/action.yml", installRoot), "utf8");
  assert.deepEqual(parseDocument(action).errors, []);
  assert.match(action, /node "\$ACTION_PATH\/scripts\/install-runtime\.mjs"/);
  const bundle = await readFile(new URL("actions/development-codex/dist/main.js", installRoot));
  assert.equal(createHash("sha256").update(bundle).digest("hex"), "c898908d5f1624197c035e85653ca9ef45f2bc39cd524cc441fffa97f38814ca");
});

test("the current Coding Task is a separate copy-owned workflow", async () => {
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
