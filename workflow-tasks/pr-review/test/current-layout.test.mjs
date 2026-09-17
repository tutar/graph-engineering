import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const task = resolve(import.meta.dirname, "..");

test("the current PR Review Task is a complete Consumer-owned file set", async (t) => {
  const consumer = await mkdtemp(join(tmpdir(), "pr-review-consumer-"));
  t.after(() => rm(consumer, { recursive: true, force: true }));

  await cp(join(task, "files", ".github"), join(consumer, ".github"), { recursive: true });
  await access(join(consumer, ".github", "workflows", "github-pr-review.yml"));
  await access(join(consumer, ".github", "loop-engineering", "publish-review.mjs"));

  const workflow = await readFile(join(consumer, ".github", "workflows", "github-pr-review.yml"), "utf8");
  assert.doesNotMatch(workflow, /uses:\s+[^\n]*\.github\/workflows\//);
  assert.doesNotMatch(workflow, /tutar\/loop-engineering/);
});

test("the current task uses an unversioned source identity", async () => {
  const publication = await import("../files/.github/loop-engineering/check-publication.mjs");
  assert.equal(publication.DEFINITION_ID, "github-pr-review/current");
  assert.doesNotMatch(publication.checkExternalId({
    repository: "acme/widgets",
    number: 42,
    headSha: "head-456",
  }), /\/v\d/);
});
