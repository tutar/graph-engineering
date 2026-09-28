import assert from "node:assert/strict";
import test from "node:test";

import { EventRenderer } from "../.github/actions/codex-goal/lib/event-renderer.mjs";

function commandReplay(logMode, chunks) {
  const output = [];
  const renderer = new EventRenderer({ logMode, write: (line) => output.push(line) });
  for (const delta of chunks) {
    renderer.render({ method: "item/commandExecution/outputDelta", params: {
      threadId: "thread", turnId: "turn", itemId: "command", delta,
    } });
  }
  renderer.render({ method: "item/completed", params: {
    threadId: "thread", turnId: "turn",
    item: { id: "command", type: "commandExecution", status: "completed", exitCode: 0 },
  } });
  return output.filter((line) => line.includes("[command-output]"));
}

test("command output preserves lines across transport chunks without empty prefixed rows", () => {
  assert.deepEqual(commandReplay("detailed", ["✔ pipeline\n", "✔ next test\n", "ℹ tests 20\n"]), [
    "[codex][work][command-output] ✔ pipeline\n",
    "[codex][work][command-output] ✔ next test\n",
    "[codex][work][command-output] ℹ tests 20\n",
  ]);
});

test("command progress fragments form one output line", () => {
  assert.deepEqual(commandReplay("detailed", ["", ".", ".", "s", ".", ".", " [ 50%]", "\n"]), [
    "[codex][work][command-output] ..s.. [ 50%]\n",
  ]);
});

test("safe command output reports activity once per item and silent emits none", () => {
  const chunks = ["", ".", ".", "s", "\n"];
  assert.deepEqual(commandReplay("safe", chunks), ["[codex][work][command-output] event=delta\n"]);
  assert.deepEqual(commandReplay("silent", chunks), []);
});

test("command framing is invariant under chunk boundaries, including split CRLF", () => {
  const text = "✔ pipeline\r\n\r\n..s.. [ 50%]\n  final line";
  const expected = commandReplay("detailed", [text]);
  assert.equal(expected.length, 3);
  for (let index = 0; index <= text.length; index += 1) {
    assert.deepEqual(commandReplay("detailed", [text.slice(0, index), text.slice(index)]), expected);
  }
  assert.deepEqual(commandReplay("detailed", [...text]), expected);
});

test("interleaved commands flush independently and redact secrets split across deltas", () => {
  const output = [];
  const renderer = new EventRenderer({ logMode: "detailed", write: (line) => output.push(line),
    redact: (text) => text.replaceAll("fixture-secret", "***"),
  });
  const delta = (itemId, text, turnId = "turn") => renderer.render({
    method: "item/commandExecution/outputDelta",
    params: { threadId: "thread", turnId, itemId, delta: text },
  });
  delta("first", "fixture-");
  delta("second", "::error::data\u001b[31m\n");
  assert.deepEqual(output, ["[codex][work][command-output] ::error::data\\u001b[31m\n"]);
  delta("first", "secret");
  delta("first", "other turn", "turn-2");
  renderer.render({ method: "item/completed", params: { threadId: "thread", turnId: "turn",
    item: { id: "first", type: "commandExecution", status: "completed", exitCode: 0 },
  } });
  assert.equal(output[1], "[codex][work][command-output] ***\n");
  assert.ok(!output.join("").includes("other turn"));
  renderer.setPhase("handoff");
  assert.equal(output.at(-1), "[codex][work][command-output] other turn\n");
  delta("first", "handoff\n");
  assert.equal(output.at(-1), "[codex][handoff][command-output] handoff\n");
  assert.doesNotMatch(output.join(""), /fixture-secret/);
});

test("reasoning deltas join by summary part and safe activity is deduplicated", () => {
  for (const logMode of ["detailed", "safe", "silent"]) {
    const output = [];
    const renderer = new EventRenderer({ logMode, write: (line) => output.push(line) });
    for (const delta of ["think", "ing", "\n", "", "done"]) renderer.render({
      method: "item/reasoning/summaryTextDelta",
      params: { itemId: "reason", summaryIndex: 0, delta },
    });
    renderer.render({ method: "item/completed", params: { item: { id: "reason", type: "reasoning" } } });
    assert.deepEqual(output.filter((line) => !line.includes("event=completed")), logMode === "detailed" ? [
      "[codex][work][reasoning-summary] thinking\n", "[codex][work][reasoning-summary] done\n",
    ] : logMode === "safe" ? ["[codex][work][reasoning-summary] event=delta\n"] : []);
  }
});

test("safe delta identity separates items, turns and Goal phases", () => {
  const output = [];
  const renderer = new EventRenderer({ logMode: "safe", write: (line) => output.push(line) });
  const delta = (itemId, turnId) => renderer.render({ method: "item/commandExecution/outputDelta",
    params: { itemId, turnId, delta: "." },
  });
  delta("one", "first");
  delta("one", "first");
  delta("two", "first");
  delta("one", "second");
  renderer.setPhase("handoff");
  delta("one", "first");
  assert.equal(output.length, 4);
  assert.equal(output.at(-1), "[codex][handoff][command-output] event=delta\n");
});

test("detailed Agent messages render once as the completed message instead of per delta", () => {
  let output = "";
  const renderer = new EventRenderer({
    logMode: "detailed",
    write: (line) => { output += line; },
  });

  for (const delta of ["运行", "中", "日志", "。"] ) {
    renderer.render({
      method: "item/agentMessage/delta",
      params: { itemId: "message-1", delta },
    });
  }
  renderer.render({
    method: "item/completed",
    params: {
      item: { id: "message-1", type: "agentMessage", text: "运行中日志。" },
    },
  });

  assert.equal(output, "[codex][work][agent-message] 运行中日志。\n");
});
