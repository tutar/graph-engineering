import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = readFileSync(new URL("../../../../docs/evidence/github-pr-review-v0.1.0-consumer-validation.md", import.meta.url), "utf8");

test("the Consumer evidence manifest freezes a single Candidate combination", () => {
  for (const value of [
    "0c2e87a66e79e32213e2aa3d0207852340dbabe3",
    "github-pr-review/codex/v0.1.0",
    "86365089eb2b84e0a8fb0717b304f8bdcb13b20e",
    "ubuntu-24.04",
    "85258029f84ddfa6fab6142fd8ef9b0170abfcc275327ee7543760a4eb59059e",
  ]) assert.match(manifest, new RegExp(value));
});

test("the manifest records real evidence boundaries without claiming Stable promotion", () => {
  assert.match(manifest, /Draft PR routing[\s\S]*PASS/);
  assert.match(manifest, /Ready review, new SHA, same-SHA rerun[\s\S]*NOT_RUN/);
  assert.match(manifest, /without a Stable Supported Profile/);
  assert.match(manifest, /Fake Action[\s\S]*not[\s\S]*compatibility evidence/i);
});
