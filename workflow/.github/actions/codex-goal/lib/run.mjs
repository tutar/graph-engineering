import { AppServerClient } from "./app-server.mjs";
import { splitTokenBudget } from "./budget.mjs";
import { isTerminalGoalStatus } from "./goal-status.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runGoal(client, { threadId, objective, tokenBudget }) {
  client.resetFinalMessage();
  const terminal = client.watchTerminalGoal(threadId);
  const params = { threadId, objective, status: "active" };
  if (tokenBudget !== null) params.tokenBudget = tokenBudget;
  try {
    const response = await client.request("thread/goal/set", params);
    if (isTerminalGoalStatus(response.goal?.status)) {
      terminal.cancel();
      return {
        status: response.goal.status,
        tokensUsed: response.goal.tokensUsed ?? 0,
        finalMessage: client.finalMessage(),
      };
    }
    return await terminal.promise;
  } catch (error) {
    terminal.cancel();
    throw error;
  }
}

export async function runAgentAction({
  command,
  args = [],
  env = process.env,
  workingDirectory,
  prompt,
  handoffPrompt,
  tokenBudget,
  permissionProfile,
  apiKey,
  onDiagnostic = () => {},
}) {
  const budget = splitTokenBudget(tokenBudget);
  const redact = (value) => apiKey ? value.replaceAll(apiKey, "***") : value;
  const childEnv = { ...env };
  delete childEnv.OPENAI_API_KEY;
  const isolatedCodexHome = apiKey
    ? await mkdtemp(join(env.RUNNER_TEMP || tmpdir(), "codex-goal-auth-"))
    : null;
  const client = new AppServerClient({
    command,
    args,
    cwd: workingDirectory,
    env: isolatedCodexHome ? { ...childEnv, CODEX_HOME: isolatedCodexHome } : childEnv,
    onDiagnostic: (line) => onDiagnostic(redact(line)),
  });

  try {
    await client.initialize();
    if (apiKey) {
      await client.request("account/login/start", { type: "apiKey", apiKey });
    }
    const started = await client.request("thread/start", {
      cwd: workingDirectory,
      permissions: permissionProfile,
      approvalPolicy: "never",
      ephemeral: false,
    });
    const threadId = started.thread?.id;
    if (!threadId) throw new Error("Codex App Server did not return a thread id");

    const work = await runGoal(client, {
      threadId,
      objective: prompt,
      tokenBudget: budget.work,
    });
    const result = {
      workGoalStatus: work.status,
      handoffGoalStatus: "not-started",
      tokenBudgetState: budget.state,
      workTokensUsed: work.tokensUsed,
      handoffTokensUsed: 0,
      finalMessage: work.finalMessage,
    };
    result.finalMessage = redact(result.finalMessage);
    if (!new Set(["blocked", "budgetLimited"]).has(work.status)) return result;

    try {
      const handoff = await runGoal(client, {
        threadId,
        objective: handoffPrompt,
        tokenBudget: budget.handoff,
      });
      result.handoffGoalStatus = handoff.status;
      result.handoffTokensUsed = handoff.tokensUsed;
      result.finalMessage = redact(handoff.finalMessage);
    } catch (error) {
      result.handoffGoalStatus = "failed";
      result.finalMessage = redact(error.message);
    }
    return result;
  } finally {
    try {
      await client.close();
    } finally {
      if (isolatedCodexHome) await rm(isolatedCodexHome, { recursive: true, force: true });
    }
  }
}
