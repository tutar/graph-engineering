import { CHECK_NAME } from "./check-publication.mjs";

export function formGoalPrompt({ eventPrompt, pullRequest }) {
  return `${eventPrompt.trim()}

Use the Consumer Project's installed \`code-review\` Skill to review:
- repository: ${pullRequest.repository}
- PR #${pullRequest.number}
- base SHA: ${pullRequest.baseSha}
- head SHA: ${pullRequest.headSha}
- requested change: read \`pr-review-context.md\`

Report Standards and Spec as separate axes using the supplied candidate review output schema.

If the review cannot be completed from the available trusted facts, return the schema's handoff form with a concrete summary. Do not claim to publish, comment, label, push, or otherwise write to GitHub.

Completion Condition: finish only after both axes have a verdict and findings, and the result identifies the exact repository, PR, base SHA, and head SHA above.`;
}

export function mapActionExecution({ actionOutcome, finalMessage }, target) {
  if (actionOutcome === "cancelled") {
    return { terminal: "cancelled", diagnostic: "agent-action: execution was cancelled" };
  }
  if (actionOutcome !== "success") {
    return { terminal: "failed", diagnostic: `agent-action: execution ended with ${actionOutcome || "an unknown outcome"}` };
  }

  let candidate;
  try {
    if (!finalMessage?.trim()) throw new Error("empty final-message");
    candidate = JSON.parse(finalMessage);
  } catch (error) {
    return { terminal: "failed", diagnostic: `candidate-output: ${error.message}` };
  }

  try {
    if (candidate.handoff !== undefined) {
      assertExactKeys(candidate, ["repository", "pullRequestNumber", "baseSha", "headSha", "handoff"]);
      assertTrustedTarget(candidate, target);
      assertExactKeys(candidate.handoff, ["summary"]);
      if (typeof candidate.handoff.summary !== "string" || !candidate.handoff.summary.trim()) {
        throw new Error("handoff summary is missing");
      }
      return { terminal: "handoff", diagnostic: `goal-handoff: ${candidate.handoff.summary.trim()}` };
    }

    assertCandidateReview(candidate, target);
    return {
      terminal: "completed",
      review: {
        ...candidate,
        runtime: {
          terminal: "completed",
          summary: "openai/codex-action completed and returned a validated final-message.",
        },
      },
    };
  } catch (error) {
    return { terminal: "failed", diagnostic: `candidate-output: ${error.message}` };
  }
}

export function parseSuccessfulResult(execution, target) {
  const mapped = mapActionExecution({
    actionOutcome: execution.terminal === "completed" ? "success" : execution.terminal,
    finalMessage: execution.finalMessage,
  }, target);
  if (mapped.terminal !== "completed") throw new Error(mapped.diagnostic);
  if (execution.summary) mapped.review.runtime.summary = execution.summary;
  return mapped.review;
}

export function assertReviewResult(review, target) {
  assertExactKeys(review, ["repository", "pullRequestNumber", "baseSha", "headSha", "standards", "spec", "runtime"]);
  assertTrustedTarget(review, target);
  for (const axis of ["standards", "spec"]) {
    if (!review[axis] || typeof review[axis] !== "object") {
      throw new Error(`Candidate review output is missing the ${axis} axis`);
    }
    assertExactKeys(review[axis], ["verdict", "findings"]);
    if (!["pass", "fail"].includes(review[axis].verdict)
      || !Array.isArray(review[axis].findings)
      || !review[axis].findings.every((finding) => typeof finding === "string" && finding.trim())) {
      throw new Error(`Candidate review output is missing the ${axis} axis`);
    }
  }
  if (!review.runtime || review.runtime.terminal !== "completed" || !review.runtime.summary) {
    throw new Error("Candidate review output Runtime terminal is not completed");
  }
}

function assertCandidateReview(candidate, target) {
  assertExactKeys(candidate, ["repository", "pullRequestNumber", "baseSha", "headSha", "standards", "spec"]);
  assertReviewResult({
    ...candidate,
    runtime: { terminal: "completed", summary: "validated" },
  }, target);
}

function assertTrustedTarget(candidate, target) {
  if (
    candidate.repository !== target.repository
    || candidate.pullRequestNumber !== target.number
    || candidate.baseSha !== target.baseSha
    || candidate.headSha !== target.headSha
  ) throw new Error("target does not match trusted GitHub facts");
}

function assertExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected an object");
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`unexpected fields: expected ${wanted.join(", ")}`);
  }
}

export function buildCheck(review, target, settings = { name: CHECK_NAME, title: "PR Review" }) {
  assertReviewResult(review, target);
  return {
    name: settings.name,
    title: settings.title,
    repository: target.repository,
    pullRequestNumber: target.number,
    headSha: target.headSha,
    conclusion: review.standards.verdict === "pass" && review.spec.verdict === "pass" ? "success" : "failure",
    standards: review.standards,
    spec: review.spec,
    runtime: review.runtime,
  };
}
