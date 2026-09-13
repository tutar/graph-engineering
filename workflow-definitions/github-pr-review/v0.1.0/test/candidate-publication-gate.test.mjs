import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const candidateReadme = read("../README.md");
const rootReadme = read("../../../../README.md");
const gate = read("../CANDIDATE-GATE.md");
const release = read("../../../../docs/releases/v0.2.0.md");

test("the Candidate is a complete project-owned copyable file set", () => {
  const controlFiles = readdirSync(new URL("../files/.github/loop-engineering/", import.meta.url)).sort();
  assert.deepEqual(controlFiles, [
    "capture-review.mjs",
    "check-publication.mjs",
    "codex-compatibility-profile.json",
    "codex-compatible-executor.mjs",
    "github-api.mjs",
    "pr-review-case.mjs",
    "pr-review-config.json",
    "pr-review-contract.mjs",
    "prepare-review.mjs",
    "publish-review.mjs",
    "review-result.schema.json",
    "route-review.mjs",
  ]);
  assert.deepEqual(readdirSync(new URL("../files/.github/workflows/", import.meta.url)), ["github-pr-review.yml"]);
  assert.match(candidateReadme, /copy|复制/i);
  assert.match(candidateReadme, /Consumer Project/);
  assert.match(candidateReadme, /自行拥有|项目拥有/);
});

test("the Candidate Publication Gate records every required contract category", () => {
  for (const category of ["routing", "Goal Prompt", "mapping", "permissions", "validation", "SHA freshness", "idempotency", "fail-closed"]) {
    assert.match(gate, new RegExp(category, "i"), category);
  }
  assert.match(gate, /Gate Decision:\s*PASS/);
  assert.match(gate, /Candidate only/i);
  assert.match(gate, /no Stable Supported Profile/i);
  assert.match(gate, /Fake Action.*not.*real.*compatibility/is);
  assert.match(gate, /Agent final text.*not.*evidence/is);
});

test("v0.2.0 distinguishes repository and Definition versions without overstating evidence", () => {
  assert.match(release, /Repository Release:\s*`v0\.2\.0`/);
  assert.match(release, /Workflow Definition:\s*`github-pr-review\/v0\.1\.0`/);
  assert.match(release, /Candidate/);
  assert.match(release, /no Stable Supported Profile/i);
  assert.match(release, /static|automated contract/i);
  assert.match(release, /not.*real Consumer/is);
  assert.match(rootReadme, /github-pr-review.*v0\.1\.0.*Candidate/is);
  assert.match(rootReadme, /github-development-ticket.*Legacy Frozen/is);
});

test("all published v0.1.x Development Ticket definitions remain side-by-side and Legacy Frozen", () => {
  for (const version of ["v0.1.0", "v0.1.1", "v0.1.2"]) {
    const legacyReadme = read(`../../../github-development-ticket/${version}/README.md`);
    assert.match(legacyReadme, /Legacy Frozen/);
  }
  assert.match(release, /side by side|并存/i);
  assert.match(release, /no automatic migration|不.*自动迁移/i);
  assert.match(release, /Thread.*label.*Controller/is);
});
