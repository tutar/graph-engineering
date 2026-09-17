import { readFile } from "node:fs/promises";

import { SUPPORTED_ACTION_NAMES } from "./pr-review-contract.mjs";

const DEFINITION = "github-pr-review/current";
const PROFILE = "github-pr-review/codex/current";
const ACTION_SOURCE = "tutar/codex-action";
const ACTION_COMMIT = "f33581290086e62dc34d420a7f1862477fc2b503";
const ACTION_SOURCE_REF = "fix/runner-login-no-proxy";
const ACTION_UPSTREAM = {
  source: "openai/codex-action",
  commit: "86365089eb2b84e0a8fb0717b304f8bdcb13b20e",
};
const ACTION_PATCH = "read-proxy-server-info-only-with-openai-api-key";
const CODEX_VERSION = "0.153.4";
const RUNNER_LABELS = ["self-hosted", "Linux", "X64", "codex"];
const ACTION_USES = `${ACTION_SOURCE}@${ACTION_COMMIT}`;

export function resolveCompatibleExecution({ config, profile }) {
  try {
    validateProfile(profile);
    validateConfiguration(config, profile);
    return {
      definition: config.definition,
      profile: config.profile,
      runnerLabels: [...RUNNER_LABELS],
      events: structuredClone(config.events),
      eventPrompt: config.eventPrompt.trim(),
      action: {
        uses: ACTION_USES,
        codexVersion: CODEX_VERSION,
        model: config.codex.model.trim(),
        effort: config.codex.effort,
        safetyStrategy: config.codex.safetyStrategy,
      },
      check: structuredClone(config.check),
    };
  } catch (error) {
    throw new Error(`configuration-handoff: ${error.message}`);
  }
}

export async function loadBundledCompatibility() {
  const contracts = await readBundledContracts();
  return resolveCompatibleExecution(contracts);
}

export async function readBundledContracts() {
  const [config, profile] = await Promise.all([
    readFile(new URL("./pr-review-config.json", import.meta.url), "utf8"),
    readFile(new URL("./codex-compatibility-profile.json", import.meta.url), "utf8"),
  ]);
  return { config: JSON.parse(config), profile: JSON.parse(profile) };
}

function validateProfile(profile) {
  assertExactKeys(profile, ["definition", "profile", "executor", "runner", "authentication", "action", "mapping", "outputs", "permissions", "consumerConfiguration", "validation"], "Profile");
  if (profile.definition !== DEFINITION) throw new Error("Profile definition does not match the Executor version");
  if (profile.profile !== PROFILE) throw new Error("Profile identity does not match the Executor version");
  assertExactKeys(profile.executor, ["id", "version"], "Profile executor");
  if (profile.executor?.id !== "codex-compatible-executor" || profile.executor?.version !== "current") throw new Error("Profile executor does not match the bundled Executor");
  assertJsonEqual(profile.runner, { labels: RUNNER_LABELS }, "runner");
  assertJsonEqual(profile.authentication, { mode: "runner-backed-codex", credentialSource: "default-codex-home", repositorySecret: false }, "authentication");
  if (profile.action?.source !== ACTION_SOURCE || profile.action?.sourceRef !== ACTION_SOURCE_REF) throw new Error("Profile Action source or source ref does not match the bundled Executor");
  assertExactKeys(profile.action, ["source", "sourceRef", "commit", "upstream", "patch", "codexVersion", "requiredInputs", "acceptedInputs"], "Profile Action");
  if (profile.action.commit !== ACTION_COMMIT) throw new Error("Profile Action commit does not match the bundled Executor");
  assertJsonEqual(profile.action.upstream, ACTION_UPSTREAM, "Action upstream base");
  if (profile.action.patch !== ACTION_PATCH) throw new Error("Profile Action patch does not match the bundled Executor");
  if (profile.action.codexVersion !== CODEX_VERSION) throw new Error("Profile Codex version does not match the bundled Executor");
  assertJsonEqual(profile.action.requiredInputs, ["prompt-file", "output-schema-file", "working-directory", "codex-version", "safety-strategy"], "required inputs");
  assertJsonEqual(profile.action.acceptedInputs, ["prompt-file", "output-schema-file", "working-directory", "codex-version", "model", "effort", "permission-profile", "safety-strategy"], "accepted inputs");
  assertJsonEqual(profile.mapping, {
    goalPrompt: "prompt-file",
    reviewSchema: "output-schema-file",
    codexVersion: "codex-version",
    workingDirectory: "working-directory",
    model: "model",
    reasoningEffort: "effort",
    safetyStrategy: "safety-strategy",
    terminal: "step-outcome",
    finalMessage: "final-message",
  }, "mapping");
  assertJsonEqual(profile.outputs, ["final-message"], "outputs");
  assertJsonEqual(profile.permissions.reviewJob, { contents: "read", "pull-requests": "read", checks: "read" }, "review permissions");
  assertJsonEqual(profile.permissions.publishJob, { contents: "read", "pull-requests": "read", checks: "write" }, "publish permissions");
  assertJsonEqual(profile.consumerConfiguration, {
    pullRequestActions: SUPPORTED_ACTION_NAMES,
    manualDispatch: "boolean",
    includeDrafts: [false],
    modelPattern: "^[A-Za-z0-9._-]*$",
    reasoningEfforts: ["", "low", "medium", "high", "xhigh"],
    safetyStrategies: ["read-only"],
    checkTextMaxLength: 100,
  }, "consumer configuration");
  assertJsonEqual(profile.validation, {
    failClosed: true,
    resultSchema: "review-result.schema.json",
    terminals: ["completed", "handoff", "failed", "cancelled"],
  }, "validation rules");
}

function validateConfiguration(config, profile) {
  assertExactKeys(config, ["definition", "profile", "events", "eventPrompt", "codex", "check"], "configuration");
  if (config.definition !== DEFINITION) throw new Error("configuration definition does not match this current task");
  if (config.profile !== profile.profile) throw new Error("configuration profile does not match the bundled Profile");
  assertExactKeys(config.events, ["pullRequestActions", "manualDispatch", "includeDrafts"], "events");
  if (!Array.isArray(config.events.pullRequestActions) || !config.events.pullRequestActions.every((action) => profile.consumerConfiguration.pullRequestActions.includes(action)) || new Set(config.events.pullRequestActions).size !== config.events.pullRequestActions.length) throw new Error("events.pullRequestActions contains an unsupported or duplicate event");
  if (typeof config.events.manualDispatch !== "boolean") throw new Error("events.manualDispatch must be boolean");
  if (!profile.consumerConfiguration.includeDrafts.includes(config.events.includeDrafts)) throw new Error("events.includeDrafts must remain false for this current task");
  if (typeof config.eventPrompt !== "string" || !config.eventPrompt.trim()) throw new Error("eventPrompt is required");
  assertExactKeys(config.codex, ["model", "effort", "safetyStrategy"], "codex");
  if (typeof config.codex.model !== "string" || !new RegExp(profile.consumerConfiguration.modelPattern).test(config.codex.model)) throw new Error("codex.model contains unsupported characters");
  if (!profile.consumerConfiguration.reasoningEfforts.includes(config.codex.effort)) throw new Error("codex.effort is not allowed");
  if (!profile.consumerConfiguration.safetyStrategies.includes(config.codex.safetyStrategy)) throw new Error("codex.safetyStrategy must remain read-only");
  assertExactKeys(config.check, ["name", "title"], "check");
  for (const key of ["name", "title"]) {
    if (typeof config.check[key] !== "string" || !config.check[key].trim() || config.check[key].length > profile.consumerConfiguration.checkTextMaxLength) throw new Error(`check.${key} must be a non-empty string of at most ${profile.consumerConfiguration.checkTextMaxLength} characters`);
  }
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} contains missing or forbidden fields`);
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Profile ${label} does not match the bundled Executor`);
}
