import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { readBundledContracts, resolveCompatibleExecution } from "./codex-compatible-executor.mjs";
import { SUPPORTED_ACTIONS } from "./pr-review-contract.mjs";

export { SUPPORTED_ACTIONS } from "./pr-review-contract.mjs";

// This deliberately repeats the Workflow trigger as a fail-closed runtime check.
// The template contract test requires exact parity between both boundaries.
export function routeReviewEvent({
  eventName,
  event,
  eventConfiguration = { pullRequestActions: [...SUPPORTED_ACTIONS], manualDispatch: true, includeDrafts: false },
}) {
  if (eventName === "workflow_dispatch") {
    if (!eventConfiguration.manualDispatch) return { shouldStart: false, pullRequestNumber: null, reason: "manual-dispatch-disabled" };
    const pullRequestNumber = Number.parseInt(event.inputs?.pull_request_number, 10);
    if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) {
      return { shouldStart: false, pullRequestNumber: null, reason: "invalid-manual-input" };
    }
    return { shouldStart: true, pullRequestNumber, reason: "manual-dispatch" };
  }

  if (eventName !== "pull_request" || !SUPPORTED_ACTIONS.has(event.action) || !eventConfiguration.pullRequestActions.includes(event.action)) {
    return { shouldStart: false, pullRequestNumber: null, reason: "unsupported-event" };
  }
  const pullRequestNumber = event.pull_request.number;
  if (event.pull_request.draft && !eventConfiguration.includeDrafts) {
    return { shouldStart: false, pullRequestNumber, reason: "draft-pull-request" };
  }
  return { shouldStart: true, pullRequestNumber, reason: "supported-pull-request-event" };
}

export function planReviewRun({ eventName, event, config, profile }) {
  try {
    const compatible = resolveCompatibleExecution({ config, profile });
    return {
      configurationStatus: "compatible",
      ...routeReviewEvent({ eventName, event, eventConfiguration: compatible.events }),
      compatible,
    };
  } catch (error) {
    return {
      configurationStatus: "handoff",
      shouldStart: false,
      pullRequestNumber: null,
      reason: "configuration-handoff",
      diagnostic: error.message,
    };
  }
}

async function main() {
  const event = JSON.parse(await readFile(required("GITHUB_EVENT_PATH"), "utf8"));
  let contracts;
  try {
    contracts = await readBundledContracts();
  } catch (error) {
    const diagnostic = `configuration-handoff: ${error.message}`;
    await writeOutputs({ configurationStatus: "handoff", shouldStart: false, pullRequestNumber: null, reason: "configuration-handoff", diagnostic });
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `## PR Review handoff\n\n${diagnostic}\n`, { flag: "a" });
    return;
  }
  const eventName = required("GITHUB_EVENT_NAME");
  const planned = planReviewRun({ eventName, event, ...contracts });
  if (planned.configurationStatus === "handoff") {
    await writeOutputs(planned);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `## PR Review handoff\n\n${planned.diagnostic}\n`, { flag: "a" });
    return;
  }
  const manualPrompt = eventName === "workflow_dispatch" ? event.inputs?.event_prompt?.trim() : "";
  await writeOutputs({
    shouldStart: planned.shouldStart,
    pullRequestNumber: planned.pullRequestNumber,
    reason: planned.reason,
    runner: planned.compatible.runner,
    eventPrompt: manualPrompt || planned.compatible.eventPrompt,
    codexModel: planned.compatible.action.model,
    codexEffort: planned.compatible.action.effort,
    permissionProfile: planned.compatible.action.permissionProfile,
    safetyStrategy: planned.compatible.action.safetyStrategy,
  });
}

async function writeOutputs(values) {
  if (process.env.GITHUB_OUTPUT) {
    const lines = [];
    for (const [key, value] of Object.entries(values)) {
      const outputKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      const delimiter = `loop_${randomUUID()}`;
      lines.push(`${outputKey}<<${delimiter}`, String(value ?? ""), delimiter);
    }
    await writeFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, { flag: "a" });
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
