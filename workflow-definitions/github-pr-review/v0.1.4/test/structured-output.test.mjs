import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapActionExecution } from "../files/.github/loop-engineering/pr-review-case.mjs";

const schema = JSON.parse(readFileSync(new URL("../files/.github/loop-engineering/review-result.schema.json", import.meta.url)));

// Conservative offline contract guard, not an API acceptance emulator.
function assertSupported(node) {
  for (const keyword of ["oneOf", "allOf", "not", "if", "then", "else", "dependentRequired", "dependentSchemas"]) {
    assert.equal(keyword in node, false, `unsupported keyword: ${keyword}`);
  }
  if (node.properties) {
    assert.equal(node.additionalProperties, false);
    assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
    Object.values(node.properties).forEach(assertSupported);
  }
  if (node.items) assertSupported(node.items);
  if (node.anyOf) node.anyOf.forEach(assertSupported);
  if (node.$defs) Object.values(node.$defs).forEach(assertSupported);
}

test("the exact Action output-schema file avoids the Bundle 5 API rejection", () => {
  const workflow = readFileSync(new URL("../files/.github/workflows/github-pr-review.yml", import.meta.url), "utf8");
  assert.match(workflow, /output-schema-file: \$\{\{ github.workspace \}\}\/\.loop-engineering-trusted\/\.github\/loop-engineering\/review-result\.schema\.json/);
  assert.equal(schema.type, "object");
  assert.equal("anyOf" in schema, false);
  assertSupported(schema);
});

test("the offline guard catches the unchanged historical failing schema", () => {
  const historical = JSON.parse(readFileSync(new URL("../../v0.1.3/files/.github/loop-engineering/review-result.schema.json", import.meta.url)));
  assert.throws(() => assertSupported(historical), /unsupported keyword: oneOf/);
  const optional = structuredClone(schema);
  optional.required = optional.required.filter((key) => key !== "handoff");
  assert.throws(() => assertSupported(optional));
});

const target = { repository: "acme/widgets", number: 42, baseSha: "base", headSha: "head" };
const identity = { repository: target.repository, pullRequestNumber: target.number, baseSha: target.baseSha, headSha: target.headSha };
const axis = { verdict: "pass", findings: [] };
const completed = { ...identity, standards: axis, spec: axis, handoff: null };
const map = (candidate) => mapActionExecution({ actionOutcome: "success", finalMessage: JSON.stringify(candidate) }, target);

test("nullable transport is normalized before trusted publication", () => {
  const result = map(completed);
  assert.equal(result.terminal, "completed");
  assert.equal("handoff" in result.review, false);
  assert.equal(map({ ...identity, standards: null, spec: null, handoff: { summary: "Missing specification" } }).terminal, "handoff");
});

test("schema-compatible but semantically invalid combinations still fail closed", () => {
  for (const candidate of [
    { ...completed, standards: null },
    { ...completed, spec: null },
    { ...completed, handoff: { summary: "Mixed output" } },
    { ...identity, standards: null, spec: null, handoff: null },
    { ...completed, handoff: undefined },
    { ...completed, headSha: "other" },
    { ...completed, published: true },
    { ...identity, standards: null, spec: null, handoff: { summary: " " } },
  ]) assert.equal(map(candidate).terminal, "failed");
});
