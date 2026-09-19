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
import { runCodexGoal } from "../.github/actions/codex-goal/lib/run.mjs";
import { prepareCodexCli } from "../.github/actions/codex-goal/lib/prepare-cli.mjs";

const fakeAppServer = new URL("fixtures/fake-codex-app-server.mjs", import.meta.url).pathname;

async function runScenario(t, scenario, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "codex-goal-action-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const transcript = join(root, "transcript.jsonl");
  const cleanup = join(root, "cleanup.txt");
  const result = await runCodexGoal({
    command: process.execPath,
    args: [fakeAppServer],
    env: {
      ...process.env,
      FAKE_SCENARIO: scenario,
      FAKE_TRANSCRIPT: transcript,
      FAKE_CLEANUP: cleanup,
    },
    workingDirectory: root,
    prompt: "finish the requested work",
    handoffPrompt: "save suitable progress once",
    tokenBudget: "400000",
    permissionProfile: ":workspace",
    ...overrides,
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

async function invokeAction(t, scenario) {
  const root = await mkdtemp(join(tmpdir(), "codex-goal-entrypoint-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  await mkdir(bin);
  const codex = join(bin, "codex");
  await writeFile(codex, `#!/bin/sh
if [ "$1" = "--version" ]; then
  printf 'codex-cli 0.153.4\\n'
  exit 0
fi
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
      GITHUB_OUTPUT: output,
      INPUT_WORKING_DIRECTORY: root,
      INPUT_PROMPT: "work objective",
      INPUT_TOKEN_BUDGET: "400000",
      INPUT_HANDOFF_PROMPT: "handoff objective",
      INPUT_CODEX_VERSION: "0.153.4",
      INPUT_PERMISSION_PROFILE: ":workspace",
      FAKE_SCENARIO: scenario,
      FAKE_TRANSCRIPT: join(root, "transcript.jsonl"),
      FAKE_CLEANUP: join(root, "cleanup.txt"),
    },
  });
  return { process: result, outputs: actionOutputs(await readFile(output, "utf8")) };
}

test("finite token budgets reserve exactly 20,000 tokens for Handoff", () => {
  assert.equal(DEFAULT_TOTAL_TOKEN_BUDGET, 400_000);
  assert.equal(HANDOFF_TOKEN_BUDGET, 20_000);
  assert.deepEqual(splitTokenBudget(undefined), {
    state: "finite",
    total: 400_000,
    work: 380_000,
    handoff: 20_000,
  });
});

test("unlimited applies only to Work Goal and invalid finite totals fail closed", () => {
  assert.deepEqual(splitTokenBudget("unlimited"), {
    state: "unlimited",
    total: null,
    work: null,
    handoff: 20_000,
  });

  for (const value of ["", "0", "20000", "-1", "20.5", "not-a-budget"]) {
    assert.throws(() => splitTokenBudget(value), /token-budget/);
  }
  assert.deepEqual(splitTokenBudget("20001"), {
    state: "finite",
    total: 20_001,
    work: 1,
    handoff: 20_000,
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
    tokenBudget: 380_000,
  });
  assert.equal(await readFile(cleanup, "utf8"), "closed\n");
});

for (const workStatus of ["blocked", "budgetLimited"]) {
  test(`${workStatus} starts one Handoff in the same Session with a fixed budget`, async (t) => {
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
      tokenBudget: 20_000,
    });
  });
}

test("unlimited Work Goal keeps the fixed finite Handoff budget", async (t) => {
  const { result, messages } = await runScenario(t, "blocked-handoff-complete", {
    tokenBudget: "unlimited",
  });
  assert.equal(result.tokenBudgetState, "unlimited");
  const goals = messages.filter(({ method }) => method === "thread/goal/set");
  assert.equal("tokenBudget" in goals[0].params, false);
  assert.equal(goals[1].params.tokenBudget, 20_000);
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
  const { messages } = await runScenario(t, "work-complete", {
    apiKey: secret,
    onDiagnostic: (line) => diagnostics.push(line),
  });
  const login = messages.find(({ method }) => method === "account/login/start");
  assert.deepEqual(login.params, { type: "apiKey", apiKey: "<redacted>" });
  assert.doesNotMatch(diagnostics.join("\n"), new RegExp(secret));
  const isolatedHome = messages.find(({ method }) => method === "fixture/environment").params.codexHome;
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

test("public Action entrypoint succeeds only for Work complete", async (t) => {
  const { process: completed, outputs } = await invokeAction(t, "work-complete");
  assert.equal(completed.status, 0, completed.stderr);
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
