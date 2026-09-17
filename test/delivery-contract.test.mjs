import assert from "node:assert/strict";
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { verifyDelivery } from "../scripts/verify-definition-delivery.mjs";

const repository = resolve(import.meta.dirname, "..");

function run(command, args, cwd) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const executable = command === process.execPath ? "/usr/bin/env" : command;
  const executableArgs = command === process.execPath
    ? ["-u", "NODE_TEST_CONTEXT", command, ...args]
    : args;
  return spawnSync(executable, executableArgs, { cwd, encoding: "utf8", env });
}

test("the delivery manifest keeps one unversioned current implementation per Workflow Task", async () => {
  const output = await verifyDelivery({ repository });
  assert.deepEqual(
    output.currentTasks.map(({ name, path, workflow }) => ({ name, path, workflow })),
    [
      {
        name: "development",
        path: "workflow-tasks/development",
        workflow: "github-development-ticket.yml",
      },
      {
        name: "pr-review",
        path: "workflow-tasks/pr-review",
        workflow: "github-pr-review.yml",
      },
    ],
  );
  assert.equal(output.publishedDefinitions, 9);
  assert.equal(output.evidenceBindings, 5);
  await assert.rejects(access(resolve(repository, "workflow-definitions")));
});

test("current Workflow Tasks remain independently copyable", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "current-tasks-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = await verifyDelivery({ repository });

  for (const task of output.currentTasks) {
    const consumer = join(directory, task.name);
    await cp(join(repository, task.path, task.installRoot), consumer, { recursive: true });
    const workflow = join(consumer, "workflows", task.workflow);
    assert.match(await readFile(workflow, "utf8"), /^name:/m);
  }
});

test("a current-layout release binds delivery version independently from source identity", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "current-release-identity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(join(repository, "delivery/definitions.json"), "utf8"));
  const definition = manifest.publishedDefinitions.find(({ definitionVersion }) => definitionVersion === "v0.1.5");
  assert.equal(definition.path, "workflow-tasks/pr-review");
  assert.equal(definition.repositoryRelease.version, "v0.2.5");
  assert.deepEqual(definition.sourceIdentity, {
    definition: "github-pr-review/current",
    profile: "github-pr-review/codex/current",
  });
  definition.sourceIdentity.profile = "github-pr-review/codex/not-the-frozen-profile";
  const manifestPath = join(directory, "delivery.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyDelivery({ repository, manifest: manifestPath }), /source profile does not match/);
  for (const invalid of [null, [], { definition: "github-pr-review/current", profile: "" }]) {
    definition.sourceIdentity = invalid;
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(verifyDelivery({ repository, manifest: manifestPath }), /sourceIdentity/);
  }
});

test("PASS evidence metadata still enforces its frozen release boundary", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "pass-evidence-boundary-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(join(repository, "delivery/definitions.json"), "utf8"));
  const binding = {
    manifest: join(directory, "shape-fixture.md"),
    definition: "github-pr-review/v0.1.5",
    repositoryRelease: "v0.2.5",
    profile: "github-pr-review/codex/current",
    actionRevision: "f33581290086e62dc34d420a7f1862477fc2b503",
    status: "PASS",
    decisionMarker: "Gate Decision: PASS",
    frozenInputs: { candidateCommit: "927bd96156f750546019581b653b7601db9c71c8" },
  };
  // Shape fixture only: these tests do not constitute real Consumer evidence.
  await writeFile(binding.manifest, [binding.definition, "v0.2.5", "v0.2.4",
    binding.profile, binding.actionRevision, binding.decisionMarker,
    binding.frozenInputs.candidateCommit].join("\n"));
  manifest.evidenceBindings = [binding];
  const manifestPath = join(directory, "delivery.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.equal((await verifyDelivery({ repository, manifest: manifestPath })).evidenceBindings, 1);
  binding.repositoryRelease = "v0.2.4";
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyDelivery({ repository, manifest: manifestPath }), /crosses.*release boundary/);
});

test("mapped historical releases remain obtainable after their source copies leave HEAD", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "historical-definitions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = await verifyDelivery({ repository });

  for (const definition of output.latestPublishedDefinitions) {
    const archive = join(directory, `${definition.name}.tar`);
    const archived = run(
      "git",
      ["archive", `--output=${archive}`, definition.gitRef, `${definition.path}/${definition.installRoot}`],
      repository,
    );
    assert.equal(archived.status, 0, archived.stderr);
    await access(archive);
  }
});

test("published content remains verifiable after its source copy leaves HEAD", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "definition-delivery-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));

  assert.equal(run("git", ["init", "-q"], fixture).status, 0);
  assert.equal(run("git", ["config", "user.email", "fixture@example.com"], fixture).status, 0);
  assert.equal(run("git", ["config", "user.name", "Fixture"], fixture).status, 0);
  await mkdir(join(fixture, "published", "files"), { recursive: true });
  await writeFile(join(fixture, "published", "files", "workflow.yml"), "name: fixture\n");
  assert.equal(run("git", ["add", "."], fixture).status, 0);
  assert.equal(run("git", ["commit", "-qm", "publish fixture"], fixture).status, 0);
  const sourceCommit = run("git", ["rev-parse", "HEAD"], fixture).stdout.trim();
  assert.equal(run("git", ["tag", "v9.0.0"], fixture).status, 0);
  assert.equal(run("git", ["rm", "-qr", "published"], fixture).status, 0);
  assert.equal(run("git", ["commit", "-qm", "remove source copy"], fixture).status, 0);

  const manifestPath = join(fixture, "delivery.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      schemaVersion: 2,
      currentTasks: [],
      retiredSourceRoots: ["published"],
      latestPublishedDefinitions: ["fixture/v1.0.0"],
      publishedDefinitions: [
        {
          name: "fixture",
          definitionVersion: "v1.0.0",
          sourceCommit,
          repositoryRelease: { version: "v9.0.0", gitRef: "v9.0.0", kind: "github-release" },
          path: "published",
          installRoot: "files",
        },
      ],
      evidenceBindings: [],
      auditSources: [],
    }, null, 2)}\n`,
  );

  const result = await verifyDelivery({ repository: fixture, manifest: manifestPath });
  assert.equal(result.publishedDefinitions, 1);
  await assert.rejects(readFile(join(fixture, "published", "files", "workflow.yml")));
});
