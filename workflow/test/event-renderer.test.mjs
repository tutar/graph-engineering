import assert from "node:assert/strict";
import test from "node:test";

import { EventRenderer } from "../.github/actions/codex-goal/lib/event-renderer.mjs";

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
