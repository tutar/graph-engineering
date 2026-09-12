import { readFile } from "node:fs/promises";

import { SUPPORTED_ACTION_NAMES } from "./pr-review-contract.mjs";

const DEFINITION = "github-pr-review/v0.1.0";
const PROFILE = "github-pr-review/codex/v0.1.0";
const ACTION_SOURCE = "openai/codex-action";
const ACTION_COMMIT = "86365089eb2b84e0a8fb0717b304f8bdcb13b20e";
const ACTION_USES = `${ACTION_SOURCE}@${ACTION_COMMIT}`;

export function resolveCompatibleExecution({ config, profile }) {
  try {
    validateProfile(profile);
    validateConfiguration(config, profile);
    return {
      definition: config.definition,
      profile: config.profile,
      runner: config.runner,
      events: structuredClone(config.events),
      eventPrompt: config.eventPrompt.trim(),
      action: {
        uses: ACTION_USES,
        model: config.codex.model.trim(),
        effort: config.codex.effort,
        permissionProfile: config.codex.permissionProfile,
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
  assertExactKeys(profile, ["definition", "profile", "executor", "action", "mapping", "outputs", "permissions", "consumerConfiguration", "validation"], "Profile");
  if (profile.definition !== DEFINITION) throw new Error("Profile definition does not match the Executor version");
  if (profile.profile !== PROFILE) throw new Error("Profile identity does not match the Executor version");
  assertExactKeys(profile.executor, ["id", "version"], "Profile executor");
  if (profile.executor?.id !== "codex-compatible-executor" || profile.executor?.version !== "v0.1.0") throw new Error("Profile executor does not match the bundled Executor");
  if (profile.action?.source !== ACTION_SOURCE || profile.action?.sourceTag !== "v1") throw new Error("Profile Action source or source tag does not match the bundled Executor");
  assertExactKeys(profile.action, ["source", "sourceTag", "commit", "requiredInputs", "acceptedInputs"], "Profile Action");
  if (profile.action.commit !== ACTION_COMMIT) throw new Error("Profile Action commit does not match the bundled Executor");
  assertJsonEqual(profile.action.requiredInputs, ["openai-api-key", "prompt-file", "output-schema-file", "working-directory", "permission-profile", "safety-strategy"], "required inputs");
  assertJsonEqual(profile.action.acceptedInputs, ["openai-api-key", "prompt-file", "output-schema-file", "working-directory", "model", "effort", "permission-profile", "safety-strategy"], "accepted inputs");
  assertJsonEqual(profile.mapping, {
    goalPrompt: "prompt-file",
    reviewSchema: "output-schema-file",
    credential: "openai-api-key",
    workingDirectory: "working-directory",
    model: "model",
    reasoningEffort: "effort",
    permissionProfile: "permission-profile",
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
    runners: ["ubuntu-24.04", "ubuntu-22.04"],
    modelPattern: "^[A-Za-z0-9._-]*$",
    reasoningEfforts: ["", "low", "medium", "high", "xhigh"],
    permissionProfiles: [":read-only"],
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
  assertExactKeys(config, ["definition", "profile", "events", "eventPrompt", "runner", "codex", "check"], "configuration");
  if (config.definition !== DEFINITION) throw new Error("configuration definition does not match this Candidate");
  if (config.profile !== profile.profile) throw new Error("configuration profile does not match the bundled Profile");
  assertExactKeys(config.events, ["pullRequestActions", "manualDispatch", "includeDrafts"], "events");
  if (!Array.isArray(config.events.pullRequestActions) || !config.events.pullRequestActions.every((action) => profile.consumerConfiguration.pullRequestActions.includes(action)) || new Set(config.events.pullRequestActions).size !== config.events.pullRequestActions.length) throw new Error("events.pullRequestActions contains an unsupported or duplicate event");
  if (typeof config.events.manualDispatch !== "boolean") throw new Error("events.manualDispatch must be boolean");
  if (!profile.consumerConfiguration.includeDrafts.includes(config.events.includeDrafts)) throw new Error("events.includeDrafts must remain false for this Candidate");
  if (typeof config.eventPrompt !== "string" || !config.eventPrompt.trim()) throw new Error("eventPrompt is required");
  if (!profile.consumerConfiguration.runners.includes(config.runner)) throw new Error("runner is not allowed by the Profile");
  assertExactKeys(config.codex, ["model", "effort", "permissionProfile", "safetyStrategy"], "codex");
  if (typeof config.codex.model !== "string" || !new RegExp(profile.consumerConfiguration.modelPattern).test(config.codex.model)) throw new Error("codex.model contains unsupported characters");
  if (!profile.consumerConfiguration.reasoningEfforts.includes(config.codex.effort)) throw new Error("codex.effort is not allowed");
  if (!profile.consumerConfiguration.permissionProfiles.includes(config.codex.permissionProfile)) throw new Error("codex.permissionProfile must remain :read-only");
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
