export const CHECK_NAME = "Loop Engineering / PR Review";
export const DEFINITION_VERSION = "github-pr-review/v0.1.0";

export function checkExternalId(target) {
  return `${DEFINITION_VERSION}:${target.repository}:pull-request:${target.number}:${target.headSha}`;
}

export function planCheckPublication({ target, existingChecks }) {
  const externalId = checkExternalId(target);
  const existing = existingChecks.find((check) => (
    check.name === CHECK_NAME
    && check.head_sha === target.headSha
    && check.external_id === externalId
  ));

  return existing
    ? { method: "PATCH", path: `/repos/${target.repository}/check-runs/${existing.id}`, externalId }
    : { method: "POST", path: `/repos/${target.repository}/check-runs`, externalId };
}
