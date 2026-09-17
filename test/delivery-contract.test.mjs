import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

test("the delivery manifest resolves each current Definition to one immutable release", async () => {
  const output = await verifyDelivery({ repository });
  assert.deepEqual(
    output.currentDefinitions.map(({ name, definitionVersion, repositoryRelease }) => ({
      name,
      definitionVersion,
      repositoryRelease,
    })),
    [
      {
        name: "github-development-ticket",
        definitionVersion: "v0.1.2",
        repositoryRelease: "0.1.2",
      },
      {
        name: "github-pr-review",
        definitionVersion: "v0.1.4",
        repositoryRelease: "v0.2.4",
      },
    ],
  );
  assert.equal(output.evidenceBindings, 4);
});

test("mapped historical releases remain runnable after current sources move", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "current-definitions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = await verifyDelivery({ repository });
  const expectedWorkflows = new Map([
    ["github-development-ticket", "github-development-ticket.yml"],
    ["github-pr-review", "github-pr-review.yml"],
  ]);

  for (const definition of output.currentDefinitions) {
    const archive = join(directory, `${definition.name}.tar`);
    const snapshot = join(directory, definition.name);
    await mkdir(snapshot);
    const archived = run(
      "git",
      ["archive", `--output=${archive}`, definition.gitRef],
      repository,
    );
    assert.equal(archived.status, 0, archived.stderr);
    const extracted = run("tar", ["-xf", archive, "-C", snapshot], repository);
    assert.equal(extracted.status, 0, extracted.stderr);
    const workflow = join(snapshot, definition.path, definition.installRoot, "workflows", expectedWorkflows.get(definition.name));
    assert.match(await readFile(workflow, "utf8"), /^name:/m);

    const testRoot = join(snapshot, definition.path, definition.testRoot);
    const testFiles = (await readdir(testRoot, { recursive: true }))
      .filter((path) => path.endsWith(".test.mjs"))
      .map((path) => join(testRoot, path));
    assert.notEqual(testFiles.length, 0);
    const tests = run(
      process.execPath,
      ["--test", "--test-concurrency=1", ...testFiles],
      snapshot,
    );
    assert.equal(tests.status, 0, tests.stderr || tests.stdout);
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
      schemaVersion: 1,
      currentDefinitions: [],
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
