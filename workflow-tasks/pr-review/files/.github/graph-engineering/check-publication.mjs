export const CHECK_NAME = "Graph Engineering / PR Review";
export const DEFINITION_ID = "github-pr-review/current";

export function checkExternalId(target) {
  return `${DEFINITION_ID}:${target.repository}:pull-request:${target.number}:${target.headSha}`;
}

export function planCheckPublication({ target, existingChecks, checkName = CHECK_NAME }) {
  const externalId = checkExternalId(target);
  const matches = existingChecks.filter((check) => (
    check.name === checkName
    && check.head_sha === target.headSha
    && check.external_id === externalId
  ));
  if (matches.length > 1) {
    throw new Error(`duplicate-review-check: ${matches.length} Checks match ${externalId}`);
  }
  const existing = matches[0];

  return existing
    ? { method: "PATCH", path: `/repos/${target.repository}/check-runs/${existing.id}`, externalId }
    : { method: "POST", path: `/repos/${target.repository}/check-runs`, externalId };
}
