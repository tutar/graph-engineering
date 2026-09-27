# Codex Goal 显式 Skill 问题在 0.156.1 与 0.157.1 的状态

日期：2026-09-27。范围：[Graph Engineering Issue #102](https://github.com/tutar/graph-engineering/issues/102) 所述的 `thread/goal/set.objective` 中 `$implement` 无法可靠触发显式 Skill 调用。仅调查 Codex 上游版本；未运行真实 App Server 复现。

## 结论

**0.156.1 和 0.157.1 均未从 Codex Goal 原生协议层修复该问题。** 两个 tag 的 `ThreadGoalSetParams` 仍只有 `thread_id`、字符串 `objective`、`status`、`token_budget`，没有普通 Turn 的结构化 Skill input。[0.156.1 协议源码](https://github.com/openai/codex/blob/rust-v0.156.1/codex-rs/app-server-protocol/src/protocol/v2/thread.rs)；[0.157.1 协议源码](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/app-server-protocol/src/protocol/v2/thread.rs)

0.157.1 的 Goal Runtime 仍用 `TurnInput::ResponseItem(item)` 启动自动续轮；`item` 来自将 Goal objective 渲染成内部模型上下文的 `continuation_steering_item`，并未走结构化 `UserInput::Skill` 选择流程。[Goal Runtime](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/ext/goal/src/runtime.rs#L469-L485)；[Goal steering](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/ext/goal/src/steering.rs#L53-L93) 因此仅升级 Codex 不能保证 Issue #102 要求的“执行任何业务操作前可靠读取并遵循 enabled Skill”。这是根据协议和运行路径作出的代码判断，尚无两个版本各自的端到端复现记录。

## 版本证据

| 版本 | 官方发布说明 | 直接代码证据 | 判断 |
| --- | --- | --- | --- |
| 0.156.1 | [Release](https://github.com/openai/codex/releases/tag/rust-v0.156.1) 仅列出模型目录热修（GPT-6 Sol/Luna）。 | [Goal set 参数](https://github.com/openai/codex/blob/rust-v0.156.1/codex-rs/app-server-protocol/src/protocol/v2/thread.rs) 无结构化 Skill 字段。 | 未修复原生 Goal 显式 Skill 调用。 |
| 0.157.1 | [Release](https://github.com/openai/codex/releases/tag/rust-v0.157.1) 的 highlights 无有效 PR 索引，不能仅凭说明判定。 | [Goal set 参数](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/app-server-protocol/src/protocol/v2/thread.rs) 不变；[Goal Runtime](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/ext/goal/src/runtime.rs#L469-L485) 仍启动 `ResponseItem`。 | 未修复原生 Goal 显式 Skill 调用。 |

[0.156.1...0.157.1 官方 tag 比较](https://github.com/openai/codex/compare/rust-v0.156.1...rust-v0.157.1) 中 `thread.rs` 的相关改动仅是 Thread item 时间戳，没有改动 `ThreadGoalSetParams`；Goal Runtime 与 steering 文件也未列为变更文件。上述两个 tag 的协议和 0.157.1 运行路径是更直接的证据。

## Issue 边界

截至本次查看，[Issue #102](https://github.com/tutar/graph-engineering/issues/102) 仍为 Open，验收框仍未勾选。Issue [评论](https://github.com/tutar/graph-engineering/issues/102#issuecomment-5748311767) 提出的 Action 侧方案是通过 `skills/list` 校验并将 canonical `SKILL.md` 路径写入 objective，让模型先读取文件；评论明确区分它与 Codex 原生 structured Skill invocation。即使实现这一兼容桥接，也不能把它表述成 Codex 0.156.1 或 0.157.1 已修复原生问题。
