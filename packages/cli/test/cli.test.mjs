import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { checkWorkflow } from "../lib/check.mjs";
import { exists, listFiles, packageRoot } from "../lib/files.mjs";
import { initWorkflow } from "../lib/init.mjs";
import { migrate } from "../lib/migrate.mjs";

async function project(t) {
  const directory = await mkdtemp(join(tmpdir(), "graph-engineering-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: directory });
  return directory;
}

test("init dry-run plans the whole delivery without writing", async (t) => {
  const directory = await project(t);
  const plan = await initWorkflow( { projectRoot: directory, dryRun: true });
  assert.ok(plan.files.length === 5);
  assert.equal(await exists(join(directory, ".github")), false);
});

test("init installs the whole project-owned delivery and records its source", async (t) => {
  const directory = await project(t);
  const installed = await initWorkflow( { projectRoot: directory });
  assert.equal(await exists(join(directory, ".github", "graph-engineering", "github-development-ticket.mjs")), true);
  const manifest = JSON.parse(await readFile(join(directory, ".github", "graph-engineering", "installation.json"), "utf8"));
  assert.equal(manifest.productVersion, "0.3.1");
  assert.equal(manifest.installations.development.task, "development");
  assert.equal(installed.files.length, (await listFiles(join(packageRoot, "templates", "workflow"))).length);
  const report = await checkWorkflow( { projectRoot: directory });
  assert.equal(report.results.find(({ check }) => check === "workflow-files").status, "PASS");
  assert.equal(report.results.find(({ check }) => check === "github-repository").status, "UNVERIFIED");
});

test("init fails before writing when any target file conflicts", async (t) => {
  const directory = await project(t);
  await initWorkflow( { projectRoot: directory });
  await assert.rejects(initWorkflow( { projectRoot: directory }), /installation conflicts/);
  const manifest = JSON.parse(await readFile(join(directory, ".github", "graph-engineering", "installation.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.installations), ["development"]);
});

test("migrate recognizes the frozen pre-v0.3 layout and replaces its namespace", async (t) => {
  const directory = await project(t);
  const legacy = join(packageRoot, "migrations", "loop-engineering-927bd961", "development");
  await cp(legacy, directory, { recursive: true });
  const plan = await migrate({ projectRoot: directory, interactive: false });
  assert.equal(plan.requiresApply, true);
  assert.equal(await exists(join(directory, ".github", "loop-engineering")), true);
  const applied = await migrate({ projectRoot: directory, apply: true, interactive: false });
  assert.equal(applied.applied, true);
  assert.equal(await exists(join(directory, ".github", "loop-engineering", "github-development-ticket.mjs")), false);
  assert.equal(await exists(join(directory, ".github", "graph-engineering", "github-development-ticket.mjs")), true);
});

test("migrate refuses an installation whose provenance no longer matches", async (t) => {
  const directory = await project(t);
  const legacy = join(packageRoot, "migrations", "loop-engineering-927bd961", "development");
  await cp(legacy, directory, { recursive: true });
  const workflow = join(directory, ".github", "workflows", "github-development-ticket.yml");
  await import("node:fs/promises").then(({ appendFile }) => appendFile(workflow, "\n# local change\n"));
  await assert.rejects(migrate({ projectRoot: directory, apply: true, interactive: false }), /cannot safely migrate modified or unknown/);
  assert.equal(await exists(join(directory, ".github", "loop-engineering")), true);
});


test("CLI installs the whole current workflow without choosing a task", async (t) => {
  const directory = await project(t);
  const result = spawnSync(process.execPath, [join(packageRoot, "bin/graph-engineering.mjs"), "init", "--project", directory], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await exists(join(directory, ".github/workflows/github-development-ticket.yml")), true);
  assert.equal(await exists(join(directory, ".github/workflows/github-pr-review.yml")), false);
});

function cli(directory, ...args) {
  return spawnSync(process.execPath, [join(packageRoot, "bin/graph-engineering.mjs"), ...args, "--project", directory], { encoding: "utf8" });
}

async function githubContents(directory) {
  const root = join(directory, ".github");
  return Promise.all((await listFiles(root)).map(async (file) => [file, await readFile(join(root, file), "utf8")]));
}

test("CLI repeated checks preserve project-owned files and report local changes", async (t) => {
  const directory = await project(t);
  assert.equal(cli(directory, "init").status, 0);
  const before = await githubContents(directory);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const checked = cli(directory, "check", "--json");
    assert.equal(checked.status, 0, checked.stderr);
    const report = JSON.parse(checked.stdout);
    assert.equal(report.results.find(({ check }) => check === "workflow-files").status, "PASS");
    assert.equal(report.results.find(({ check }) => check === "installation-manifest").status, "PASS");
    assert.deepEqual(await githubContents(directory), before);
  }
  const { appendFile } = await import("node:fs/promises");
  await appendFile(join(directory, ".github/workflows/github-development-ticket.yml"), "\n# Consumer customization\n");
  const modified = await githubContents(directory);
  const report = JSON.parse(cli(directory, "check", "--json").stdout);
  assert.equal(report.results.find(({ check }) => check === "workflow-files").status, "UNVERIFIED");
  assert.deepEqual(await githubContents(directory), modified);
});

test("CLI conflict does not overwrite or partially install the delivery", async (t) => {
  const directory = await project(t);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(join(directory, ".github/workflows"), { recursive: true });
  await writeFile(join(directory, ".github/workflows/github-development-ticket.yml"), "project-owned workflow\n");
  const before = await githubContents(directory);
  const result = cli(directory, "init");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /installation conflicts/);
  assert.deepEqual(await githubContents(directory), before);
});

test("retired and task-selected CLI interfaces fail explicitly without changing a Consumer", async (t) => {
  const directory = await project(t);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(join(directory, ".github/workflows"), { recursive: true });
  await writeFile(join(directory, ".github/workflows/github-pr-review.yml"), "existing Consumer PR Review\n");
  const before = await githubContents(directory);
  for (const command of ["init", "check"]) {
    const retired = cli(directory, command, "pr-review");
    assert.equal(retired.status, 1);
    assert.match(retired.stderr, /PR Review is retired/);
    const selected = cli(directory, command, "development");
    assert.equal(selected.status, 1);
    assert.match(selected.stderr, /Task selection was removed/);
  }
  const migrated = cli(directory, "migrate", "--apply");
  assert.equal(migrated.status, 1);
  assert.match(migrated.stderr, /PR Review is retired/);
  assert.deepEqual(await githubContents(directory), before);
});

test("Development migration is previewed and preserves unrelated Consumer files", async (t) => {
  const directory = await project(t);
  await cp(join(packageRoot, "migrations/loop-engineering-927bd961/development"), directory, { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(directory, ".github/loop-engineering/consumer-note.txt"), "keep this file\n");
  const before = await githubContents(directory);
  const plan = cli(directory, "migrate");
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /rerun with --apply/);
  assert.match(plan.stdout, /@@/);
  assert.deepEqual(await githubContents(directory), before);
  const applied = cli(directory, "migrate", "--apply");
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(await readFile(join(directory, ".github/loop-engineering/consumer-note.txt"), "utf8"), "keep this file\n");
  assert.equal(JSON.parse(cli(directory, "check", "--json").stdout).results.find(({ check }) => check === "workflow-files").status, "PASS");
});

test("whole-workflow check rejects stale per-task records and inconsistent file lists without writing", async (t) => {
  const directory = await project(t);
  assert.equal(cli(directory, "init").status, 0);
  const path = join(directory, ".github/graph-engineering/installation.json");
  const current = JSON.parse(await readFile(path, "utf8"));
  const { writeFile } = await import("node:fs/promises");
  for (const manifest of [{ ...current, schemaVersion: 1 }, { ...current, files: [] }]) {
    const text = JSON.stringify(manifest);
    await writeFile(path, text);
    const checked = cli(directory, "check", "--json");
    assert.equal(JSON.parse(checked.stdout).results.find(({ check }) => check === "installation-manifest").status, "ACTION REQUIRED");
    assert.equal(await readFile(path, "utf8"), text);
  }
});

test("Development migration conflicts leave the full Consumer unchanged", async (t) => {
  const directory = await project(t);
  await cp(join(packageRoot, "migrations/loop-engineering-927bd961/development"), directory, { recursive: true });
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(join(directory, ".github/graph-engineering"));
  await writeFile(join(directory, ".github/graph-engineering/thread-record.mjs"), "Consumer implementation\n");
  const before = await githubContents(directory);
  const migrated = cli(directory, "migrate", "--apply");
  assert.equal(migrated.status, 1);
  assert.match(migrated.stderr, /migration conflicts/);
  assert.deepEqual(await githubContents(directory), before);
});
