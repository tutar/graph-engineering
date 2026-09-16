import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SUPPORTED_ACTIONS } from "../files/.github/loop-engineering/route-review.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const workflow = read("../files/.github/workflows/github-pr-review.yml");
const profile = JSON.parse(read("../files/.github/loop-engineering/codex-compatibility-profile.json"));
const config = JSON.parse(read("../files/.github/loop-engineering/pr-review-config.json"));
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
  assert.doesNotMatch(review, /permission-profile:/);
  assert.match(review, /safety-strategy: \$\{\{ needs\.route\.outputs\.safety_strategy \}\}/);
  assert.match(review, /github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/);
  assert.match(publish, /checks: write/);
  assert.match(publish, /pull-requests: read/);
  assert.doesNotMatch(publish, /issues: write|pull-requests: write|contents: write/);
});

test("only the review job uses the frozen Runner-backed Codex Profile", () => {
  const route = workflow.slice(workflow.indexOf("  route:"), workflow.indexOf("  review:"));
  const review = workflow.slice(workflow.indexOf("  review:"), workflow.indexOf("  publish:"));
  const publish = workflow.slice(workflow.indexOf("  publish:"));
  assert.match(route, /runs-on: ubuntu-24\.04/);
  assert.match(review, /runs-on: \[self-hosted, Linux, X64, codex\]/);
  assert.match(publish, /runs-on: ubuntu-24\.04/);
  assert.deepEqual(profile.runner.labels, ["self-hosted", "Linux", "X64", "codex"]);
  assert.deepEqual(profile.authentication, {
    mode: "runner-backed-codex",
    credentialSource: "default-codex-home",
    repositorySecret: false,
  });
  assert.doesNotMatch(workflow, /openai-api-key|OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /allow-users|allow-bots|allow-bot-users/);
  assert.doesNotMatch(workflow, /^\s*run:\s*codex\b/m);
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

test("the Executor pins the documented Action and Codex CLI and maps only real outputs", () => {
  assert.equal(profile.action.source, "tutar/codex-action");
  assert.equal(profile.action.sourceRef, "fix/runner-login-no-proxy");
  assert.equal(profile.action.commit, "f33581290086e62dc34d420a7f1862477fc2b503");
  assert.deepEqual(profile.action.upstream, {
    source: "openai/codex-action",
    commit: "86365089eb2b84e0a8fb0717b304f8bdcb13b20e",
  });
  assert.equal(profile.action.patch, "read-proxy-server-info-only-with-openai-api-key");
  assert.match(workflow, /tutar\/codex-action@f33581290086e62dc34d420a7f1862477fc2b503/);
  assert.equal(profile.action.codexVersion, "0.153.4");
  assert.match(workflow, /codex-version: 0\.153\.4/);
  assert.match(workflow, /prompt-file:/);
  assert.match(workflow, /output-schema-file:/);
  assert.match(workflow, /steps\.codex\.outputs\.final-message/);
  assert.deepEqual(profile.outputs, ["final-message"]);
  assert.doesNotMatch(workflow, /session[-_]id|goal[-_]id|resume record/i);
});

test("Consumer configuration cannot select the runner, authentication, Action, mapping, Profile implementation, Provider, or capabilities", () => {
  assert.deepEqual(Object.keys(config).sort(), ["check", "codex", "definition", "eventPrompt", "events", "profile"].sort());
  assert.equal("runner" in config, false);
  assert.equal("authentication" in config, false);
  assert.equal("action" in config, false);
  assert.equal("provider" in config, false);
  assert.equal("capabilities" in config, false);
  assert.match(workflow, /model: \$\{\{ needs\.route\.outputs\.codex_model \}\}/);
  assert.match(workflow, /effort: \$\{\{ needs\.route\.outputs\.codex_effort \}\}/);
  assert.doesNotMatch(workflow, /permission-profile:/);
  assert.match(workflow, /safety-strategy: \$\{\{ needs\.route\.outputs\.safety_strategy \}\}/);
  assert.doesNotMatch(workflow, /vars\..*(ACTION|PROFILE|PROVIDER|CAPABIL)/i);
});

test("the Profile declares the immutable mapping and every validation boundary", () => {
  assert.equal(profile.definition, "github-pr-review/v0.1.3");
  assert.equal(profile.executor.id, "codex-compatible-executor");
  assert.equal(profile.executor.version, "v0.1.3");
  assert.deepEqual(profile.action.requiredInputs, ["prompt-file", "output-schema-file", "working-directory", "codex-version", "safety-strategy"]);
  assert.deepEqual(profile.action.acceptedInputs, ["prompt-file", "output-schema-file", "working-directory", "codex-version", "model", "effort", "permission-profile", "safety-strategy"]);
  assert.equal(profile.mapping.goalPrompt, "prompt-file");
  assert.equal(profile.mapping.reviewSchema, "output-schema-file");
  assert.equal(profile.mapping.codexVersion, "codex-version");
  assert.deepEqual(profile.permissions.publishJob, { contents: "read", "pull-requests": "read", checks: "write" });
  assert.equal(profile.validation.failClosed, true);
  assert.equal(profile.validation.resultSchema, "review-result.schema.json");
  assert.deepEqual(profile.consumerConfiguration.pullRequestActions, [...SUPPORTED_ACTIONS]);
  assert.equal("permissionProfiles" in profile.consumerConfiguration, false);
  assert.deepEqual(profile.consumerConfiguration.safetyStrategies, ["read-only"]);
  assert.equal(profile.consumerConfiguration.checkTextMaxLength, 100);
});

test("the candidate output schema requires exact identity and both review axes", () => {
  assert.deepEqual(schema.required, ["repository", "pullRequestNumber", "baseSha", "headSha"]);
  assert.equal(schema.properties.standards.$ref, "#/$defs/axis");
  assert.equal(schema.properties.spec.$ref, "#/$defs/axis");
  assert.deepEqual(schema.$defs.axis.required, ["verdict", "findings"]);
  assert.equal(schema.oneOf.length, 2);
  assert.deepEqual(schema.properties.handoff.required, ["summary"]);
});
