export const RECORD_KIND = "graph-engineering:github-development-ticket:v0.3.0";
export const LEGACY_RECORD_KIND = "loop-engineering:github-development-ticket:v0.1.0";

export function formatThreadRecord({ repository, issueNumber, threadId }) {
  return [
    "Codex Goal Thread 已创建；相同 Ticket 的后续运行将恢复该 Thread。",
    "",
    `<!-- ${RECORD_KIND}`,
    `repository=${repository}`,
    `issue=${issueNumber}`,
    `thread=${threadId}`,
    "-->",
  ].join("\n");
}

export function parseThreadRecord(body) {
  if (typeof body !== "string") return null;
  for (const kind of [RECORD_KIND, LEGACY_RECORD_KIND]) {
    const pattern = new RegExp(
      `<!--\\s*${escapeRegExp(kind)}\\s+repository=([^\\s]+)\\s+issue=(\\d+)\\s+thread=([^\\s]+)\\s*-->`,
    );
    const match = body.match(pattern);
    if (match) return { repository: match[1], issueNumber: Number(match[2]), threadId: match[3] };
  }
  return null;
}

export function findThreadRecord(comments, { repository, issueNumber }) {
  for (const comment of [...comments].reverse()) {
    if (comment?.user?.login !== "github-actions[bot]") continue;
    const record = parseThreadRecord(comment.body);
    if (record?.repository === repository && record.issueNumber === Number(issueNumber)) return record;
  }
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
