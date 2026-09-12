import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// This deliberately repeats the Workflow trigger as a fail-closed runtime check.
// The template contract test requires exact parity between both boundaries.
export const SUPPORTED_ACTIONS = new Set(["opened", "reopened", "synchronize", "ready_for_review"]);

export function routeReviewEvent({ eventName, event }) {
  if (eventName === "workflow_dispatch") {
    const pullRequestNumber = Number.parseInt(event.inputs?.pull_request_number, 10);
    if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) {
      return { shouldStart: false, pullRequestNumber: null, reason: "invalid-manual-input" };
    }
    return { shouldStart: true, pullRequestNumber, reason: "manual-dispatch" };
  }

  if (eventName !== "pull_request" || !SUPPORTED_ACTIONS.has(event.action)) {
    return { shouldStart: false, pullRequestNumber: null, reason: "unsupported-event" };
  }
  const pullRequestNumber = event.pull_request.number;
  if (event.pull_request.draft) {
    return { shouldStart: false, pullRequestNumber, reason: "draft-pull-request" };
  }
  return { shouldStart: true, pullRequestNumber, reason: "supported-pull-request-event" };
}

async function main() {
  const event = JSON.parse(await readFile(required("GITHUB_EVENT_PATH"), "utf8"));
  const route = routeReviewEvent({ eventName: required("GITHUB_EVENT_NAME"), event });
  if (process.env.GITHUB_OUTPUT) {
    await writeFile(process.env.GITHUB_OUTPUT, [
      `should_start=${route.shouldStart}`,
      `pull_request_number=${route.pullRequestNumber ?? ""}`,
      `reason=${route.reason}`,
      "",
    ].join("\n"), { flag: "a" });
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
