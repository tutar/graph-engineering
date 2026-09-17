import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { checkTask } from "../lib/check.mjs";
import { exists, listFiles, packageRoot } from "../lib/files.mjs";
import { initTask } from "../lib/init.mjs";
import { migrate } from "../lib/migrate.mjs";

async function project(t) {
  const directory = await mkdtemp(join(tmpdir(), "graph-engineering-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: directory });
  return directory;
}

test("init dry-run plans every task file without writing", async (t) => {
  const directory = await project(t);
  const plan = await initTask("pr-review", { projectRoot: directory, dryRun: true });
  assert.ok(plan.files.length > 5);
  assert.equal(await exists(join(directory, ".github")), false);
});

test("init installs an independently owned task and records its source", async (t) => {
  const directory = await project(t);
  const installed = await initTask("pr-review", { projectRoot: directory });
  assert.equal(await exists(join(directory, ".github", "graph-engineering", "pr-review-config.json")), true);
  const manifest = JSON.parse(await readFile(join(directory, ".github", "graph-engineering", "installation.json"), "utf8"));
  assert.equal(manifest.productVersion, "0.3.0");
  assert.equal(manifest.installations["pr-review"].task, "pr-review");
  assert.equal(installed.files.length, (await listFiles(join(packageRoot, "templates", "pr-review"))).length);
  const report = await checkTask("pr-review", { projectRoot: directory });
  assert.equal(report.results.find(({ check }) => check === "workflow-files").status, "PASS");
  assert.equal(report.results.find(({ check }) => check === "github-repository").status, "UNVERIFIED");
});

test("init fails before writing when any target file conflicts", async (t) => {
  const directory = await project(t);
  await initTask("development", { projectRoot: directory });
  await assert.rejects(initTask("development", { projectRoot: directory }), /installation conflicts/);
  const manifest = JSON.parse(await readFile(join(directory, ".github", "graph-engineering", "installation.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.installations), ["development"]);
});

test("migrate recognizes the frozen pre-v0.3 layout and replaces its namespace", async (t) => {
  const directory = await project(t);
  const legacy = join(packageRoot, "migrations", "loop-engineering-927bd961", "pr-review");
  await cp(legacy, directory, { recursive: true });
  const plan = await migrate({ projectRoot: directory, interactive: false });
  assert.equal(plan.requiresApply, true);
  assert.equal(await exists(join(directory, ".github", "loop-engineering")), true);
  const applied = await migrate({ projectRoot: directory, apply: true, interactive: false });
  assert.equal(applied.applied, true);
  assert.equal(await exists(join(directory, ".github", "loop-engineering")), false);
  assert.equal(await exists(join(directory, ".github", "graph-engineering", "publish-review.mjs")), true);
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
