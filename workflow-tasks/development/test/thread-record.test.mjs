import assert from "node:assert/strict";
import test from "node:test";
import {
  findThreadRecord,
  formatThreadRecord,
  parseThreadRecord,
} from "../files/.github/loop-engineering/thread-record.mjs";

function botComment(body) {
  return { body, user: { login: "github-actions[bot]" } };
}

test("round-trips a Thread Record", () => {
  const record = { repository: "owner/project", issueNumber: 1, threadId: "thread-one" };
  assert.deepEqual(parseThreadRecord(formatThreadRecord(record)), record);
});

test("an existing Issue 1 record does not resume for Issue 2", () => {
  const comments = [
    botComment(formatThreadRecord({ repository: "owner/project", issueNumber: 1, threadId: "thread-one" })),
  ];
  assert.equal(findThreadRecord(comments, { repository: "owner/project", issueNumber: 2 }), null);
});

test("selects only the matching repository and Issue", () => {
  const comments = [
    botComment(formatThreadRecord({ repository: "owner/other", issueNumber: 2, threadId: "wrong-repo" })),
    botComment(formatThreadRecord({ repository: "owner/project", issueNumber: 2, threadId: "thread-two" })),
  ];
  assert.equal(
    findThreadRecord(comments, { repository: "owner/project", issueNumber: 2 }).threadId,
    "thread-two",
  );
});

test("ignores a matching marker written by a human", () => {
  const body = formatThreadRecord({ repository: "owner/project", issueNumber: 2, threadId: "spoofed" });
  assert.equal(
    findThreadRecord([{ body, user: { login: "someone" } }], { repository: "owner/project", issueNumber: 2 }),
    null,
  );
});
