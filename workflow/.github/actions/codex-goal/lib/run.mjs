import { AppServerClient } from "./app-server.mjs";
import { splitTokenBudget } from "./budget.mjs";
import { isTerminalGoalStatus } from "./goal-status.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventRenderer } from "./event-renderer.mjs";

async function runGoal(client, renderer, { threadId, objective, tokenBudget, phase }) {
  renderer.setPhase(phase);
  client.resetFinalMessage();
  const terminal = client.watchTerminalGoal(threadId);
  const params = { threadId, objective, status: "active" };
  if (tokenBudget !== null) params.tokenBudget = tokenBudget;
  try {
    const response = await client.request("thread/goal/set", params);
    let result;
    if (isTerminalGoalStatus(response.goal?.status)) {
      terminal.cancel();
      result = {
        status: response.goal.status,
        turnId: response.turnId ?? null,
        tokensUsed: response.goal.tokensUsed ?? 0,
        timeUsedSeconds: response.goal.timeUsedSeconds ?? 0,
        finalMessage: client.finalMessage(),
        finalMessageItemId: "",
      };
      renderer.renderGoal(response.goal);
    } else {
      result = await terminal.promise;
    }
    if (!result.finalMessage) {
      const fallback = await client.readFinalMessage(threadId, result.turnId);
      result.finalMessage = fallback.text;
      result.finalMessageItemId = fallback.itemId;
    }
    renderer.ensureFinalMessage({ itemId: result.finalMessageItemId, text: result.finalMessage });
    return result;
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
  logMode = "safe",
  onLog = () => {},
  onDiagnostic = () => {},
}) {
  const budget = splitTokenBudget(tokenBudget);
  const redact = (value) => apiKey ? value.replaceAll(apiKey, "***") : value;
  const childEnv = { ...env };
  delete childEnv.OPENAI_API_KEY;
  const isolatedCodexHome = apiKey
    ? await mkdtemp(join(env.RUNNER_TEMP || tmpdir(), "codex-goal-auth-"))
    : null;
  const renderer = new EventRenderer({ logMode, redact, write: onLog, writeDiagnostic: onDiagnostic });
  const client = new AppServerClient({
    command,
    args,
    cwd: workingDirectory,
    env: isolatedCodexHome ? { ...childEnv, CODEX_HOME: isolatedCodexHome } : childEnv,
    onDiagnostic: (line) => renderer.diagnostic(line),
    onNotification: (message) => renderer.render(message),
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

    const work = await runGoal(client, renderer, {
      threadId,
      objective: prompt,
      tokenBudget: budget.work,
      phase: "work",
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
      const requestedHandoffCeiling = work.tokensUsed + budget.handoff;
      const handoffTokenCeiling = budget.total === null
        ? requestedHandoffCeiling
        : Math.min(budget.total, requestedHandoffCeiling);
      if (!Number.isSafeInteger(handoffTokenCeiling) || handoffTokenCeiling <= work.tokensUsed) {
        throw new Error("Runtime-reported token usage cannot form a safe Handoff budget ceiling");
      }
      const handoff = await runGoal(client, renderer, {
        threadId,
        objective: handoffPrompt,
        tokenBudget: handoffTokenCeiling,
        phase: "handoff",
      });
      result.handoffGoalStatus = handoff.status;
      const handoffTokensUsed = handoff.tokensUsed - work.tokensUsed;
      if (!Number.isSafeInteger(handoffTokensUsed) || handoffTokensUsed < 0) {
        throw new Error("Runtime-reported cumulative token usage moved backwards during Handoff");
      }
      result.handoffTokensUsed = handoffTokensUsed;
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
