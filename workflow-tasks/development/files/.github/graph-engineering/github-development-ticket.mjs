import { spawn, execFileSync } from "node:child_process";
import { accessSync, constants, realpathSync } from "node:fs";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";
import {
  STOP_HOOK_WAIT_TIMEOUT_MS,
  expireStopHookTimeouts,
  shouldAwaitStopHooks,
} from "./stop-hook-drain.mjs";
import { findThreadRecord, formatThreadRecord } from "./thread-record.mjs";

const repository = requiredEnv("GITHUB_REPOSITORY");
const issueNumber = Number(requiredEnv("ISSUE_NUMBER"));
const baseBranch = requiredEnv("BASE_BRANCH");
const tokenBudgetInput = process.env.GOAL_TOKEN_BUDGET ?? "500000";
const tokenBudget = tokenBudgetInput === "unlimited" ? null : Number(tokenBudgetInput);
if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) throw new Error("ISSUE_NUMBER must be a positive integer");
if (tokenBudget !== null && (!Number.isSafeInteger(tokenBudget) || tokenBudget <= 0)) {
  throw new Error('GOAL_TOKEN_BUDGET must be a positive integer or "unlimited"');
}

const issueUrl = `https://github.com/${repository}/issues/${issueNumber}`;
const goalPrompt = `使用 Matt Skill $implement 完成 ${issueUrl}；若 Issue 含 Acceptance Criteria，逐项依据实际验证结果，只将已满足项的复选框更新为已勾选；完成后将提交 push 到当前开发分支；如果不存在关联 PR，创建指向 ${baseBranch} 的 Draft PR。只有实现、自测、review、commit、push、Draft PR，以及适用时的验收条件状态同步都完成后才能结束 Goal。不得执行或输出认证状态、token、credential 或其他秘密。`;

function ghJson(args) {
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8", env: process.env }));
}

function getThreadRecord() {
  const pages = ghJson(["api", `repos/${repository}/issues/${issueNumber}/comments`, "--paginate", "--slurp"]);
  return findThreadRecord(pages.flat(), { repository, issueNumber });
}

function saveThreadRecord(threadId) {
  execFileSync(
    "gh",
    ["api", "--method", "POST", `repos/${repository}/issues/${issueNumber}/comments`, "-f", `body=${formatThreadRecord({ repository, issueNumber, threadId })}`],
    { stdio: "inherit", env: process.env },
  );
}

function resolveExecutable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {}
  }
  throw new Error(`Unable to resolve ${name} from PATH`);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const codexExecutable = resolveExecutable("codex");
const ghExecutable = resolveExecutable("gh");
const nodeExecutable = resolveExecutable("node");
const homebrewLib = ghExecutable.includes("/Cellar/") ? `${ghExecutable.split("/Cellar/")[0]}/lib` : null;
const homebrewLibPermission = homebrewLib ? `,${JSON.stringify(homebrewLib)}="read"` : "";
const filesystemPermissions = `permissions.github-contributor.filesystem={glob_scan_max_depth=3,":minimal"="read",${JSON.stringify(codexExecutable)}="read",${JSON.stringify(ghExecutable)}="read",${JSON.stringify(nodeExecutable)}="read"${homebrewLibPermission},":workspace_roots"={"."="write",".git"="write",".codex"="read","**/*.env"="deny"}}`;
const gitContributorConfig = [
  "-c", 'default_permissions="github-contributor"',
  "-c", "features.network_proxy=true",
  "-c", 'permissions.github-contributor.description="Write the current checkout including Git metadata and reach GitHub and Agent Skills"',
  "-c", filesystemPermissions,
  "-c", 'permissions.github-contributor.network={enabled=true,allow_upstream_proxy=true,allow_local_binding=true,domains={"github.com"="allow","api.github.com"="allow","uploads.github.com"="allow","objects.githubusercontent.com"="allow","raw.githubusercontent.com"="allow","agentskills.io"="allow"}}',
];

const server = spawn("codex", ["app-server", ...gitContributorConfig, "--strict-config", "--listen", "stdio://"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
});
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

let nextId = 1;
const pending = new Map();
const activeTurns = new Map();
const completedStopHooks = new Map();
const awaitingStopHooks = new Map();
let stopHookCount = 0;
let cancellationSignal = null;
let forcedCancellation = false;
let threadId = null;
let goal = null;

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params) {
  const id = nextId++;
  send({ method, id, params });
  return new Promise((resolve, reject) => pending.set(id, { method, resolve, reject }));
}

const lines = createInterface({ input: server.stdout });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id !== undefined && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(`${entry.method}: ${JSON.stringify(message.error)}`));
    else entry.resolve(message.result);
    return;
  }
  if (message.method === "thread/goal/updated") {
    goal = message.params.goal;
    console.log(`GOAL status=${goal.status} tokens=${goal.tokensUsed} seconds=${goal.timeUsedSeconds}`);
  } else if (message.method === "turn/started") {
    activeTurns.set(message.params.turn.id, message.params.threadId);
    console.log(`TURN_STARTED ${message.params.turn.id}`);
  } else if (message.method === "turn/completed") {
    activeTurns.delete(message.params.turn.id);
    const completed = completedStopHooks.get(message.params.turn.id)?.size ?? 0;
    if (shouldAwaitStopHooks({
      turnThreadId: message.params.threadId,
      goalThreadId: threadId,
      completedHookCount: completed,
      configuredHookCount: stopHookCount,
    })) {
      awaitingStopHooks.set(message.params.turn.id, Date.now() + STOP_HOOK_WAIT_TIMEOUT_MS);
    }
    console.log(`TURN_COMPLETED ${message.params.turn.id} ${message.params.turn.status}`);
  } else if (message.method === "hook/completed" && message.params.run.eventName === "stop") {
    const turnId = message.params.turnId;
    if (turnId) {
      const completed = completedStopHooks.get(turnId) ?? new Set();
      completed.add(message.params.run.id);
      completedStopHooks.set(turnId, completed);
      if (completed.size >= stopHookCount) awaitingStopHooks.delete(turnId);
      console.log(`STOP_HOOK_COMPLETED ${turnId} ${message.params.run.status}`);
    }
  }
});

function requestCancellation(signal) {
  if (cancellationSignal) {
    forcedCancellation = true;
    server.kill("SIGTERM");
    return;
  }
  cancellationSignal = signal;
  console.log(`CANCEL_REQUESTED ${signal}`);
  for (const [turnId, activeThreadId] of activeTurns) {
    void request("turn/interrupt", { threadId: activeThreadId, turnId }).catch((error) => {
      console.error(`TURN_INTERRUPT_FAILED ${turnId} ${error.message}`);
    });
  }
}

process.on("SIGINT", requestCancellation);
process.on("SIGTERM", requestCancellation);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGoal() {
  const deadline = Date.now() + 110 * 60 * 1000;
  while (Date.now() < deadline) {
    const expiredStopHooks = expireStopHookTimeouts(awaitingStopHooks);
    for (const turnId of expiredStopHooks) console.warn(`STOP_HOOK_TIMEOUT ${turnId}`);
    if (expiredStopHooks.length > 0 && goal?.status === "active" && activeTurns.size === 0) {
      throw new Error("Stop hook timed out while Goal remains active; rerun the workflow to resume");
    }
    if (forcedCancellation) throw new Error(`Forced cancellation after ${cancellationSignal}`);
    if (cancellationSignal && activeTurns.size === 0 && awaitingStopHooks.size === 0) {
      console.log(`CANCEL_DRAINED ${cancellationSignal}`);
      throw new Error(`Cancelled by ${cancellationSignal}`);
    }
    if (goal && goal.status !== "active" && activeTurns.size === 0 && awaitingStopHooks.size === 0) return goal;
    await delay(500);
  }
  throw new Error("Timed out waiting for Goal terminal state");
}

try {
  await request("initialize", {
    clientInfo: { name: "github-development-ticket", version: "0.1.2" },
    capabilities: { experimentalApi: true },
  });
  send({ method: "initialized" });

  const hookList = await request("hooks/list", { cwds: [process.cwd()] });
  stopHookCount = hookList.data
    .flatMap((entry) => entry.hooks)
    .filter((hook) => hook.enabled && hook.eventName === "stop" && ["managed", "trusted"].includes(hook.trustStatus))
    .length;
  console.log(`STOP_HOOKS_CONFIGURED ${stopHookCount}`);

  const record = getThreadRecord();
  if (record) {
    threadId = record.threadId;
    await request("thread/resume", {
      threadId,
      cwd: process.cwd(),
      permissions: "github-contributor",
      approvalPolicy: "never",
    });
    const recovered = await request("thread/goal/get", { threadId });
    goal = recovered.goal;
    console.log(`THREAD_RESUMED ${threadId} status=${goal?.status ?? "missing"}`);
    if (goal?.status === "complete") process.exitCode = 0;
    else {
      const resized = await request("thread/goal/set", { threadId, tokenBudget });
      goal = resized.goal;
      console.log(`GOAL_BUDGET_UPDATED ${goal.tokensUsed}/${goal.tokenBudget ?? "unlimited"}`);
      goal = { ...goal, status: "active" };
      const activated = await request("thread/goal/set", { threadId, status: "active" });
      goal = activated.goal;
    }
  } else {
    const started = await request("thread/start", {
      cwd: process.cwd(),
      permissions: "github-contributor",
      approvalPolicy: "never",
      ephemeral: false,
    });
    threadId = started.thread.id;
    await request("thread/goal/set", {
      threadId,
      objective: goalPrompt,
      status: "active",
      tokenBudget,
    });
    saveThreadRecord(threadId);
    console.log(`THREAD_CREATED ${threadId}`);
  }

  if (goal?.status !== "complete") {
    const result = await waitForGoal();
    console.log(`FINAL_GOAL=${JSON.stringify(result)}`);
    if (result.status !== "complete") throw new Error(`Goal stopped with ${result.status}`);
  } else {
    console.log(`FINAL_GOAL=${JSON.stringify(goal)}`);
  }
} finally {
  lines.close();
  server.kill("SIGTERM");
}
