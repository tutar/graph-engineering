#!/usr/bin/env node

import { appendFileSync, realpathSync, rmSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

export function classifyAgentResult(machineState, text) {
  if (machineState !== "success") return "unavailable";
  const result = JSON.parse(text);
  if (!result || !["completed", "blocked"].includes(result.status)) {
    throw new Error("Agent result status must be completed or blocked");
  }
  return result.status;
}

export function classifyDelivery(agentStatus, checksOutcome) {
  if (agentStatus !== "completed") return "not-run";
  return checksOutcome === "success" ? "passed" : "failed";
}

export function needsLabelReconciliation({ claim, delivery, labels, repository }) {
  return claim === "success" && (delivery !== "passed" || labels !== "success" || repository !== "success");
}

export function verifyDeliveryFacts({ cwd, repository, baseBranch, targetBranch, run = execFileSync }) {
  const invoke = (command, args) => run(command, args, { cwd, encoding: "utf8" }).trim();
  if (invoke("git", ["status", "--porcelain"]) !== "") throw new Error("task repository is not clean");
  if (Number(invoke("git", ["rev-list", "--count", `origin/${baseBranch}..HEAD`])) <= 0) {
    throw new Error("task branch has no commit beyond base");
  }
  const localHead = invoke("git", ["rev-parse", "HEAD"]);
  const remoteHead = invoke("git", ["ls-remote", "origin", `refs/heads/${targetBranch}`]).split(/\s+/)[0] ?? "";
  if (localHead !== remoteHead) throw new Error("local HEAD does not match the remote target branch");
  const pulls = JSON.parse(invoke("gh", [
    "pr", "list", "--repo", repository, "--head", targetBranch, "--base", baseBranch,
    "--state", "open", "--json", "url,isDraft,state",
  ]));
  if (pulls.length !== 1 || !pulls[0].isDraft || pulls[0].state !== "OPEN") {
    throw new Error("expected exactly one matching open Draft PR");
  }
}

export function deleteTaskWorkspace(taskStateRoot, taskWorkspace) {
  const root = realpathSync(taskStateRoot);
  const workspace = realpathSync(taskWorkspace);
  const child = relative(root, workspace);
  if (!child || child.startsWith(`..${sep}`) || isAbsolute(child) || !child.endsWith(`${sep}workspace`)) {
    throw new Error(`refusing to delete task workspace outside the task state root: ${workspace}`);
  }
  realpathSync(resolve(workspace, ".git"));
  rmSync(workspace, { recursive: true });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function output(name, value) {
  appendFileSync(required("GITHUB_OUTPUT"), `${name}=${value}\n`);
}

function summary(line) {
  appendFileSync(required("GITHUB_STEP_SUMMARY"), `${line}\n`);
}

const command = process.argv[2];
if (command === "classify-agent") {
  const status = classifyAgentResult(required("MACHINE_STATE"), process.env.AGENT_RESULT ?? "");
  output("status", status);
  summary("### Coding Task result");
  summary(`- Machine execution: ${process.env.MACHINE_STATE}`);
  summary(`- Agent result: ${status}`);
  summary(`- Token Budget: ${required("TOKEN_BUDGET_STATE")} (requested ${required("TOKEN_BUDGET_REQUESTED")}; not enforced)`);
} else if (command === "verify-delivery") {
  verifyDeliveryFacts({
    cwd: process.cwd(),
    repository: required("GITHUB_REPOSITORY"),
    baseBranch: required("BASE_BRANCH"),
    targetBranch: required("TARGET_BRANCH"),
  });
} else if (command === "classify-delivery") {
  const state = classifyDelivery(required("AGENT_STATUS"), required("CHECKS_OUTCOME"));
  output("state", state);
  summary(`- Delivery facts: ${state}`);
} else if (command === "delete-workspace") {
  deleteTaskWorkspace(required("TASK_STATE_ROOT"), required("TASK_WORKSPACE"));
} else if (command === "reconcile-labels") {
  if (needsLabelReconciliation({
    claim: required("CLAIM_OUTCOME"),
    delivery: process.env.DELIVERY_STATE ?? "",
    labels: process.env.LABEL_OUTCOME ?? "",
    repository: process.env.REPOSITORY_OUTCOME ?? "",
  })) {
    execFileSync("gh", ["issue", "edit", required("ISSUE_NUMBER"), "--repo", required("GITHUB_REPOSITORY"),
      "--add-label", "coding-ticket", "--remove-label", "in-progress"], { stdio: "inherit" });
  }
} else if (import.meta.url === `file://${process.argv[1]}`) {
  throw new Error("usage: coding-task-control.mjs classify-agent|verify-delivery|classify-delivery|delete-workspace|reconcile-labels");
}
