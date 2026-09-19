import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/github-coding-task.yml", import.meta.url),
  "utf8",
);
const control = readFileSync(new URL("../.github/graph-engineering/coding-task-control.mjs", import.meta.url), "utf8");
const actionRevision = "9405141578057eb1dca78f927b10f6c3cf3a79a4";
const codexCli = "0.153.4";

test("Coding Task has distinct label admission, manual input and Issue concurrency", () => {
  assert.match(workflow, /issues:\n\s+types: \[labeled\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.event\.label\.name == 'coding-ticket'/);
  assert.match(workflow, /any\(\.labels\[\]; \.name == "ready-for-agent"\)/);
  assert.match(workflow, /any\(\.labels\[\]; \.name == "coding-ticket"\)/);
  assert.match(workflow, /group: github-coding-task-/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test("current Codex Executor remains pinned until the Coding Task migration", () => {
  const calls = [...workflow.matchAll(/uses:\s+tutar\/codex-action@([^\s#]+)/g)];
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((match) => match[1]), [actionRevision, actionRevision]);
  assert.match(workflow, new RegExp(`codex-version:\\s*${codexCli.replaceAll(".", "\\.")}`));
  assert.match(workflow, /permission-profile:\s*:workspace/);
  assert.match(workflow, /runs-on:\s*\[self-hosted, Linux, X64, graph-engineering-coding\]/);
  assert.doesNotMatch(workflow, /safety-strategy:\s*unsafe/);
  assert.match(workflow, /task-id:\s*coding/);
  assert.match(workflow, /task-phase:\s*prepare/);
  assert.equal([...workflow.matchAll(/task-state-root:\s*\$\{\{ runner\.tool_cache \}\}\/graph-engineering\/codex-task-state/g)].length, 2);
  assert.doesNotMatch(workflow.match(/jobs:[\s\S]*?steps:/)?.[0] ?? "", /runner\.tool_cache/);
  const executor = workflow.match(/- name: Start or resume Codex Executor([\s\S]*?)(?=\n\s+- name: Classify structured Agent result)/)?.[1] ?? "";
  assert.doesNotMatch(executor, /working-directory:/);
  assert.match(workflow, /output-schema:/);
  assert.match(workflow, /status.*completed.*blocked/s);
  assert.match(workflow, /token_budget:[\s\S]*?default:\s*"400000"/);
  assert.match(workflow, /TOKEN_BUDGET_REQUESTED:\s*\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.token_budget \|\| '400000' \}\}/);
  assert.match(workflow, /token-budget:\s*\$\{\{ env\.TOKEN_BUDGET_REQUESTED \}\}/);
  assert.match(workflow, /token-budget-capability:\s*app-server-goal/);
  assert.match(workflow, /token-budget-override:\s*\$\{\{ vars\[format\('GE_CODING_BUDGET_RUN_\{0\}', github\.run_id\)\] \}\}/);
});

test("Agent result, machine execution and delivery facts stay separate", () => {
  assert.match(workflow, /id:\s*codex/);
  assert.match(workflow, /id:\s*agent_result/);
  assert.match(workflow, /id:\s*delivery_result/);
  assert.match(workflow, /steps\.codex\.outcome/);
  assert.match(workflow, /steps\.agent_result\.outputs\.status/);
  assert.match(workflow, /steps\.delivery_result\.outputs\.state/);
  assert.match(control, /return "not-run"/);
  assert.match(control, /return checksOutcome === "success" \? "passed" : "failed"/);
  assert.match(control, /Delivery facts:/);
  for (const output of ["machine-execution-state", "final-message", "token-budget-capability", "token-budget-state", "token-budget-limit", "token-budget-used", "token-budget-exhausted"]) {
    assert.match(workflow, new RegExp(`steps\\.codex\\.outputs\\['${output}'\\]`));
  }
  assert.doesNotMatch(workflow, /steps\.codex\.outputs\.[a-z]+-[a-z-]+/);
  assert.match(workflow, /default:\s*"400000"/);
  assert.match(workflow, /token-budget-capability:\s*app-server-goal/);
});

test("delivery checks are exactly the four deterministic invariants", () => {
  const section = workflow.match(/- name: Verify Coding Task delivery([\s\S]*?)(?=\n\s+- name:)/)?.[1] ?? "";
  assert.match(section, /coding-task-control\.mjs" verify-delivery/);
  assert.match(control, /\["status", "--porcelain"\]/);
  assert.match(control, /\["rev-list", "--count"/);
  assert.match(control, /\["ls-remote", "origin"/);
  assert.match(control, /"pr", "list"/);
  assert.match(control, /pulls\[0\]\.isDraft/);
});

test("success deletes the task repository and labels; non-success preserves it and releases in-progress", () => {
  assert.match(workflow, /Delete successful Task Repository/);
  assert.match(workflow, /--remove-label coding-ticket/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(control, /"--add-label", "coding-ticket"/);
  assert.match(workflow, /--remove-label in-progress/);
  assert.doesNotMatch(workflow, /--remove-label ready-for-agent/);
});

test("permissions and fail-closed cleanup are explicit", () => {
  assert.match(workflow, /permissions:\n\s+contents: write\n\s+issues: write\n\s+pull-requests: write/);
  assert.match(workflow, /id:\s*label_cleanup\n\s+continue-on-error: true/);
  assert.match(workflow, /id:\s*repository_cleanup\n\s+continue-on-error: true/);
  assert.match(workflow, /steps\.label_cleanup\.outcome/);
  assert.match(workflow, /steps\.repository_cleanup\.outcome/);
});

test("all third-party Actions use immutable revisions", () => {
  for (const reference of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    assert.match(reference[1], /@[0-9a-f]{40}$/);
  }
});
