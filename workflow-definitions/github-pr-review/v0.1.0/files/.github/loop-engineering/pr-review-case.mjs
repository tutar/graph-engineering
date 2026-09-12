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

Completion Condition: finish only after both axes have a verdict and findings, and the result identifies the exact repository, PR, base SHA, and head SHA above.`;
}

export function parseSuccessfulResult(execution, target) {
  if (execution.terminal !== "completed") {
    throw new Error(`Agent Runtime did not complete: ${execution.terminal}`);
  }

  const review = {
    ...JSON.parse(execution.finalMessage),
    runtime: {
      terminal: execution.terminal,
      summary: execution.summary ?? "Agent Action completed.",
    },
  };
  assertReviewResult(review, target);
  return review;
}

export function assertReviewResult(review, target) {
  if (
    review.repository !== target.repository
    || review.pullRequestNumber !== target.number
    || review.baseSha !== target.baseSha
    || review.headSha !== target.headSha
  ) {
    throw new Error("Candidate review output target does not match trusted GitHub facts");
  }
  for (const axis of ["standards", "spec"]) {
    if (!review[axis] || !["pass", "fail"].includes(review[axis].verdict) || !Array.isArray(review[axis].findings)) {
      throw new Error(`Candidate review output is missing the ${axis} axis`);
    }
  }
  if (!review.runtime || review.runtime.terminal !== "completed" || !review.runtime.summary) {
    throw new Error("Candidate review output Runtime terminal is not completed");
  }
}

export function buildCheck(review, target) {
  assertReviewResult(review, target);
  return {
    name: CHECK_NAME,
    repository: target.repository,
    pullRequestNumber: target.number,
    headSha: target.headSha,
    conclusion: review.standards.verdict === "pass" && review.spec.verdict === "pass" ? "success" : "failure",
    standards: review.standards,
    spec: review.spec,
    runtime: review.runtime,
  };
}
