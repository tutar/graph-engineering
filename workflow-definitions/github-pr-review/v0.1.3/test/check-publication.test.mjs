import assert from "node:assert/strict";
import test from "node:test";

import { planCheckPublication } from "../files/.github/loop-engineering/check-publication.mjs";

const target = {
  repository: "acme/widgets",
  number: 42,
  baseSha: "base-123",
  headSha: "head-456",
};

test("the first review creates a Check with a stable target identity", () => {
  assert.deepEqual(planCheckPublication({ target, existingChecks: [] }), {
    method: "POST",
    path: "/repos/acme/widgets/check-runs",
    externalId: "github-pr-review/v0.1.3:acme/widgets:pull-request:42:head-456",
  });
});

test("a same-head rerun updates the matching logical Check", () => {
  assert.deepEqual(planCheckPublication({
    target,
    existingChecks: [{
      id: 7,
      name: "Loop Engineering / PR Review",
      head_sha: "head-456",
      external_id: "github-pr-review/v0.1.3:acme/widgets:pull-request:42:head-456",
    }],
  }), {
    method: "PATCH",
    path: "/repos/acme/widgets/check-runs/7",
    externalId: "github-pr-review/v0.1.3:acme/widgets:pull-request:42:head-456",
  });
});

test("a new head creates a distinct Check and never updates an old-head result", () => {
  assert.equal(planCheckPublication({
    target: { ...target, headSha: "head-789" },
    existingChecks: [{
      id: 7,
      name: "Loop Engineering / PR Review",
      head_sha: "head-456",
      external_id: "github-pr-review/v0.1.3:acme/widgets:pull-request:42:head-456",
    }],
  }).method, "POST");
});
