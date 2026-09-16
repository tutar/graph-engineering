import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const candidateReadme = read("../README.md");
const rootReadme = read("../../../../README.md");
const gate = read("../CANDIDATE-GATE.md");
const release = read("../../../../docs/releases/v0.2.4.md");

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
  for (const category of ["routing", "Goal Prompt", "mapping", "runner and authentication", "Action and CLI pin", "permissions", "validation", "SHA freshness", "idempotency", "fail-closed"]) {
    assert.match(gate, new RegExp(category, "i"), category);
  }
  assert.match(gate, /Gate Decision:\s*PASS/);
  assert.match(gate, /Candidate only/i);
  assert.match(gate, /no Stable Supported Profile/i);
  assert.match(gate, /Fake Action.*not.*real.*compatibility/is);
  assert.match(gate, /Agent final text.*not.*evidence/is);
});

test("v0.2.4 distinguishes repository and Definition versions without overstating evidence", () => {
  assert.match(release, /Repository Release:\s*`v0\.2\.4`/);
  assert.match(release, /Workflow Definition:\s*`github-pr-review\/v0\.1\.4`/);
  assert.match(release, /Candidate/);
  assert.match(release, /no Stable Supported Profile/i);
  assert.match(release, /static|automated contract/i);
  assert.match(release, /不证明.*Consumer Project.*兼容/s);
  assert.match(rootReadme, /github-pr-review.*v0\.1\.4.*Candidate/is);
  assert.match(rootReadme, /github-development-ticket.*Legacy Frozen/is);
});

test("the previous PR Review and all Development Ticket definitions remain side-by-side", () => {
  assert.match(read("../../v0.1.0/README.md"), /github-pr-review v0\.1\.0 Candidate/);
  assert.match(read("../../v0.1.1/README.md"), /github-pr-review v0\.1\.1 Candidate/);
  assert.match(read("../../v0.1.2/README.md"), /github-pr-review v0\.1\.2 Candidate/);
  for (const version of ["v0.1.0", "v0.1.1", "v0.1.2"]) {
    const legacyReadme = read(`../../../github-development-ticket/${version}/README.md`);
    assert.match(legacyReadme, /Legacy Frozen/);
  }
  assert.match(release, /并存/);
  assert.match(release, /不改写/);
});
