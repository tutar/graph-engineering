import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_TOTAL_TOKEN_BUDGET,
  HANDOFF_TOKEN_BUDGET,
  splitTokenBudget,
} from "../.github/actions/codex-goal/lib/budget.mjs";
import { runAgentAction } from "../.github/actions/codex-goal/lib/run.mjs";
import { installCodexCli, prepareCodexCli } from "../.github/actions/codex-goal/lib/prepare-cli.mjs";

const fakeAppServer = new URL("fixtures/fake-codex-app-server.mjs", import.meta.url).pathname;

async function runScenario(t, scenario, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "codex-goal-action-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transcript = join(root, "transcript.jsonl");
  const cleanup = join(root, "cleanup.txt");
  const { env: envOverrides = {}, ...optionOverrides } = overrides;
  const result = await runAgentAction({
    command: process.execPath,
    args: [fakeAppServer],
    env: {
      ...process.env,
      FAKE_SCENARIO: scenario,
      FAKE_TRANSCRIPT: transcript,
      FAKE_CLEANUP: cleanup,
      RUNNER_TEMP: root,
      ...envOverrides,
    },
    workingDirectory: root,
    prompt: "finish the requested work",
    handoffPrompt: "save suitable progress once",
    tokenBudget: "400000",
    permissionProfile: ":workspace",
    ...optionOverrides,
  });
  const messages = (await readFile(transcript, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  return { result, messages, root, cleanup };
}

async function fakeCodex(directory, version) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, "codex");
  await writeFile(path, `#!/bin/sh\nprintf 'codex-cli ${version}\\n'\n`);
  await chmod(path, 0o755);
  return path;
}

function actionOutputs(text) {
  const result = {};
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^([^<]+)<<(.+)$/);
    if (!match) continue;
    const value = [];
    while (lines[++index] !== match[2]) value.push(lines[index]);
    result[match[1]] = value.join("\n");
  }
  return result;
}

async function invokeAction(t, scenario, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "codex-goal-entrypoint-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  await mkdir(bin);
  const codex = join(bin, "codex");
  const argsFile = join(root, "codex-args.txt");
  await writeFile(codex, `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf 'codex-cli 0.153.4\\n'
  exit 0
fi
printf '%s\\n' "$@" > "$FAKE_CODEX_ARGS"
exec "${process.execPath}" "${fakeAppServer}"
`);
  await chmod(codex, 0o755);
  const output = join(root, "github-output.txt");
  await writeFile(output, "");
  const result = spawnSync(process.execPath, [new URL("../.github/actions/codex-goal/index.mjs", import.meta.url).pathname], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: bin,
      RUNNER_TOOL_CACHE: join(root, "tool-cache"),
      RUNNER_TEMP: root,
      GITHUB_OUTPUT: output,
      "INPUT_WORKING-DIRECTORY": overrides.workingDirectory ?? root,
      INPUT_PROMPT: overrides.prompt ?? "work objective",
      "INPUT_TOKEN-BUDGET": overrides.tokenBudget ?? "400000",
      "INPUT_HANDOFF-PROMPT": overrides.handoffPrompt ?? "handoff objective",
      "INPUT_CODEX-VERSION": overrides.codexVersion ?? "0.153.4",
      "INPUT_PERMISSION-PROFILE": overrides.permissionProfile ?? "graph-engineering-delivery",
      "INPUT_LOG-MODE": overrides.logMode ?? "safe",
      ...(overrides.openAIKey ? { OPENAI_API_KEY: overrides.openAIKey, FAKE_SECRET_CANARY: overrides.openAIKey } : {}),
      FAKE_CODEX_ARGS: argsFile,
      FAKE_SCENARIO: scenario,
      FAKE_TRANSCRIPT: join(root, "transcript.jsonl"),
      FAKE_CLEANUP: join(root, "cleanup.txt"),
    },
  });
  return {
    process: result,
    outputs: actionOutputs(await readFile(output, "utf8")),
    codexArgs: await readFile(argsFile, "utf8").catch(() => ""),
  };
}

test("finite token budgets reserve exactly 100,000 tokens for Handoff", () => {
  assert.equal(DEFAULT_TOTAL_TOKEN_BUDGET, 400_000);
  assert.equal(HANDOFF_TOKEN_BUDGET, 100_000);
  assert.deepEqual(splitTokenBudget(undefined), {
    state: "finite",
    total: 400_000,
    work: 300_000,
    handoff: 100_000,
  });
});

test("unlimited applies only to Work Goal and invalid finite totals fail closed", () => {
  assert.deepEqual(splitTokenBudget("unlimited"), {
    state: "unlimited",
    total: null,
    work: null,
    handoff: 100_000,
  });

  for (const value of ["", "0", "100000", "-1", "20.5", "not-a-budget"]) {
    assert.throws(() => splitTokenBudget(value), /token-budget/);
  }
  assert.deepEqual(splitTokenBudget("100001"), {
    state: "finite",
    total: 100_001,
    work: 1,
    handoff: 100_000,
  });
});

test("Work Goal complete returns structured success without starting Handoff", async (t) => {
  const { result, messages, root, cleanup } = await runScenario(t, "work-complete");
  assert.deepEqual(result, {
    workGoalStatus: "complete",
    handoffGoalStatus: "not-started",
    tokenBudgetState: "finite",
    workTokensUsed: 1234,
    handoffTokensUsed: 0,
    finalMessage: "work finished",
  });

  const started = messages.find(({ method }) => method === "thread/start");
  assert.deepEqual(started.params, {
    cwd: root,
    permissions: ":workspace",
    approvalPolicy: "never",
    ephemeral: false,
  });
  const initialized = messages.find(({ method }) => method === "initialize");
  assert.deepEqual(initialized.params.capabilities, { experimentalApi: true });
  const goals = messages.filter(({ method }) => method === "thread/goal/set");
  assert.equal(goals.length, 1);
  assert.deepEqual(goals[0].params, {
    threadId: "thread-1",
    objective: "finish the requested work",
    status: "active",
    tokenBudget: 300_000,
  });
  assert.equal(await readFile(cleanup, "utf8"), "closed\n");
});

for (const workStatus of ["blocked", "budgetLimited"]) {
  test(`${workStatus} starts one Handoff in the same Session within the finite total budget`, async (t) => {
    const { result, messages, root } = await runScenario(t, `${workStatus}-handoff-complete`);
    assert.deepEqual(result, {
      workGoalStatus: workStatus,
      handoffGoalStatus: "complete",
      tokenBudgetState: "finite",
      workTokensUsed: 2500,
      handoffTokensUsed: 500,
      finalMessage: "handoff finished",
    });
    const starts = messages.filter(({ method }) => method === "thread/start");
    assert.equal(starts.length, 1);
    assert.equal(starts[0].params.cwd, root);
    const goals = messages.filter(({ method }) => method === "thread/goal/set");
    assert.equal(goals.length, 2);
    assert.deepEqual(goals[1].params, {
      threadId: "thread-1",
      objective: "save suitable progress once",
      status: "active",
      tokenBudget: 102_500,
    });
  });
}

test("finite Handoff allowance is capped by the configured total budget", async (t) => {
  const { messages } = await runScenario(t, "budgetLimited-handoff-complete", {
    env: { FAKE_WORK_TOKENS_USED: "390000" },
  });
  const goals = messages.filter(({ method }) => method === "thread/goal/set");
  assert.equal(goals[1].params.tokenBudget, 400_000);
});

test("Handoff usage fails closed when Runtime cumulative usage moves backwards", async (t) => {
  const { result } = await runScenario(t, "blocked-handoff-complete", {
    env: { FAKE_HANDOFF_TOKENS_USED: "2000" },
  });
  assert.equal(result.handoffGoalStatus, "failed");
  assert.equal(result.handoffTokensUsed, 0);
  assert.match(result.finalMessage, /moved backwards/);
});

test("unlimited Work Goal adds the fixed Handoff allowance to cumulative usage", async (t) => {
  const { result, messages } = await runScenario(t, "blocked-handoff-complete", {
    tokenBudget: "unlimited",
  });
  assert.equal(result.tokenBudgetState, "unlimited");
  const goals = messages.filter(({ method }) => method === "thread/goal/set");
  assert.equal("tokenBudget" in goals[0].params, false);
  assert.equal(goals[1].params.tokenBudget, 102_500);
});

for (const terminal of ["blocked", "budgetLimited"]) {
  test(`Handoff ${terminal} is structured and never starts a second Handoff`, async (t) => {
    const { result, messages } = await runScenario(t, `blocked-handoff-${terminal}`);
    assert.equal(result.workGoalStatus, "blocked");
    assert.equal(result.handoffGoalStatus, terminal);
    assert.equal(messages.filter(({ method }) => method === "thread/goal/set").length, 2);
  });
}

test("ordinary Handoff failure is structured and does not recurse", async (t) => {
  const { result, messages } = await runScenario(t, "blocked-handoff-failed");
  assert.equal(result.workGoalStatus, "blocked");
  assert.equal(result.handoffGoalStatus, "failed");
  assert.match(result.finalMessage, /fixture failure/);
  assert.equal(messages.filter(({ method }) => method === "thread/goal/set").length, 2);
});

test("API key login is isolated to the App Server protocol and never appears in diagnostics", async (t) => {
  const secret = "sk-test-secret-that-must-not-leak";
  const diagnostics = [];
  const { result, messages } = await runScenario(t, "work-complete", {
    apiKey: secret,
    env: {
      OPENAI_API_KEY: secret,
      FAKE_FINAL_MESSAGE: `finished without exposing ${secret}`,
    },
    onDiagnostic: (line) => diagnostics.push(line),
  });
  const login = messages.find(({ method }) => method === "account/login/start");
  assert.deepEqual(login.params, { type: "apiKey", apiKey: "<redacted>" });
  assert.doesNotMatch(diagnostics.join("\n"), new RegExp(secret));
  assert.equal(result.finalMessage, "finished without exposing ***");
  const isolatedHome = messages.find(({ method }) => method === "fixture/environment").params.codexHome;
  assert.equal(messages.find(({ method }) => method === "fixture/environment").params.hasOpenAIKey, false);
  assert.notEqual(isolatedHome, process.env.CODEX_HOME);
  await assert.rejects(access(isolatedHome));
});

test("matching PATH and versioned tool-cache CLIs are reused without installation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codex-cli-cache-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pathBin = join(root, "path-bin");
  const pathCodex = await fakeCodex(pathBin, "0.153.4");
  let installs = 0;
  assert.equal(await prepareCodexCli({
    version: "0.153.4",
    runnerToolCache: join(root, "cache"),
    path: pathBin,
    install: async () => { installs += 1; },
  }), pathCodex);

  const cacheBin = join(root, "cache", "codex", "0.153.4", process.arch, "bin");
  const cachedCodex = await fakeCodex(cacheBin, "0.153.4");
  assert.equal(await prepareCodexCli({
    version: "0.153.4",
    runnerToolCache: join(root, "cache"),
    path: "",
    install: async () => { installs += 1; },
  }), cachedCodex);
  assert.equal(installs, 0);
});

test("missing fixed CLI installs once into the versioned tool cache", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codex-cli-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let installs = 0;
  const resolved = await prepareCodexCli({
    version: "0.153.4",
    runnerToolCache: join(root, "cache"),
    path: "",
    install: async ({ binDirectory, version }) => {
      installs += 1;
      await fakeCodex(binDirectory, version);
    },
  });
  assert.equal(resolved, join(root, "cache", "codex", "0.153.4", process.arch, "bin", "codex"));
  assert.equal(installs, 1);
  assert.equal(await prepareCodexCli({
    version: "0.153.4",
    runnerToolCache: join(root, "cache"),
    path: "",
    install: async () => { installs += 1; },
  }), resolved);
  assert.equal(installs, 1);
});

test("default installer pins the npm package and leaves a reusable cache executable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codex-cli-default-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const npm = join(root, "fake-npm.mjs");
  const log = join(root, "npm-args.json");
  await writeFile(npm, `#!/usr/bin/env node
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const args = process.argv.slice(2);
await writeFile(${JSON.stringify(log)}, JSON.stringify(args));
const prefix = args[args.indexOf("--prefix") + 1];
const version = args.at(-1).split("@").at(-1);
const bin = join(prefix, "node_modules", ".bin");
await mkdir(bin, { recursive: true });
const codex = join(bin, "codex");
await writeFile(codex, \`#!/bin/sh\\nprintf 'codex-cli \${version}\\\\n'\\n\`);
await chmod(codex, 0o755);
`);
  await chmod(npm, 0o755);
  const installRoot = join(root, "cache", "codex", "0.153.4", process.arch);
  const binDirectory = join(installRoot, "bin");
  await installCodexCli({ installRoot, binDirectory, version: "0.153.4", npmCommand: npm });
  const cached = join(binDirectory, "codex");
  assert.equal(spawnSync(cached, ["--version"], { encoding: "utf8" }).stdout.trim(), "codex-cli 0.153.4");
  const npmArgs = JSON.parse(await readFile(log, "utf8"));
  assert.equal(npmArgs.at(-1), "@openai/codex@0.153.4");
  assert.equal(npmArgs[npmArgs.indexOf("--prefix") + 1], installRoot);
});

test("cleanup escalates from graceful close to SIGKILL for a stubborn App Server", async (t) => {
  const started = Date.now();
  const { result } = await runScenario(t, "work-complete-stubborn-cleanup");
  assert.equal(result.workGoalStatus, "complete");
  assert.ok(Date.now() - started < 4_000);
});

test("public Action entrypoint configures bounded Git delivery and succeeds only for Work complete", async (t) => {
  const { process: completed, outputs, codexArgs } = await invokeAction(t, "work-complete");
  assert.equal(completed.status, 0, completed.stderr);
  assert.match(codexArgs, /permissions\.graph-engineering-delivery=/);
  assert.match(codexArgs, /":workspace_roots"/);
  assert.match(codexArgs, /"\.git" = "write"/);
  assert.match(codexArgs, /network = \{ enabled = true \}/);
  assert.match(codexArgs, /default_permissions="graph-engineering-delivery"/);
  assert.equal(outputs["work-goal-status"], "complete");
  assert.equal(outputs["handoff-goal-status"], "not-started");
  assert.equal(outputs["final-message"], "work finished");

  const { process: handedOff, outputs: handoffOutputs } = await invokeAction(t, "blocked-handoff-failed");
  assert.equal(handedOff.status, 1);
  assert.equal(handoffOutputs["work-goal-status"], "blocked");
  assert.equal(handoffOutputs["handoff-goal-status"], "failed");
});

test("App Server exceptions produce explicit structured failure outputs", async (t) => {
  const { process: failed, outputs } = await invokeAction(t, "app-server-failed");
  assert.equal(failed.status, 1);
  assert.equal(outputs["work-goal-status"], "failed");
  assert.equal(outputs["handoff-goal-status"], "not-started");
  assert.equal(outputs["token-budget-state"], "finite");
  assert.match(outputs["final-message"], /fixture App Server failure/);
});

test("clean App Server exit while a request is pending cannot deadlock", async (t) => {
  const { process: failed, outputs } = await invokeAction(t, "clean-exit");
  assert.equal(failed.status, 1);
  assert.equal(outputs["work-goal-status"], "failed");
  assert.match(outputs["final-message"], /Codex App Server exited \(0\)/);
});

test("invalid public inputs fail closed before App Server startup", async (t) => {
  for (const overrides of [
    { prompt: "" },
    { handoffPrompt: "" },
    { tokenBudget: "100000" },
    { codexVersion: "latest" },
    { permissionProfile: "" },
    { logMode: "verbose" },
  ]) {
    const { process: failed, outputs } = await invokeAction(t, "work-complete", overrides);
    assert.equal(failed.status, 1);
    assert.equal(outputs["work-goal-status"], "failed");
    assert.equal(outputs["handoff-goal-status"], "not-started");
  }
});

test("detailed mode streams the allowlisted Runtime events with safe line prefixes", async (t) => {
  const secret = "sk-render-secret";
  const { process: completed, outputs } = await invokeAction(t, "runtime-events-complete", {
    logMode: "detailed",
    openAIKey: secret,
  });
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(outputs["work-goal-status"], "complete");
  assert.match(completed.stdout, /^\[codex\]\[work\]\[reasoning-summary\] event=part-added$/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[reasoning-summary\] visible reasoning$/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[reasoning-summary\] ::warning::not a command \\u001b\[31m \*\*\*$/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[command\] printf '\*\*\*\\nsecond line'$/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[command-output\] stdout \*\*\*$/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[command-output\] stderr ::error::still data$/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[command\] status=completed exit=0$/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[mcp\] server=fixture tool=lookup arguments=.*\*\*\*/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[mcp\] progress=halfway$/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[mcp\] status=completed result=.*\*\*\*/m);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[file-change\] .*example\.txt/m);
  assert.equal(completed.stdout.match(/\[codex\]\[work\]\[agent-message\] work finished/g)?.length, 1);
  assert.match(completed.stdout, /^\[codex\]\[work\]\[goal\] status=complete tokens=1234 elapsed=1s$/m);
  assert.doesNotMatch(completed.stdout, /hidden reasoning|hidden-|unknown-|must not repeat|sk-render-secret/);
  assert.ok(completed.stdout.indexOf("reasoning-summary") < completed.stdout.indexOf("command-output"));
  for (const line of completed.stdout.trim().split("\n")) assert.match(line, /^\[codex\]\[work\]\[[a-z-]+\] /);
});

test("safe mode emits only event metadata while silent preserves the previous minimum output", async (t) => {
  const safe = await invokeAction(t, "runtime-events-complete", { logMode: "safe" });
  assert.equal(safe.process.status, 0, safe.process.stderr);
  assert.match(safe.process.stdout, /\[codex\]\[work\]\[command\] event=completed status=completed exit=0/);
  assert.match(safe.process.stdout, /\[codex\]\[work\]\[goal\] status=complete tokens=1234 elapsed=1s/);
  assert.doesNotMatch(safe.process.stdout, /visible reasoning|work finished|printf|stdout|halfway|example\.txt|lookup/);

  const silent = await invokeAction(t, "runtime-events-complete", { logMode: "silent" });
  assert.equal(silent.process.status, 0, silent.process.stderr);
  assert.equal(silent.process.stdout, "");
});

test("Work and Handoff events remain explicitly separated and final-message fallback appears once", async (t) => {
  const handedOff = await invokeAction(t, "runtime-events-blocked-handoff-complete", { logMode: "detailed" });
  assert.equal(handedOff.process.status, 1);
  assert.match(handedOff.process.stdout, /^\[codex\]\[work\]\[goal\] status=blocked tokens=2500 elapsed=1s$/m);
  assert.match(handedOff.process.stdout, /^\[codex\]\[handoff\]\[goal\] status=complete tokens=3000 elapsed=1s$/m);
  assert.equal(handedOff.process.stdout.match(/\[codex\]\[work\]\[agent-message\] work stopped/g)?.length, 1);
  assert.equal(handedOff.process.stdout.match(/\[codex\]\[handoff\]\[agent-message\] handoff finished/g)?.length, 1);
  assert.equal(handedOff.outputs["work-goal-status"], "blocked");
  assert.equal(handedOff.outputs["handoff-goal-status"], "complete");

  const fallback = await invokeAction(t, "work-complete", { logMode: "detailed" });
  assert.equal(fallback.process.status, 0, fallback.process.stderr);
  assert.equal(fallback.process.stdout.match(/\[codex\]\[work\]\[agent-message\] work finished/g)?.length, 1);
});

test("renderer failure is fail-open while invalid App Server JSON remains fatal", async (t) => {
  const diagnostics = [];
  const { result } = await runScenario(t, "runtime-events-complete", {
    logMode: "detailed",
    onLog: () => { throw new Error("fixture renderer sink failed"); },
    onDiagnostic: (line) => diagnostics.push(line),
  });
  assert.equal(result.workGoalStatus, "complete");
  assert.match(diagnostics.join("\n"), /Codex event renderer failed: fixture renderer sink failed/);

  const invalid = await invokeAction(t, "invalid-json", { logMode: "detailed" });
  assert.equal(invalid.process.status, 1);
  assert.match(invalid.outputs["final-message"], /invalid JSON/);
});
