const LOG_MODES = new Set(["safe", "detailed", "silent"]);
const ITEM_TYPES = new Set(["agentMessage", "reasoning", "commandExecution", "mcpToolCall", "fileChange"]);

export function validateLogMode(value) {
  if (!LOG_MODES.has(value)) throw new Error("log-mode must be safe, detailed, or silent");
  return value;
}

function serialized(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function escapeControls(value) {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, (character) => {
    const codePoint = character.codePointAt(0);
    return `\\u${codePoint.toString(16).padStart(codePoint > 0xffff ? 8 : 4, "0")}`;
  });
}

function lines(value) {
  return String(value).split(/\r\n|\r|\n/).map(escapeControls);
}

export class EventRenderer {
  #logMode;
  #phase = "work";
  #redact;
  #write;
  #streamedAgentItems = new Set();
  #renderedAgentItems = new Set();

  constructor({ logMode, redact = (value) => value, write = () => {} }) {
    this.#logMode = validateLogMode(logMode);
    this.#redact = redact;
    this.#write = write;
  }

  setPhase(phase) {
    if (phase !== "work" && phase !== "handoff") throw new Error(`Unknown Goal phase: ${phase}`);
    this.#phase = phase;
    this.#streamedAgentItems.clear();
    this.#renderedAgentItems.clear();
  }

  render(message) {
    if (this.#logMode === "silent" || !message || typeof message !== "object") return;
    const { method, params } = message;
    if (!params || typeof params !== "object") return;

    if (method === "thread/goal/updated") {
      const goal = params.goal;
      if (!goal || typeof goal !== "object") return;
      const fields = [`status=${serialized(goal.status)}`];
      if (goal.tokensUsed !== undefined) fields.push(`tokens=${serialized(goal.tokensUsed)}`);
      if (goal.timeUsedSeconds !== undefined) fields.push(`elapsed=${serialized(goal.timeUsedSeconds)}s`);
      this.#emit("goal", fields.join(" "));
      return;
    }

    if (method === "item/agentMessage/delta") {
      if (typeof params.delta !== "string") return;
      this.#streamedAgentItems.add(params.itemId);
      this.#renderedAgentItems.add(params.itemId);
      if (this.#logMode === "safe") this.#emit("agent-message", "event=delta");
      else this.#emit("agent-message", params.delta);
      return;
    }

    if (method === "item/reasoning/summaryPartAdded") {
      this.#emit("reasoning-summary", "event=part-added");
      return;
    }

    if (method === "item/reasoning/summaryTextDelta") {
      if (this.#logMode === "safe") this.#emit("reasoning-summary", "event=delta");
      else if (typeof params.delta === "string") this.#emit("reasoning-summary", params.delta);
      return;
    }

    if (method === "item/commandExecution/outputDelta") {
      if (this.#logMode === "safe") this.#emit("command-output", "event=delta");
      else if (typeof params.delta === "string") this.#emit("command-output", params.delta);
      return;
    }

    if (method === "item/mcpToolCall/progress") {
      if (this.#logMode === "safe") this.#emit("mcp", "event=progress");
      else if (typeof params.message === "string") this.#emit("mcp", `progress=${params.message}`);
      return;
    }

    if (method === "item/fileChange/patchUpdated") {
      if (this.#logMode === "safe") this.#emit("file-change", "event=patch-updated");
      else if (Array.isArray(params.changes)) this.#emit("file-change", params.changes);
      return;
    }

    if (method !== "item/started" && method !== "item/completed") return;
    const item = params.item;
    if (!item || !ITEM_TYPES.has(item.type)) return;
    this.#renderItem(method === "item/started" ? "started" : "completed", item);
  }

  ensureFinalMessage({ itemId, text }) {
    if (this.#logMode === "silent" || !text || this.#renderedAgentItems.has(itemId)) return;
    this.#renderedAgentItems.add(itemId);
    if (this.#logMode === "safe") this.#emit("agent-message", "event=terminal-fallback");
    else this.#emit("agent-message", text);
  }

  #renderItem(event, item) {
    if (item.type === "agentMessage") {
      if (event !== "completed" || this.#streamedAgentItems.has(item.id)) return;
      this.#renderedAgentItems.add(item.id);
      if (this.#logMode === "safe") this.#emit("agent-message", "event=completed");
      else if (typeof item.text === "string") this.#emit("agent-message", item.text);
      return;
    }

    if (item.type === "reasoning") {
      this.#emit("reasoning-summary", `event=${event}`);
      return;
    }

    if (item.type === "commandExecution") {
      if (this.#logMode === "safe") {
        const fields = [`event=${event}`, `status=${serialized(item.status)}`];
        if (item.exitCode !== undefined && item.exitCode !== null) fields.push(`exit=${serialized(item.exitCode)}`);
        this.#emit("command", fields.join(" "));
      } else if (event === "started") {
        if (typeof item.command === "string") this.#emit("command", item.command);
      } else {
        const fields = [`status=${serialized(item.status)}`];
        if (item.exitCode !== undefined && item.exitCode !== null) fields.push(`exit=${serialized(item.exitCode)}`);
        this.#emit("command", fields.join(" "));
      }
      return;
    }

    if (item.type === "mcpToolCall") {
      if (this.#logMode === "safe") {
        this.#emit("mcp", `event=${event} status=${serialized(item.status)}`);
      } else if (event === "started") {
        this.#emit("mcp", `server=${serialized(item.server)} tool=${serialized(item.tool)} arguments=${serialized(item.arguments)}`);
      } else {
        const outcome = item.error ?? item.result;
        this.#emit("mcp", `status=${serialized(item.status)} result=${serialized(outcome)}`);
      }
      return;
    }

    if (this.#logMode === "safe") {
      this.#emit("file-change", `event=${event} status=${serialized(item.status)}`);
    } else {
      this.#emit("file-change", `status=${serialized(item.status)} changes=${serialized(item.changes)}`);
    }
  }

  #emit(event, value) {
    const redacted = this.#redact(serialized(value));
    for (const line of lines(redacted)) {
      this.#write(`[codex][${this.#phase}][${event}] ${line}\n`);
    }
  }
}
