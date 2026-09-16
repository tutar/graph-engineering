import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const historicalManifest = readFileSync(new URL("../../../../docs/evidence/github-pr-review-v0.1.0-consumer-validation.md", import.meta.url), "utf8");
const failedRunnerLoginManifest = readFileSync(new URL("../../../../docs/evidence/github-pr-review-v0.1.1-consumer-validation.md", import.meta.url), "utf8");
const failedDraftProfileManifest = readFileSync(new URL("../../../../docs/evidence/github-pr-review-v0.1.2-consumer-validation.md", import.meta.url), "utf8");
const revisedManifest = new URL("../../../../docs/evidence/github-pr-review-v0.1.4-consumer-validation.md", import.meta.url);

test("the historical Consumer evidence manifest remains bound to the v0.1.0 combination", () => {
  for (const value of [
    "0c2e87a66e79e32213e2aa3d0207852340dbabe3",
    "github-pr-review/codex/v0.1.0",
    "86365089eb2b84e0a8fb0717b304f8bdcb13b20e",
    "ubuntu-24.04",
    "85258029f84ddfa6fab6142fd8ef9b0170abfcc275327ee7543760a4eb59059e",
  ]) assert.match(historicalManifest, new RegExp(value));
});

test("the revised Candidate does not splice or invent Consumer evidence", () => {
  assert.equal(existsSync(revisedManifest), false);
  assert.match(historicalManifest, /Draft PR routing[\s\S]*PASS/);
  assert.match(historicalManifest, /Ready review, new SHA, same-SHA rerun[\s\S]*NOT_RUN/);
  assert.match(historicalManifest, /without a Stable Supported Profile/);
  assert.match(historicalManifest, /Fake Action[\s\S]*not[\s\S]*compatibility evidence/i);
  assert.match(failedRunnerLoginManifest, /Gate Decision:\s*FAIL/);
  assert.match(failedRunnerLoginManifest, /35081359069/);
  assert.match(failedRunnerLoginManifest, /server info/i);
  assert.match(failedRunnerLoginManifest, /must not be spliced/i);
  assert.match(failedDraftProfileManifest, /Gate Decision:\s*FAIL/);
  assert.match(failedDraftProfileManifest, /35086208140/);
  assert.match(failedDraftProfileManifest, /must not be spliced/i);
});
