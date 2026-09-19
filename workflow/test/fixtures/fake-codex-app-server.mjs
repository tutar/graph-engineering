import { appendFileSync } from "node:fs";
import readline from "node:readline";

const scenario = process.env.FAKE_SCENARIO;
const transcript = process.env.FAKE_TRANSCRIPT;
let goalCount = 0;
let currentGoalBudget = null;

appendFileSync(transcript, `${JSON.stringify({
  method: "fixture/environment",
  params: {
    codexHome: process.env.CODEX_HOME ?? null,
    hasOpenAIKey: Object.hasOwn(process.env, "OPENAI_API_KEY"),
  },
})}\n`);

function record(message) {
  const safe = structuredClone(message);
  if (safe.method === "account/login/start" && safe.params?.apiKey) {
    safe.params.apiKey = "<redacted>";
  }
  appendFileSync(transcript, `${JSON.stringify(safe)}\n`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function terminalGoal(status, tokensUsed, finalMessage) {
  finalMessage = process.env.FAKE_FINAL_MESSAGE || finalMessage;
  if (finalMessage) {
    send({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: `turn-${goalCount}`,
        completedAtMs: Date.now(),
        item: { id: `message-${goalCount}`, type: "agentMessage", text: finalMessage },
      },
    });
  }
  send({
    method: "thread/goal/updated",
    params: {
      threadId: "thread-1",
      goal: {
        threadId: "thread-1",
        objective: "fixture",
        status,
        tokenBudget: currentGoalBudget,
        tokensUsed,
        timeUsedSeconds: 1,
        createdAt: 1,
        updatedAt: 2,
      },
    },
  });
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  record(message);
  if (message.method === "initialize") {
    send({ id: message.id, result: { userAgent: "fake" } });
  } else if (message.method === "account/login/start") {
    send({ id: message.id, result: { type: "apiKey" } });
  } else if (message.method === "thread/start") {
    if (scenario === "clean-exit") process.exit(0);
    send({ id: message.id, result: { thread: { id: "thread-1", sessionId: "thread-1" } } });
  } else if (message.method === "thread/goal/set") {
    goalCount += 1;
    currentGoalBudget = message.params.tokenBudget ?? null;
    send({ id: message.id, result: { goal: { ...message.params, tokensUsed: 0 } } });
    if (goalCount === 1) {
      if (scenario === "app-server-failed") {
        send({ method: "error", params: { message: "fixture App Server failure" } });
      } else if (scenario.startsWith("work-complete")) terminalGoal("complete", 1234, "work finished");
      else if (scenario.startsWith("budgetLimited-")) terminalGoal("budgetLimited", Number(process.env.FAKE_WORK_TOKENS_USED || 2500), "work stopped");
      else terminalGoal("blocked", Number(process.env.FAKE_WORK_TOKENS_USED || 2500), "work stopped");
    } else if (scenario.endsWith("handoff-complete")) {
      terminalGoal("complete", 3000, "handoff finished");
    } else if (scenario.endsWith("handoff-blocked")) {
      terminalGoal("blocked", 3000, "handoff blocked");
    } else if (scenario.endsWith("handoff-budgetLimited")) {
      terminalGoal("budgetLimited", currentGoalBudget + 1, "handoff exhausted");
    } else if (scenario.endsWith("handoff-failed")) {
      send({ method: "error", params: { message: "fixture failure" } });
    }
  }
});
lines.on("close", () => {
  appendFileSync(process.env.FAKE_CLEANUP, "closed\n");
  if (scenario.endsWith("stubborn-cleanup")) {
    process.on("SIGTERM", () => {});
    setInterval(() => {}, 1_000);
  }
});
