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
  return String(value).split(/\r\n|\r|\n/).filter((line) => line.trim()).map(escapeControls);
}

function formattedLines({ phase, event, value, redact }) {
  const redacted = redact(serialized(value));
  return lines(redacted).map((line) => `[codex][${phase}][${event}] ${line}`);
}

export class EventRenderer {
  #logMode;
  #phase = "work";
  #redact;
  #write;
  #writeDiagnostic;
  #agentMessageDeltas = new Map();
  #renderedAgentItems = new Set();
  #textDeltas = new Map();
  #safeDeltas = new Set();

  constructor({ logMode, redact = (value) => value, write = () => {}, writeDiagnostic = () => {} }) {
    this.#logMode = validateLogMode(logMode);
    this.#redact = redact;
    this.#write = write;
    this.#writeDiagnostic = writeDiagnostic;
  }

  setPhase(phase) {
    if (phase !== "work" && phase !== "handoff") throw new Error(`Unknown Goal phase: ${phase}`);
    this.flush();
    this.#phase = phase;
    this.#agentMessageDeltas.clear();
    this.#renderedAgentItems.clear();
    this.#safeDeltas.clear();
  }

  flush() {
    for (const [key, stream] of this.#textDeltas) {
      this.#textDeltas.delete(key);
      try {
        this.#emit(stream.event, stream.text);
      } catch (error) {
        this.diagnostic(`Codex event renderer failed: ${error.message}`);
      }
    }
  }

  render(message) {
    if (this.#logMode === "silent" || !message || typeof message !== "object") return;
    const { method, params } = message;
    if (!params || typeof params !== "object") return;

    if (method === "thread/goal/updated") {
      this.renderGoal(params.goal);
      return;
    }

    if (method === "item/agentMessage/delta") {
      if (typeof params.delta !== "string") return;
      if (this.#logMode === "safe") this.#delta("agent-message", params);
      else this.#agentMessageDeltas.set(
        params.itemId,
        `${this.#agentMessageDeltas.get(params.itemId) ?? ""}${params.delta}`,
      );
      return;
    }

    if (method === "item/reasoning/summaryPartAdded") {
      this.#emit("reasoning-summary", "event=part-added");
      return;
    }

    if (method === "item/reasoning/summaryTextDelta") {
      this.#delta("reasoning-summary", params);
      return;
    }

    if (method === "item/commandExecution/outputDelta") {
      this.#delta("command-output", params);
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
    if (method === "item/completed") this.#flushItem({ ...params, itemId: item.id });
    this.#renderItem(method === "item/started" ? "started" : "completed", item);
  }

  #delta(event, params) {
    if (typeof params.delta !== "string" || !params.delta) return;
    const identity = JSON.stringify([params.threadId, params.turnId, params.itemId]);
    const key = JSON.stringify([event, identity, params.summaryIndex]);
    if (this.#logMode === "safe") {
      if (!this.#safeDeltas.has(key)) {
        this.#safeDeltas.add(key);
        this.#emit(event, "event=delta");
      }
      return;
    }
    const stream = this.#textDeltas.get(key) ?? { event, identity, text: "" };
    stream.text += params.delta;
    this.#textDeltas.set(key, stream);
    // App Server deltas are transport fragments; retain incomplete lines and a
    // trailing CR so a CRLF split across notifications stays one delimiter.
    while (true) {
      const index = stream.text.search(/[\r\n]/);
      if (index < 0 || (stream.text[index] === "\r" && index === stream.text.length - 1)) return;
      const line = stream.text.slice(0, index);
      const delimiterLength = stream.text.slice(index, index + 2) === "\r\n" ? 2 : 1;
      stream.text = stream.text.slice(index + delimiterLength);
      this.#emit(event, line);
    }
  }

  #flushItem(params) {
    const identity = JSON.stringify([params.threadId, params.turnId, params.itemId]);
    for (const [key, stream] of this.#textDeltas) {
      if (stream.identity !== identity) continue;
      this.#textDeltas.delete(key);
      this.#emit(stream.event, stream.text);
    }
  }

  ensureFinalMessage({ itemId, text }) {
    if (this.#logMode === "silent" || !text || this.#renderedAgentItems.has(itemId)) return;
    this.#renderedAgentItems.add(itemId);
    if (this.#logMode === "safe") this.#emit("agent-message", "event=terminal-fallback");
    else this.#emit("agent-message", text);
  }

  renderGoal(goal) {
    if (this.#logMode === "silent" || !goal || typeof goal !== "object") return;
    const fields = [`status=${serialized(goal.status)}`];
    if (goal.tokensUsed !== undefined) fields.push(`tokens=${serialized(goal.tokensUsed)}`);
    if (goal.timeUsedSeconds !== undefined) fields.push(`elapsed=${serialized(goal.timeUsedSeconds)}s`);
    this.#emit("goal", fields.join(" "));
  }

  diagnostic(value) {
    for (const line of formattedLines({ phase: this.#phase, event: "diagnostic", value, redact: this.#redact })) {
      this.#writeDiagnostic(line);
    }
  }

  #renderItem(event, item) {
    if (item.type === "agentMessage") {
      if (event !== "completed") return;
      const streamedText = this.#agentMessageDeltas.get(item.id) ?? "";
      this.#agentMessageDeltas.delete(item.id);
      this.#renderedAgentItems.add(item.id);
      if (this.#logMode === "safe") this.#emit("agent-message", "event=completed");
      else {
        const text = typeof item.text === "string" ? item.text : streamedText;
        if (text) this.#emit("agent-message", text);
      }
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
    for (const line of formattedLines({ phase: this.#phase, event, value, redact: this.#redact })) this.#write(`${line}\n`);
  }
}

export function writeSafeLog({ phase, event, value, write, redact = (text) => text }) {
  for (const line of formattedLines({ phase, event, value, redact })) write(`${line}\n`);
}
