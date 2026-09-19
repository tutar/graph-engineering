import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/github-coding-task.yml", import.meta.url),
  "utf8",
);

test("Coding Task admits labeled and manual Issue invocations with Issue concurrency", () => {
  assert.match(workflow, /issues:\n\s+types: \[labeled\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.event\.label\.name == 'coding-ticket'/);
  assert.match(workflow, /any\(\.labels\[\]; \.name == "ready-for-agent"\)/);
  assert.match(workflow, /any\(\.labels\[\]; \.name == "coding-ticket"\)/);
  assert.match(workflow, /state.*== "OPEN"/);
  assert.match(workflow, /group: github-coding-task-/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /token_budget:[\s\S]*?default:\s*"400000"/);
  assert.match(workflow, /positive integer or unlimited/);
});

test("Workflow prepares only the caller workspace and invokes the project-owned Action", () => {
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow, /ref:\s*\$\{\{ env\.BASE_BRANCH \}\}/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /git config user\.name/);
  assert.match(workflow, /git config user\.email/);
  assert.match(workflow, /uses:\s*\.\/\.github\/actions\/codex-goal/);
  assert.match(workflow, /working-directory:\s*\$\{\{ github\.workspace \}\}/);
  assert.match(workflow, /codex-version:\s*0\.153\.4/);
  assert.match(workflow, /permission-profile:\s*:workspace/);
  assert.doesNotMatch(workflow, /tutar\/codex-action/);
  assert.doesNotMatch(workflow, /task-state-root|task-workspace|task-id|task-phase/);
  assert.doesNotMatch(workflow, /Prepare coding branch|TARGET_BRANCH|runner\.tool_cache/);
});

test("Work and Handoff prompts assign delivery and preservation responsibilities", () => {
  assert.match(workflow, /使用 \$implement 完成 Issue/);
  assert.match(workflow, /读取 Issue、评论、远端分支和现有 PR/);
  assert.match(workflow, /仅勾选已有证据证明满足的项目/);
  assert.match(workflow, /提交并 push 代码/);
  assert.match(workflow, /创建或更新 Draft PR/);
  assert.match(workflow, /停止继续实现/);
  assert.match(workflow, /检查当前 workspace、分支和未提交修改/);
  assert.match(workflow, /不得创建完成用 Draft PR/);
  assert.match(workflow, /不得把未完成验收项勾选为完成/);
});

test("Goal terminal state alone maps the Job and label lifecycle", () => {
  assert.match(workflow, /--add-label in-progress/);
  assert.match(workflow, /steps\.codex\.outputs\['work-goal-status'\] == 'complete'/);
  assert.match(workflow, /--remove-label coding-ticket/);
  assert.match(workflow, /--remove-label in-progress/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.doesNotMatch(workflow, /--remove-label ready-for-agent/);
  assert.doesNotMatch(workflow, /verify-delivery|delivery_result|Delete successful Task Repository/);
  assert.doesNotMatch(workflow, /git status --porcelain|git ls-remote|gh pr list/);
  assert.doesNotMatch(workflow, /timeout-minutes|soft.deadline/i);
});

test("a queued duplicate skips Codex when admission is no longer current", () => {
  assert.match(workflow, /id:\s*admission/);
  assert.match(workflow, /eligible=false/);
  assert.match(workflow, /if:\s*steps\.admission\.outputs\.eligible == 'true'/);
  const admission = workflow.match(/- name: Check current Coding Ticket admission([\s\S]*?)(?=\n\s+- name:)/)?.[1] ?? "";
  assert.doesNotMatch(admission, /in-progress/);
});

test("blocked, budget-limited and execution failures preserve coding-ticket and fail the Job", () => {
  assert.match(workflow, /id:\s*codex[\s\S]*?continue-on-error:\s*true/);
  const release = workflow.match(/- name: Release incomplete Coding Ticket([\s\S]*?)(?=\n\s+- name:)/)?.[1] ?? "";
  assert.match(release, /always\(\)/);
  assert.match(release, /steps\.claim\.outcome == 'success'/);
  assert.match(release, /--remove-label in-progress/);
  assert.doesNotMatch(release, /--remove-label coding-ticket/);
  const conclusion = workflow.match(/- name: Conclude Coding Task([\s\S]*)/)?.[1] ?? "";
  assert.match(conclusion, /steps\.codex\.outcome/);
  assert.match(conclusion, /work-goal-status/);
  assert.match(conclusion, /complete_labels\.outcome/);
});

test("permissions are explicit and external Actions use immutable revisions", () => {
  assert.match(workflow, /permissions:\n\s+contents: write\n\s+issues: write\n\s+pull-requests: write/);
  for (const reference of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    if (reference[1].startsWith("./")) continue;
    assert.match(reference[1], /@[0-9a-f]{40}$/);
  }
});
