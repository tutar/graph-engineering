import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controller = readFileSync(
  new URL("../files/.github/loop-engineering/github-development-ticket.mjs", import.meta.url),
  "utf8",
);

test("the shared profile supports the Runner proxy and local test servers", () => {
  assert.match(
    controller,
    /network=\{enabled=true,allow_upstream_proxy=true,allow_local_binding=true,domains=/,
  );
  assert.match(controller, /"api\.github\.com"="allow"/);
});

test("Agent Skill work may read the canonical specification", () => {
  assert.match(controller, /"agentskills\.io"="allow"/);
});

test("project-specific package registries stay out of the shared profile", () => {
  assert.doesNotMatch(controller, /"pypi\.org"="allow"/);
  assert.doesNotMatch(controller, /"files\.pythonhosted\.org"="allow"/);
});
