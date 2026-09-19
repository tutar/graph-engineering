import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/github-coding-task.yml", import.meta.url),
  "utf8",
);
const actionEntrypoint = readFileSync(
  new URL("../.github/actions/codex-goal/index.mjs", import.meta.url),
  "utf8",
);

test("Coding Task admits labeled and manual Issue invocations with Issue concurrency", () => {
  assert.match(workflow, /issues:\n\s+types: \[labeled\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.event\.label\.name == 'coding-ticket'/);
  assert.match(workflow, /any\(\.labels\[\]; \.name == "ready-for-agent"\)/);
  assert.match(workflow, /any\(\.labels\[\]; \.name == "coding-ticket"\)/);
  assert.match(workflow, /manual="\$\{\{ github\.event_name == 'workflow_dispatch' \}\}"/);
  assert.match(workflow, /"\$\{manual\}" == "true" \|\| "\$\{coding\}" == "true"/);
  assert.match(workflow, /state.*== "OPEN"/);
  assert.match(workflow, /group: github-coding-task-/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /token_budget:[\s\S]*?default:\s*"500000"/);
  assert.match(workflow, /integer greater than 100000 or unlimited/);
});

test("Workflow prepares only the caller workspace and invokes the project-owned Action", () => {
  assert.match(workflow, /runs-on: \[self-hosted, Linux, X64\]/);
  assert.doesNotMatch(workflow, /graph-engineering-coding/);
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/);
  assert.match(workflow, /ref:\s*\$\{\{ env\.BASE_BRANCH \}\}/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /git config user\.name/);
  assert.match(workflow, /git config user\.email/);
  assert.match(workflow, /uses:\s*\.\/\.github\/actions\/codex-goal/);
  assert.match(workflow, /working-directory:\s*\$\{\{ github\.workspace \}\}/);
  assert.match(workflow, /codex-version:\s*0\.153\.4/);
  assert.match(workflow, /permission-profile:\s*graph-engineering-delivery/);
  assert.doesNotMatch(workflow, /tutar\/codex-action/);
  assert.doesNotMatch(workflow, /task-state-root|task-workspace|task-id|task-phase/);
  assert.doesNotMatch(workflow, /Prepare coding branch|TARGET_BRANCH|runner\.tool_cache/);
});

test("Work and Handoff prompts assign delivery and preservation responsibilities", () => {
  assert.match(workflow, /使用 \$implement 完成并交付 Issue/);
  assert.match(workflow, /读取 Issue、评论、远端分支和现有 PR，确定工作起点/);
  assert.match(workflow, /优先恢复关联本 Issue 的 Draft PR 或远端工作分支/);
  assert.match(workflow, /以可验证增量推进/);
  assert.match(workflow, /及时 commit、push，并创建或更新 Draft PR/);
  assert.match(workflow, /仅勾选有直接证据证明满足的 Acceptance Criteria/);
  assert.match(workflow, /完成条件：实现与验证结束，已有证据已同步，代码已 push，Draft PR 已创建或更新/);
  assert.match(workflow, /目标是把当前现场持久化为后续 Session 可恢复的工作起点/);
  assert.match(workflow, /检查 workspace、分支、远端分支和现有 PR/);
  assert.match(workflow, /恢复或创建本 Issue 的工作分支/);
  assert.match(workflow, /保留所有候选工作并报告阻塞/);
  assert.match(workflow, /所有与本 Issue 有关且可合法提交的修改/);
  assert.match(workflow, /未完成、验证失败和尚未验证的工作/);
  assert.match(workflow, /有远端 diff 时复用或创建关联本 Issue、明确标记未完成的 Draft PR/);
  assert.match(workflow, /仅同步直接证据支持的事实/);
  assert.match(workflow, /保持未满足的验收项为未完成/);
  assert.match(workflow, /完成条件：所有可保存修改均已 push/);
  assert.match(workflow, /对应 Draft PR 已存在，或当前没有可形成 PR 的 diff/);
  assert.doesNotMatch(workflow, /不得创建完成用 Draft PR/);
  assert.doesNotMatch(workflow, /只有实现、测试、code review、commit、push/);
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
  assert.match(actionEntrypoint, /success:\s*result\.workGoalStatus === "complete"/);
  assert.match(actionEntrypoint, /if \(!success\)[\s\S]*?process\.exitCode = 1/);
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

test("finite and unlimited total budgets are validated and forwarded to the Action", () => {
  const validation = workflow.match(/- name: Validate Runtime Token Budget([\s\S]*?)(?=\n\s+- name:)/)?.[1] ?? "";
  assert.match(validation, /value === "unlimited"/);
  assert.match(validation, /\^\[1-9\]\[0-9\]\*\$/);
  assert.match(validation, /Number\.isSafeInteger\(total\)/);
  assert.match(validation, /total > 100000/);
  assert.match(workflow, /TOKEN_BUDGET_REQUESTED:.*inputs\.token_budget.*'500000'/);
  assert.match(workflow, /token-budget:\s*\$\{\{ env\.TOKEN_BUDGET_REQUESTED \}\}/);
});

test("permissions are explicit and external Actions use immutable revisions", () => {
  assert.match(workflow, /permissions:\n\s+contents: write\n\s+issues: write\n\s+pull-requests: write/);
  for (const reference of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    if (reference[1].startsWith("./")) continue;
    assert.match(reference[1], /@[0-9a-f]{40}$/);
  }
});
