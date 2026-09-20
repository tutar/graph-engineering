import { appendFile, realpath, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { splitTokenBudget } from "./lib/budget.mjs";
import { prepareCodexCli } from "./lib/prepare-cli.mjs";
import { runAgentAction } from "./lib/run.mjs";
import { validateLogMode } from "./lib/event-renderer.mjs";

const OUTPUT_NAMES = {
  workGoalStatus: "work-goal-status",
  handoffGoalStatus: "handoff-goal-status",
  tokenBudgetState: "token-budget-state",
  workTokensUsed: "work-tokens-used",
  handoffTokensUsed: "handoff-tokens-used",
  finalMessage: "final-message",
};

const DELIVERY_PERMISSION_PROFILE = "graph-engineering-delivery";
const DELIVERY_PERMISSION_CONFIG = `permissions.${DELIVERY_PERMISSION_PROFILE}={ extends = ":workspace", filesystem = { ":workspace_roots" = { ".git" = "write" } }, network = { enabled = true } }`;

function input(env, name) {
  return env[`INPUT_${name.toUpperCase()}`] ?? "";
}

async function inputs(env) {
  const workingDirectoryInput = input(env, "working-directory");
  const prompt = input(env, "prompt");
  const handoffPrompt = input(env, "handoff-prompt");
  const codexVersion = input(env, "codex-version");
  const permissionProfile = input(env, "permission-profile");
  const tokenBudget = input(env, "token-budget") || "400000";
  const logMode = input(env, "log-mode") || "safe";

  if (!workingDirectoryInput) throw new Error("working-directory is required");
  const workingDirectory = await realpath(workingDirectoryInput);
  if (!(await stat(workingDirectory)).isDirectory()) throw new Error("working-directory must be a directory");
  for (const [name, value] of [["prompt", prompt], ["handoff-prompt", handoffPrompt]]) {
    if (!value.trim() || value.length > 4_000) throw new Error(`${name} must contain 1 to 4000 characters`);
  }
  if (!permissionProfile.trim()) throw new Error("permission-profile is required");
  splitTokenBudget(tokenBudget);
  validateLogMode(logMode);
  return { workingDirectory, prompt, handoffPrompt, codexVersion, permissionProfile, tokenBudget, logMode };
}

function sanitized(error, env) {
  const secret = env.OPENAI_API_KEY;
  return secret ? error.message.replaceAll(secret, "***") : error.message;
}

async function writeOutputs(path, result) {
  if (!path) throw new Error("GITHUB_OUTPUT is required");
  let text = "";
  for (const [property, name] of Object.entries(OUTPUT_NAMES)) {
    const value = String(result[property] ?? "");
    let delimiter = "CODEX_GOAL_OUTPUT";
    while (value.includes(delimiter)) delimiter += "_X";
    text += `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
  }
  await appendFile(path, text, { encoding: "utf8", mode: 0o600 });
}

function appServerArgs(permissionProfile) {
  const args = ["app-server", "--stdio"];
  if (permissionProfile === DELIVERY_PERMISSION_PROFILE) {
    args.push("-c", DELIVERY_PERMISSION_CONFIG);
  }
  args.push("-c", `default_permissions=${JSON.stringify(permissionProfile)}`);
  return args;
}

export async function executeAction(env = process.env) {
  let tokenBudgetState = "invalid";
  try {
    const configuration = await inputs(env);
    tokenBudgetState = splitTokenBudget(configuration.tokenBudget).state;
    const codex = await prepareCodexCli({
      version: configuration.codexVersion,
      runnerToolCache: env.RUNNER_TOOL_CACHE,
      path: env.PATH,
    });
    const result = await runAgentAction({
      command: codex,
      args: appServerArgs(configuration.permissionProfile),
      env,
      workingDirectory: configuration.workingDirectory,
      prompt: configuration.prompt,
      handoffPrompt: configuration.handoffPrompt,
      tokenBudget: configuration.tokenBudget,
      permissionProfile: configuration.permissionProfile,
      apiKey: env.OPENAI_API_KEY || undefined,
      logMode: configuration.logMode,
      onLog: (line) => process.stdout.write(line),
      onDiagnostic: (line) => process.stderr.write(`${line}\n`),
    });
    await writeOutputs(env.GITHUB_OUTPUT, result);
    return { result, success: result.workGoalStatus === "complete" };
  } catch (error) {
    const result = {
      workGoalStatus: "failed",
      handoffGoalStatus: "not-started",
      tokenBudgetState,
      workTokensUsed: 0,
      handoffTokensUsed: 0,
      finalMessage: sanitized(error, env),
    };
    await writeOutputs(env.GITHUB_OUTPUT, result);
    return { result, success: false };
  }
}

export async function main() {
  const { result, success } = await executeAction();
  if (!success) {
    process.stderr.write(`Codex Goal Action failed: ${result.finalMessage}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
