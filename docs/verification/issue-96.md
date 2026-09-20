# Issue #96：真实 Coding Ticket 增量日志验证

本记录对应 [Issue #96](https://github.com/tutar/graph-engineering/issues/96)，区分真实 GitHub Runner/UI 运行证据与 #95 已有的 deterministic Action tests。所有时间均为 UTC。

## 执行身份

- 触发 Issue：[用真实 Coding Ticket 验证 GitHub Job 增量输出](https://github.com/tutar/graph-engineering/issues/96)
- 首次失败 Run：[35480182046](https://github.com/tutar/graph-engineering/actions/runs/35480182046)，Job：[105996471326](https://github.com/tutar/graph-engineering/actions/runs/35480182046/job/105996471326)
- 修复后 Run：[35481246421](https://github.com/tutar/graph-engineering/actions/runs/35481246421)，Job：[105999347915](https://github.com/tutar/graph-engineering/actions/runs/35481246421/job/105999347915)
- Installed Workflow commit：`e85bf5ee31fbb6e69c0455294d414d92c5318e8f`
- Runner：self-hosted Linux/X64，名称 `tutar`
- Codex CLI：`0.153.4`
- Action inputs：`log-mode=detailed`，`token-budget=500000`

## 首次失败与修复

首次 Run `35480182046` 使用 commit `066c756ab05816d7d26c528a8cd94b30ffda5078`，在 Codex 启动前失败。Job 日志在 `2026-09-20T00:59:12.6671599Z` 报告：

```text
.github/actions/codex-goal/action.yml: (Line: 25, Col: 44, Idx: 834): Mapping values are not allowed in this context.
```

该失败 Run 保持原样，没有重跑旧 SHA。修复由 [PR #98](https://github.com/tutar/graph-engineering/pull/98) 提交并合并为 `e85bf5e`；它引用 YAML parser 校验 Action manifest，并同步修改开发源和 Installed Action。修复后通过重新移除再添加 `coding-ticket` 标签产生新的 Run `35481246421`。

## Action 运行期间的增量观察

GitHub Actions REST API 在以下观察点均报告 Run、Job 和 `Run fresh Codex Work Goal` step 为 `in_progress`。与此同时，Runner 为该 Job 维护的 page log 已包含下列事件；Worker diagnostic log 对相同 console record 持续报告 `Try to append ... success rate: 1/1`，证明这些 batch 已在 Goal 终态前发往 GitHub Results service，而不是终态后一次性补写。

| 时间 | Action 仍在运行时已出现的证据 |
| --- | --- |
| `01:23:16.021Z` | `[codex][work][goal] status=active tokens=0 elapsed=0s` |
| `01:23:25.406Z`–`01:23:26.427Z` | `[codex][work][reasoning-summary] event=started/completed` |
| `01:23:26.428Z` 起 | 多行 `[codex][work][agent-message]` delta |
| `01:23:30.793Z` 起 | 命令文本、逐行 `[codex][work][command-output]` 与命令终态 |
| `01:24:23.152Z` | `[codex][work][goal] status=active tokens=24371 elapsed=62s` |
| `01:24:31.401Z` | `[codex][work][goal] status=active tokens=28581 elapsed=70s` |
| `01:24:45.976Z` | `[codex][work][goal] status=active tokens=29348 elapsed=83s` |
| `01:27:19.657Z`–`01:27:19.802Z` | `[codex][work][file-change] status=inProgress/completed`，包含本验证记录的实际 diff |
| `01:29:29.852Z`–`01:29:30.464Z` | `[codex][work][mcp]` 显示 `list_mcp_resources` 参数与完成结果 |
| `01:30:04.645Z`–`01:30:08.985Z` | 一个延时命令的多次 output delta、空行及 `exit=0` 在命令仍运行时逐行出现 |

这次正常完成路径当前只发生 Work Goal，因此实际事件统一使用 `[codex][work][...]` 阶段前缀；没有启动 Handoff Goal，也不制造 `[codex][handoff][...]` 证据。实际发生的 Goal、reasoning summary、Agent message、command、command output、MCP 与 file change 均可辨识。

多行 Runtime 内容的每一行均带 `[codex][work][事件类型]` 前缀。安全 canary 命令中的 `::warning::runtime-canary` 只作为带前缀的 command 内容出现，没有形成 Runner annotation；stdout 中的 ANSI ESC 被投影为字面量 `\u001b`，没有形成颜色或终端控制。观察期间没有出现由 Runtime 内容产生的 `##[...]`、`::...::` Workflow Command 效果或终端控制效果；Runner 原生步骤标记不属于 Runtime 投影。

## 完整 Run 终态核验

此节只在修复后 Run 完成后填写。需要从同一个 Run/Job 的完整日志、REST 状态、Issue 标签事件和 Action outputs 核对：

- Work Goal 终态及 tokens/elapsed time；
- Runtime Token Budget 状态与 work/handoff token outputs；
- Handoff 是否按实际状态保持 `not-started`；
- final message 去重；
- `coding-ticket` / `in-progress` 标签生命周期；
- Job conclusion 与上述事实一致。

在这些事实可回读前，本记录不把修复后 Run 描述为完整通过。

## 限制

- 运行中的 completed-job logs REST endpoint 返回 `404 BlobNotFound`，因此实时观察采用 Runner 的 Job page log spool，并以 Worker 对 GitHub Results service 的成功 append 记录确认传输；Run 完成后再用 GitHub 可回读的完整 Job 日志复核。
- 极短命令没有产生 Codex App Server output delta 时，真实日志只显示 command 与 exit；延时产生的 stdout delta 会逐行显示。本记录只声称实际收到的 Runtime 事件，不从工具调用结果合成缺失的 App Server 事件。
- #95 的 Fake App Server 测试证明确定性协议行为，但不作为本记录中 GitHub Runner/UI 实际呈现的替代证据。
