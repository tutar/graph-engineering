import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SUPPORTED_ACTIONS } from "../files/.github/loop-engineering/route-review.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const workflow = read("../files/.github/workflows/github-pr-review.yml");
const profile = JSON.parse(read("../files/.github/loop-engineering/codex-compatibility-profile.json"));
const schema = JSON.parse(read("../files/.github/loop-engineering/review-result.schema.json"));

test("the copyable template has a manual entry and separate review and publish jobs", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request_number:/);
  assert.match(workflow, /^  review:/m);
  assert.match(workflow, /^  publish:/m);
  assert.match(workflow, /needs: \[route, review\]/);
});

test("the Workflow routes the supported PR lifecycle into fresh serialized runs", () => {
  assert.match(workflow, /pull_request:\s+types: \[opened, reopened, synchronize, ready_for_review\]/);
  assert.match(workflow, /node \.github\/loop-engineering\/route-review\.mjs/);
  assert.match(workflow, /steps\.route\.outputs\.pull_request_number/);
  assert.match(workflow, /needs\.route\.outputs\.should_start == 'true'/);
  assert.match(workflow, /needs\.route\.result == 'success'/);
  assert.match(workflow, /group:.*github\.repository.*pull-request.*pull_request_number/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /session[-_]id|goal[-_]id|resume record|transcript/i);
  const configuredActions = workflow.match(/types: \[([^\]]+)\]/)[1].split(",").map((action) => action.trim());
  assert.deepEqual(configuredActions, [...SUPPORTED_ACTIONS]);
});

test("the review job is read-only and only the trusted publisher can write Checks", () => {
  const review = workflow.slice(workflow.indexOf("  review:"), workflow.indexOf("  publish:"));
  const publish = workflow.slice(workflow.indexOf("  publish:"));
  assert.match(review, /contents: read/);
  assert.match(review, /pull-requests: read/);
  assert.doesNotMatch(review, /checks: write/);
  assert.doesNotMatch(review, /issues: write|pull-requests: write|contents: write/);
  assert.match(review, /permission-profile: :read-only/);
  assert.match(review, /safety-strategy: read-only/);
  assert.match(review, /github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
  assert.match(publish, /checks: write/);
  assert.match(publish, /pull-requests: read/);
  assert.doesNotMatch(publish, /issues: write|pull-requests: write|contents: write/);
});

test("untrusted PR contents cannot replace control-plane scripts or retain Git credentials", () => {
  const review = workflow.slice(workflow.indexOf("  review:"), workflow.indexOf("  publish:"));
  const publish = workflow.slice(workflow.indexOf("  publish:"));
  assert.match(review, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}[\s\S]*path: \.loop-engineering-trusted/);
  assert.match(review, /ref: \$\{\{ steps\.target\.outputs\.head_sha \}\}[\s\S]*path: review-workspace/);
  assert.match(review, /working-directory: \$\{\{ github\.workspace \}\}\/review-workspace/);
  assert.match(review, /node \.loop-engineering-trusted\/\.github\/loop-engineering\/prepare-review\.mjs/);
  assert.match(review, /node \.loop-engineering-trusted\/\.github\/loop-engineering\/capture-review\.mjs/);
  assert.doesNotMatch(review, /run: node \.github\/loop-engineering\/(prepare|capture)-review\.mjs/);
  assert.match(publish, /node \.loop-engineering-publisher\/\.github\/loop-engineering\/publish-review\.mjs/);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 4);
});

test("the Executor pins the documented codex-action v1 commit and maps only real outputs", () => {
  assert.equal(profile.action.source, "openai/codex-action");
  assert.equal(profile.action.sourceTag, "v1");
  assert.equal(profile.action.commit, "86365089eb2b84e0a8fb0717b304f8bdcb13b20e");
  assert.match(workflow, /openai\/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e/);
  assert.match(workflow, /prompt-file:/);
  assert.match(workflow, /output-schema-file:/);
  assert.match(workflow, /steps\.codex\.outputs\.final-message/);
  assert.deepEqual(profile.outputs, ["final-message"]);
  assert.doesNotMatch(workflow, /session[-_]id|goal[-_]id|resume record/i);
});

test("the candidate output schema requires exact identity and both review axes", () => {
  assert.deepEqual(schema.required, ["repository", "pullRequestNumber", "baseSha", "headSha"]);
  assert.equal(schema.properties.standards.$ref, "#/$defs/axis");
  assert.equal(schema.properties.spec.$ref, "#/$defs/axis");
  assert.deepEqual(schema.$defs.axis.required, ["verdict", "findings"]);
  assert.equal(schema.oneOf.length, 2);
  assert.deepEqual(schema.properties.handoff.required, ["summary"]);
});
