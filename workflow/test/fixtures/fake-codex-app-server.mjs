import { appendFileSync } from "node:fs";
import readline from "node:readline";

const scenario = process.env.FAKE_SCENARIO;
const transcript = process.env.FAKE_TRANSCRIPT;
let goalCount = 0;
let currentGoalBudget = null;
const persistedFinalMessages = [];

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

function item(method, value) {
  send({
    method,
    params: {
      threadId: "thread-1",
      turnId: `turn-${goalCount}`,
      ...(method === "item/started" ? { startedAtMs: Date.now() } : { completedAtMs: Date.now() }),
      item: value,
    },
  });
}

function runtimeEvents() {
  const canary = process.env.FAKE_SECRET_CANARY || "fixture-secret";
  const agentText = goalCount === 1
    ? (new Set(["runtime-events-complete", "runtime-events-delayed-complete"]).has(scenario) ? "work finished" : "work stopped")
    : "handoff finished";
  send({ method: "account/updated", params: { account: { email: `hidden-${canary}` } } });
  send({ method: "fixture/unknown", params: { hidden: `unknown-${canary}` } });
  send({
    method: "item/reasoning/summaryPartAdded",
    params: { threadId: "thread-1", turnId: `turn-${goalCount}`, itemId: "reason-1", summaryIndex: 0 },
  });
  send({
    method: "item/reasoning/summaryTextDelta",
    params: {
      threadId: "thread-1",
      turnId: `turn-${goalCount}`,
      itemId: "reason-1",
      summaryIndex: 0,
      delta: `visible reasoning\n::warning::not a command \u001b[31m ${canary}`,
    },
  });
  send({
    method: "item/reasoning/textDelta",
    params: { threadId: "thread-1", turnId: `turn-${goalCount}`, itemId: "reason-1", contentIndex: 0, delta: "hidden reasoning" },
  });
  item("item/started", {
    id: "command-1",
    type: "commandExecution",
    command: `printf '${canary}\\nsecond line'`,
    cwd: "/tmp",
    commandActions: [],
    status: "inProgress",
  });
  send({
    method: "item/commandExecution/outputDelta",
    params: { threadId: "thread-1", turnId: `turn-${goalCount}`, itemId: "command-1", delta: `stdout ${canary}\nstderr ::error::still data` },
  });
  item("item/completed", {
    id: "command-1",
    type: "commandExecution",
    command: "printf",
    cwd: "/tmp",
    commandActions: [],
    status: "completed",
    exitCode: 0,
    durationMs: 5,
    aggregatedOutput: "must not repeat",
  });
  item("item/started", {
    id: "mcp-1",
    type: "mcpToolCall",
    server: "fixture",
    tool: "lookup",
    arguments: { query: `value-${canary}` },
    status: "inProgress",
  });
  send({
    method: "item/mcpToolCall/progress",
    params: { threadId: "thread-1", turnId: `turn-${goalCount}`, itemId: "mcp-1", message: "halfway" },
  });
  item("item/completed", {
    id: "mcp-1",
    type: "mcpToolCall",
    server: "fixture",
    tool: "lookup",
    arguments: {},
    status: "completed",
    result: { content: [{ type: "text", text: `result-${canary}` }] },
  });
  send({
    method: "item/fileChange/patchUpdated",
    params: {
      threadId: "thread-1",
      turnId: `turn-${goalCount}`,
      itemId: "file-1",
      changes: [{ path: "example.txt", kind: { type: "update", move_path: null }, diff: "+changed" }],
    },
  });
  item("item/completed", {
    id: "file-1",
    type: "fileChange",
    changes: [{ path: "example.txt", kind: { type: "update", move_path: null }, diff: "+changed" }],
    status: "completed",
  });
  send({
    method: "item/agentMessage/delta",
    params: { threadId: "thread-1", turnId: `turn-${goalCount}`, itemId: `message-${goalCount}`, delta: agentText },
  });
}

function terminalGoal(status, tokensUsed, finalMessage) {
  finalMessage = process.env.FAKE_FINAL_MESSAGE || finalMessage;
  persistedFinalMessages[goalCount - 1] = finalMessage;
  const suppressAgentEvent = scenario === "missing-agent-event-complete"
    || (scenario === "blocked-handoff-missing-agent-event" && goalCount === 2);
  if (finalMessage && !suppressAgentEvent) {
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
  } else if (message.method === "thread/read") {
    send({
      id: message.id,
      result: {
        thread: {
          id: "thread-1",
          turns: persistedFinalMessages.map((text, index) => ({
            id: `turn-${index + 1}`,
            status: "completed",
            items: text
              ? [{ id: `message-${index + 1}`, type: "agentMessage", text }]
              : [],
          })),
        },
      },
    });
  } else if (message.method === "thread/goal/set") {
    goalCount += 1;
    currentGoalBudget = message.params.tokenBudget ?? null;
    if (scenario === "terminal-response-complete") {
      persistedFinalMessages[goalCount - 1] = "response finished";
      send({ id: message.id, result: { goal: { ...message.params, status: "complete", tokensUsed: 7, timeUsedSeconds: 2 } } });
      return;
    }
    send({ id: message.id, result: { goal: { ...message.params, tokensUsed: 0 } } });
    if (scenario.startsWith("runtime-events")) runtimeEvents();
    if (scenario === "invalid-json") {
      process.stdout.write("not-json\n");
      return;
    }
    if (scenario === "runtime-events-delayed-complete") {
      setTimeout(() => terminalGoal("complete", 1234, "work finished"), 250);
      return;
    }
    if (scenario === "missing-agent-event-complete" && process.env.FAKE_SECRET_CANARY) {
      process.stderr.write(`diagnostic ${process.env.FAKE_SECRET_CANARY}\n`);
    }
    if (goalCount === 1) {
      if (scenario === "app-server-failed") {
        send({ method: "error", params: { message: process.env.FAKE_PROTOCOL_ERROR || "fixture App Server failure" } });
      } else if (scenario.startsWith("work-complete") || scenario === "runtime-events-complete" || scenario === "missing-agent-event-complete") terminalGoal("complete", 1234, "work finished");
      else if (scenario.startsWith("budgetLimited-")) terminalGoal("budgetLimited", Number(process.env.FAKE_WORK_TOKENS_USED || 2500), "work stopped");
      else terminalGoal("blocked", Number(process.env.FAKE_WORK_TOKENS_USED || 2500), "work stopped");
    } else if (scenario.endsWith("handoff-complete")) {
      terminalGoal("complete", Number(process.env.FAKE_HANDOFF_TOKENS_USED || 3000), "handoff finished");
    } else if (scenario === "blocked-handoff-missing-agent-event") {
      terminalGoal("complete", 3000, "handoff recovered");
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
