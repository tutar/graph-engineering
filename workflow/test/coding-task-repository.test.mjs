import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("../.github/graph-engineering/coding-task-repository.sh", import.meta.url).pathname;

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("branch preparation creates a new independent branch and resumes an existing remote branch", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "coding-task-repository-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, "remote.git");
  const first = join(root, "first");
  const resumed = join(root, "resumed");
  git(root, "init", "--bare", "-q", remote);
  git(root, "clone", "-q", remote, first);
  git(first, "config", "user.email", "fixture@example.com");
  git(first, "config", "user.name", "Fixture");
  await writeFile(join(first, "tracked.txt"), "fixture\n");
  git(first, "add", "tracked.txt");
  git(first, "commit", "-qm", "base");
  git(first, "branch", "-M", "main");
  git(first, "push", "-qu", "origin", "main");

  const env = { ...process.env, TARGET_BRANCH: "agent/issue-70" };
  let prepared = spawnSync("bash", [script, "prepare"], { cwd: first, env, encoding: "utf8" });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(git(first, "branch", "--show-current"), "agent/issue-70");
  await appendFile(join(first, "tracked.txt"), "change\n");
  git(first, "add", "tracked.txt");
  git(first, "commit", "-qm", "change");
  git(first, "push", "-qu", "origin", "agent/issue-70");

  git(root, "clone", "-q", "--branch", "main", remote, resumed);
  prepared = spawnSync("bash", [script, "prepare"], { cwd: resumed, env, encoding: "utf8" });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(git(resumed, "branch", "--show-current"), "agent/issue-70");
  assert.equal(git(resumed, "rev-parse", "HEAD"), git(first, "rev-parse", "HEAD"));
});

test("branch preparation fails closed without an explicit target branch", () => {
  const result = spawnSync("bash", [script, "prepare"], {
    env: { ...process.env, TARGET_BRANCH: "" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
});
