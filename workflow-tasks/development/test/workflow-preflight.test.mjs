import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../files/.github/workflows/github-development-ticket.yml", import.meta.url),
  "utf8",
);
const controller = readFileSync(
  new URL("../files/.github/loop-engineering/github-development-ticket.mjs", import.meta.url),
  "utf8",
);
const worktree = readFileSync(
  new URL("../files/.github/loop-engineering/development-worktree.sh", import.meta.url),
  "utf8",
);

test("pre-checkout GitHub CLI calls name the repository explicitly", () => {
  const issueQueries = workflow.split("\n").filter((line) => line.includes("gh issue view"));
  assert.equal(issueQueries.length, 3);
  for (const query of issueQueries) assert.match(query, /--repo "\$\{GITHUB_REPOSITORY\}"/);
});

test("workflow and controller default to a 500,000-token Goal budget", () => {
  assert.match(workflow, /GOAL_TOKEN_BUDGET: \$\{\{ inputs\.goal_token_budget \|\| '500000' \}\}/);
  assert.match(controller, /GOAL_TOKEN_BUDGET \?\? "500000"/);
});

test("manual runs may clear an existing Goal token limit", () => {
  assert.match(workflow, /goal_token_budget:/);
  assert.match(controller, /tokenBudgetInput === "unlimited" \? null/);
  assert.match(controller, /goal\.tokenBudget \?\? "unlimited"/);
});

test("interrupted work is preserved and restored around checkout", () => {
  const preserve = workflow.indexOf("- name: Preserve interrupted Ticket work");
  const checkout = workflow.indexOf("- name: Check out default branch");
  const restore = workflow.indexOf("- name: Restore interrupted Ticket work");
  const runGoal = workflow.indexOf("- name: Start or resume Goal");
  assert.ok(preserve < checkout);
  assert.ok(checkout < restore);
  assert.ok(restore < runGoal);
  assert.match(workflow, /development-worktree\.sh restore/);
  assert.match(workflow, /loop-engineering:\$\{GITHUB_REPOSITORY\}:\$\{current_branch\}/);
  assert.match(workflow, /refs\/loop-engineering\/interrupted-stash\/\$\{TARGET_BRANCH\}/);
});

test("interrupted local commits are rebuilt before their worktree changes", () => {
  const preserve = workflow.indexOf("- name: Preserve interrupted Ticket work");
  const prepare = workflow.indexOf("- name: Prepare development branch");
  const restore = workflow.indexOf("- name: Restore interrupted Ticket work");
  assert.match(workflow.slice(preserve, prepare), /git update-ref "\$\{interrupted_ref\}" HEAD/);
  assert.match(workflow.slice(preserve, prepare), /git merge-base --is-ancestor HEAD "origin\/\$\{TARGET_BRANCH\}"/);
  assert.match(workflow.slice(preserve, prepare), /git update-ref "\$\{interrupted_stash_ref\}" refs\/stash/);
  assert.match(workflow.slice(prepare, restore), /development-worktree\.sh prepare/);
  assert.match(workflow.slice(restore), /development-worktree\.sh restore/);
  assert.match(worktree, /git switch --force-create "\$\{TARGET_BRANCH\}" "\$\{interrupted_ref\}"/);
  assert.match(worktree, /git rebase "\$\{BASE_BRANCH\}"/);
  assert.match(worktree, /git stash apply --index "\$\{interrupted_stash_ref\}"/);
  assert.doesNotMatch(worktree, /git stash list/);
  assert.match(worktree, /git update-ref -d "\$\{interrupted_ref\}"/);
});

test("a fully pushed Ticket branch is restored from its remote without rebasing", () => {
  const preserve = workflow.indexOf("- name: Preserve interrupted Ticket work");
  const prepare = workflow.indexOf("- name: Prepare development branch");
  assert.match(workflow.slice(preserve, prepare), /git update-ref -d "\$\{interrupted_ref\}"/);
  assert.match(workflow.slice(preserve, prepare), /if ! git merge-base --is-ancestor HEAD "origin\/\$\{TARGET_BRANCH\}"/);
});

test("external Actions are pinned to immutable commits", () => {
  for (const reference of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    assert.match(reference[1], /@[0-9a-f]{40}$/);
  }
});

test("the shared definition leaves project dependency setup to the consumer", () => {
  assert.doesNotMatch(workflow, /Prepare Agent Gateway test environment/);
  assert.doesNotMatch(controller, /resolveExecutable\("uv"\)/);
  assert.doesNotMatch(controller, /UV_CACHE_DIR/);
});

test("successful delivery removes only the active Development Ticket labels", () => {
  const verify = workflow.indexOf("- name: Verify Codex delivery");
  const complete = workflow.indexOf("- name: Mark Ticket delivery complete");
  assert.ok(verify < complete);
  assert.match(workflow, /--remove-label development-ticket/);
  assert.match(workflow, /--remove-label in-progress/);
  assert.doesNotMatch(workflow, /--remove-label ready-for-agent/);
});
