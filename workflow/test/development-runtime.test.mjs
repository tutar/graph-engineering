import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const installer = new URL("../.github/actions/development-codex/scripts/install-runtime.mjs", import.meta.url).pathname;
const bundle = new URL("../.github/actions/development-codex/dist/main.js", import.meta.url).pathname;

async function scenario(t, { installedVersion = null, minimum = "0.153.4", proxy = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "development-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  await mkdir(bin);
  if (installedVersion !== null) {
    const codex = join(bin, "codex");
    await writeFile(codex, `#!/bin/sh\nprintf 'codex-cli ${installedVersion}\\n'\n`);
    await chmod(codex, 0o755);
  }
  const npm = join(bin, "npm");
  await writeFile(npm, `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.writeFileSync(process.env.FAKE_NPM_LOG, JSON.stringify(args));
const prefix = args[args.indexOf("--prefix") + 1];
const target = path.join(prefix, "node_modules", ".bin");
fs.mkdirSync(target, { recursive: true });
for (const name of ["codex", "codex-responses-api-proxy"]) {
  const pkg = args.find((arg) => arg.startsWith("@openai/" + name + "@"));
  if (!pkg) continue;
  const version = pkg.slice(pkg.lastIndexOf("@") + 1);
  fs.writeFileSync(path.join(target, name), "#!/bin/sh\\nprintf 'codex-cli " + version + "\\\\n'\\n", { mode: 0o755 });
}
`);
  await chmod(npm, 0o755);
  const output = join(root, "output");
  const pathFile = join(root, "github-path");
  const npmLog = join(root, "npm-args.json");
  const executed = spawnSync(process.execPath, [installer], {
    encoding: "utf8",
    env: { ...process.env, PATH: bin, RUNNER_TEMP: root, GITHUB_PATH: pathFile,
      GITHUB_OUTPUT: output, CODEX_VERSION: minimum, PROXY_REQUIRED: String(proxy), FAKE_NPM_LOG: npmLog },
  });
  return {
    root, bin, executed,
    output: await readFile(output, "utf8").catch(() => ""),
    path: await readFile(pathFile, "utf8").catch(() => ""),
    npmArgs: JSON.parse(await readFile(npmLog, "utf8").catch(() => "null")),
  };
}

test("Development Action reuses an installed newer stable CLI without npm", async (t) => {
  const result = await scenario(t, { installedVersion: "0.156.1" });
  assert.equal(result.executed.status, 0, result.executed.stderr);
  assert.equal(result.output, "runtime-directory=\n");
  assert.equal(result.path, `${result.bin}\n`);
  assert.equal(result.npmArgs, null);
  assert.match(result.executed.stdout, /Codex CLI 0\.156\.1: reused/);
});

test("Development Action reuses the exact minimum version", async (t) => {
  const result = await scenario(t, { installedVersion: "0.153.4" });
  assert.equal(result.executed.status, 0, result.executed.stderr);
  assert.equal(result.npmArgs, null);
});

for (const installedVersion of ["0.153.3", "garbage", "0.154.0-beta.1", null]) {
  test(`Development Action installs the stable minimum when installed CLI is ${installedVersion ?? "missing"}`, async (t) => {
    const result = await scenario(t, { installedVersion });
    assert.equal(result.executed.status, 0, result.executed.stderr);
    assert.ok(result.npmArgs.includes("@openai/codex@0.153.4"));
    assert.equal(result.npmArgs.some((arg) => arg.startsWith("@openai/codex-responses-api-proxy@")), false);
    assert.match(result.output, /^runtime-directory=.+\n$/);
    assert.match(result.path, /node_modules\/\.bin\n$/);
  });
}

test("API-key path installs only a matching proxy when CLI is reused", async (t) => {
  const result = await scenario(t, { installedVersion: "0.156.1", proxy: true });
  assert.equal(result.executed.status, 0, result.executed.stderr);
  assert.deepEqual(result.npmArgs.filter((arg) => arg.startsWith("@openai/")), ["@openai/codex-responses-api-proxy@0.156.1"]);
  assert.equal(result.path.split("\n").filter(Boolean).length, 2);
  assert.ok(result.path.endsWith(`${result.bin}\n`));
});

test("invalid minimum fails before npm or PATH publication", async (t) => {
  const result = await scenario(t, { installedVersion: "0.156.1", minimum: "latest" });
  assert.notEqual(result.executed.status, 0);
  assert.match(result.executed.stderr, /stable semantic version/);
  assert.equal(result.npmArgs, null);
  assert.equal(result.path, "");
});

test("vendored Task Invocation prepare survives a fresh checkout on rerun", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "development-task-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkout = join(root, "checkout");
  await mkdir(checkout);
  const stateRoot = join(root, "state");
  const prepare = async (attempt) => {
    const output = join(root, `output-${attempt}`);
    await writeFile(output, "");
    const invoked = spawnSync(process.execPath, [bundle, "prepare-task", "--task-state-root", stateRoot, "--task-id", "development", "--matrix-id", ""], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_REPOSITORY: "fixture/repo", GITHUB_RUN_ID: "100", GITHUB_JOB: "development",
        GITHUB_RUN_ATTEMPT: String(attempt), GITHUB_WORKSPACE: checkout, GITHUB_OUTPUT: output },
    });
    assert.equal(invoked.status, 0, invoked.stderr);
    const text = await readFile(output, "utf8");
    const value = (name) => new RegExp(`${name}<<[^\\n]+\\n([^\\n]+)`).exec(text)?.[1];
    return { directory: value("task-directory"), workspace: value("task-workspace"), exists: value("workspace-exists") };
  };
  const initial = await prepare(1);
  assert.equal(initial.exists, "false");
  await writeFile(join(initial.directory, "workspace-initialized"), "");
  await writeFile(join(initial.workspace, "progress.txt"), "incomplete work");
  await writeFile(join(checkout, "progress.txt"), "fresh checkout");
  const resumed = await prepare(2);
  assert.equal(resumed.exists, "true");
  assert.equal(resumed.workspace, initial.workspace);
  assert.equal(await readFile(join(resumed.workspace, "progress.txt"), "utf8"), "incomplete work");
});
