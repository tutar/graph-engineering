import { spawn } from "node:child_process";
import readline from "node:readline";

import { isTerminalGoalStatus } from "./goal-status.mjs";

export class AppServerClient {
  #child;
  #diagnostic;
  #nextId = 1;
  #pending = new Map();
  #notificationWaiters = new Set();
  #closed;
  #lastAgentMessage = "";
  #lastAgentMessageId = "";
  #notification;

  constructor({ command, args, cwd, env, onDiagnostic = () => {}, onNotification = () => {} }) {
    this.#diagnostic = onDiagnostic;
    this.#notification = onNotification;
    this.#child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    this.#closed = new Promise((resolve) => this.#child.once("close", resolve));

    const stdout = readline.createInterface({ input: this.#child.stdout });
    stdout.on("line", (line) => this.#receive(line));
    const stderr = readline.createInterface({ input: this.#child.stderr });
    stderr.on("line", (line) => this.#diagnostic(line));
    this.#child.once("error", (error) => this.#rejectAll(error));
    this.#child.once("exit", (code, signal) => {
      this.#rejectAll(new Error(`Codex App Server exited (${signal ?? code})`));
    });
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: {
        name: "graph_engineering_codex_goal_action",
        title: "Graph Engineering Codex Goal Action",
        version: "1.0.0",
      },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
  }

  request(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#write({ method, id, params });
    });
  }

  notify(method, params = {}) {
    this.#write({ method, params });
  }

  watchTerminalGoal(threadId) {
    let waiter;
    const promise = new Promise((resolve, reject) => {
      waiter = {
        accept: (message) => {
          if (
            message.method === "thread/goal/updated"
            && message.params?.threadId === threadId
            && isTerminalGoalStatus(message.params.goal?.status)
          ) {
            this.#notificationWaiters.delete(waiter);
            resolve({
              status: message.params.goal.status,
              tokensUsed: message.params.goal.tokensUsed ?? 0,
              timeUsedSeconds: message.params.goal.timeUsedSeconds ?? 0,
              finalMessage: this.#lastAgentMessage,
              finalMessageItemId: this.#lastAgentMessageId,
            });
          } else if (message.method === "error") {
            this.#notificationWaiters.delete(waiter);
            reject(new Error(message.params?.error?.message ?? message.params?.message ?? "Codex App Server error"));
          }
        },
        reject,
      };
      this.#notificationWaiters.add(waiter);
    });
    return {
      promise,
      cancel: () => this.#notificationWaiters.delete(waiter),
    };
  }

  resetFinalMessage() {
    this.#lastAgentMessage = "";
    this.#lastAgentMessageId = "";
  }

  finalMessage() {
    return this.#lastAgentMessage;
  }

  async close() {
    if (this.#child.exitCode !== null || this.#child.signalCode !== null) return;
    this.#child.stdin.end();
    const terminate = () => {
      try {
        if (process.platform !== "win32" && this.#child.pid) process.kill(-this.#child.pid, "SIGTERM");
        else this.#child.kill("SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    };
    if (await this.#waitForClose(1_000)) return;
    terminate();
    if (await this.#waitForClose(1_000)) return;
    try {
      if (process.platform !== "win32" && this.#child.pid) process.kill(-this.#child.pid, "SIGKILL");
      else this.#child.kill("SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    await this.#closed;
  }

  async #waitForClose(milliseconds) {
    let timeout;
    const elapsed = new Promise((resolve) => {
      timeout = setTimeout(() => resolve(false), milliseconds);
    });
    try {
      return await Promise.race([this.#closed.then(() => true), elapsed]);
    } finally {
      clearTimeout(timeout);
    }
  }

  #write(message) {
    if (!this.#child.stdin.writable) throw new Error("Codex App Server stdin is closed");
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #receive(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.#rejectAll(new Error("Codex App Server emitted invalid JSON"));
      return;
    }

    if (message.id !== undefined && ("result" in message || "error" in message)) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "Codex App Server request failed"));
      else pending.resolve(message.result);
      return;
    }

    if (message.method === "item/completed" && message.params?.item?.type === "agentMessage") {
      this.#lastAgentMessage = message.params.item.text;
      this.#lastAgentMessageId = message.params.item.id;
    }
    try {
      this.#notification(message);
    } catch (error) {
      this.#diagnostic(`Codex event renderer failed: ${error.message}`);
    }
    for (const waiter of [...this.#notificationWaiters]) waiter.accept(message);
  }

  #rejectAll(error) {
    for (const { reject } of this.#pending.values()) reject(error);
    this.#pending.clear();
    for (const waiter of this.#notificationWaiters) waiter.reject(error);
    this.#notificationWaiters.clear();
  }
}
