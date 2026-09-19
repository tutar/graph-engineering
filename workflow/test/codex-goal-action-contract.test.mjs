import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const actionRoot = new URL("../.github/actions/codex-goal/", import.meta.url);

test("Codex Goal Action exposes only the generic Goal execution contract", async () => {
  const manifest = await readFile(new URL("action.yml", actionRoot), "utf8");
  for (const input of [
    "working-directory",
    "prompt",
    "token-budget",
    "handoff-prompt",
    "codex-version",
    "permission-profile",
  ]) {
    assert.match(manifest, new RegExp(`^  ${input}:$`, "m"));
  }
  assert.match(manifest, /token-budget:[\s\S]*?default: "400000"/);
  for (const output of [
    "work-goal-status",
    "handoff-goal-status",
    "token-budget-state",
    "work-tokens-used",
    "handoff-tokens-used",
    "final-message",
  ]) {
    assert.match(manifest, new RegExp(`^  ${output}:$`, "m"));
  }
  assert.match(manifest, /using: node24/);
  assert.match(manifest, /main: index\.mjs/);
});

test("Action implementation contains no GitHub delivery controller", async () => {
  const paths = ["index.mjs", ...(await readdir(new URL("lib/", actionRoot))).map((name) => `lib/${name}`)];
  const source = (await Promise.all(paths.map((path) => readFile(new URL(path, actionRoot), "utf8")))).join("\n");
  assert.doesNotMatch(source, /\bgh\s+(?:issue|pr)|pull.?request|checkout|git\s+(?:switch|push|commit)|coding-ticket|in-progress/i);
  assert.doesNotMatch(source, /finalMessage.*(?:commit|push|issue|pr)/i);
});
