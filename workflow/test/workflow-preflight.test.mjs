import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/github-development-ticket.yml", import.meta.url),
  "utf8",
);

const actionRevision = "393ad456e354dc9da7be630c09be243cc1d212af";

test("the recovery Action preserves checkout and one Task Invocation across reruns", () => {
  const calls = [...workflow.matchAll(/uses:\s+tutar\/codex-action@([^\s#]+)/g)];
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((match) => match[1]), [actionRevision, actionRevision]);
  assert.match(workflow, /task-phase:\s*prepare/);
  assert.match(workflow, /task-id:\s*development/);
  assert.match(workflow, /task-state-root:\s*\$\{\{ env\.TASK_STATE_ROOT \}\}/);
  assert.match(workflow, /if:\s*steps\.task\.outputs\.workspace-exists != 'true'/);
  assert.match(workflow, /working-directory:\s*\$\{\{ steps\.task\.outputs\.task-workspace \}\}/);
  assert.match(workflow, /codex-version:\s*0\.153\.4/);
  assert.doesNotMatch(workflow, /task-id:.*issue/i);
  assert.doesNotMatch(workflow, /github-development-ticket\.mjs/);
});

test("the Compatible Executor maps the Goal prompt and leaves business checks to the Harness", () => {
  assert.match(workflow, /prompt:\s*>-/);
  assert.match(workflow, /\$implement/);
  assert.match(workflow, /Verify Codex delivery/);
  assert.match(workflow, /git status --porcelain/);
  assert.match(workflow, /gh pr list/);
});

test("existing admission, concurrency, checkout and label behavior remains", () => {
  assert.match(workflow, /issues:\n\s+types: \[labeled\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /group: github-development-ticket-/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow, /--add-label in-progress/);
  assert.match(workflow, /--remove-label development-ticket/);
  assert.match(workflow, /--remove-label in-progress/);
  assert.doesNotMatch(workflow, /--remove-label ready-for-agent/);
});

test("pre-checkout GitHub CLI calls name the repository explicitly", () => {
  const issueQueries = workflow.split("\n").filter((line) => line.includes("gh issue view"));
  assert.equal(issueQueries.length, 3);
  for (const query of issueQueries) assert.match(query, /--repo "\$\{GITHUB_REPOSITORY\}"/);
});

test("external Actions are pinned to immutable commits", () => {
  for (const reference of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    assert.match(reference[1], /@[0-9a-f]{40}$/);
  }
});
