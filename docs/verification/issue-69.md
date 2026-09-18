# [为维护版 codex-action 增加跨 rerun 的 Runtime Token Budget](https://github.com/tutar/graph-engineering/issues/69) 验证报告

本报告记录 `github-coding-task/v0.1.1` 的本地 Candidate Publication Gate（候选发布门）证据。它冻结维护版 Action `0eb4ac73c375efc0a079f6ca5439e6b1c74157df` 与 Codex CLI `0.153.4`，不把本地测试当作 #71 拥有的真实 Consumer Evidence Bundle（消费项目证据包）。

## 验收映射

1. **公开预算契约**：Action 的 `token-budget` 默认值为 400,000，接受正安全整数或 `unlimited`；Profile 通过 `token-budget-capability: app-server-goal` 明确选择 Runtime 强制路径。
2. **Runtime 权威状态**：同一 Task Invocation（任务调用）的 rerun 显式恢复 Session，先读取 Runtime Goal 的 `tokenBudget` 与 `tokensUsed`；没有 override 时沿用 Runtime 值，不从 Workflow 重建账本。
3. **单调人工控制**：Action 从 `GE_CODING_BUDGET_RUN_<run_id>` 读取 Repository Variable（仓库变量）。相等、更大的有限值与 `unlimited` 合法；降低值及 `unlimited` 到有限值在 Goal 重新激活前失败。
4. **耗尽与恢复**：`budgetLimited` 单独映射为 `budget-exhausted` / `not-produced` / `not-run` / `exhausted` / `required`。Action 抛出失败前已持久保存 Session 与 task record，Workflow 因而不会进入交付校验或成功清理。
5. **失败边界**：只有 Runtime Goal 的 `budgetLimited` 是耗尽。App Server 错误、进程退出与 cancellation 保留未完成 task record；本地恢复层继续区分 network、quota、authentication 与 session-unloadable replacement。
6. **操作者界面**：Job Summary 提供 Repository Actions Variables 设置页、完整变量名、previous/requested/effective limits、Runtime usage、run attempt、合法值、原 Run `Re-run failed jobs` 指引与完成后清理提醒。
7. **现有执行契约**：预算路径继续使用固定 model、effort、`:workspace` permission profile 与结构化 Agent 结果约束，并复用原 `drop-sudo` / unprivileged process wrapper。
8. **结构化状态**：Workflow 分别保留 machine execution、Agent result、delivery facts 与 Runtime Token Budget state；耗尽不解析或伪造 `{status: completed|blocked, summary}`。

## 本地验证

- 维护版 Action：`tsc --noEmit`、bundle build、`git diff --check` 通过；完整测试 207 项中 202 通过、5 项因宿主环境前置条件跳过、0 失败。新增 composite Action invocation seam fixture 覆盖 fresh、same-Run resume、exhaustion、finite/equal increase、`unlimited`、invalid values、network、quota、crash、unsupported、结构化结果与 Job Summary。
- Graph Engineering：Coding Task contract/control tests 覆盖 400,000 默认值、capability/profile 固定、耗尽时 `not-produced` 以及 Action 状态向 Workflow 输出的映射。
- Definition delivery verifier 固定 Definition `v0.1.1`、Compatibility Profile `github-coding-task/codex/v0.1.1`、Action revision、CLI、runner、认证、permission profile、输入输出与预算能力。

## 证据边界

上述证据证明 Action 行为、公共 seam 测试和 Coding Task/Profile 静态集成。#71 仍独占真实 Consumer Budget Case Results：默认 400,000 正常完成、低成本真实耗尽、原 Run UI override/rerun、实际 `tokensUsed`、crash/cancellation/network/quota 与冻结组合都必须由 #71 的同一 Evidence Bundle 证明。在这些结果存在前，本报告不声明对应真实 Consumer 验收项完成。
