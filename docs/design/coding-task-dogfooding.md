# Coding Task 直接 dogfooding 设计

状态：设计已确认，尚未实现。

## 目标

在本仓库通过带 `ready-for-agent` 与 `coding-ticket` 标签的 Issue 或人工 dispatch 启动 Codex Coding Task。每次调用创建新的 App Server thread，并用原生 Goal 与 Token Budget 驱动 `$implement` 完成 Issue；正常完成创建或更新 Draft PR，阻塞或预算受限时只执行一次代码保存交接。

本设计只替换 Coding Task。Development Task 暂时保持现状。

## 所有权

| Owner | 负责 | 不负责 |
|---|---|---|
| Workflow | 事件、准入、权限、同 Issue concurrency、checkout、Git identity、标签、Job 结论 | 分支选择、实现、交付核验、Goal 循环 |
| Codex Goal Action | 固定 CLI、认证、App Server、Work/Handoff Goal、预算、结构化终态 | Issue 语义、标签、checkout、Git 分支、PR、workspace 清理 |
| Coding Agent + `$implement` | 读取 Issue 与 GitHub 当前事实、定位分支、实现、测试、review、commit、push、验收项与 Draft PR | Workflow 准入、并发和标签生命周期 |
| Agent Runtime | Goal 自动续轮、累计用量与 Goal 终态 | GitHub Workflow 结论、业务事实核验 |

Workflow 信任 Coding Agent 的 Goal 终态，不检查工作树是否干净、远端 branch HEAD、PR 数量或 base/head。后续新 Session 自行发现并修复 branch、PR 与 Issue 的不一致。

## 执行序列

1. Workflow 接受 `coding-ticket` labeled event 或带 Issue number 的人工 dispatch。
2. Workflow 确认 Issue open 且具有 `ready-for-agent` 与 `coding-ticket`；若成功前序 Run 已移除 `coding-ticket`，当前排队 Run 直接跳过。
3. issue-scoped concurrency group 保证同一 Issue 不同时执行；`in-progress` 只是可见占用状态，不是锁。
4. Workflow checkout 默认分支、完整 fetch，并配置 Git identity；开发分支名不作为 Action 输入。
5. Workflow 添加 `in-progress`，调用 Codex Goal Action。
6. Action 每次启动新的 App Server 与 Codex Session，在调用者 workspace 中设置 Work Goal。
7. Work Goal 自行读取 Issue、评论、远端分支和 PR，定位或创建开发分支，完成实现与交付。
8. Work Goal `complete` 时，Action 返回成功；Workflow 移除 `coding-ticket` 与 `in-progress`。
9. Work Goal `blocked` 或 `budgetLimited` 时，Action 在同一 Session、App Server、cwd 和 workspace 中启动一次 Handoff Goal。
10. 无论 Handoff 成功或失败，Job 都失败；Workflow 尽力移除 `in-progress` 并保留 `coding-ticket`。

人工取消、平台终止、runner 丢失、App Server 崩溃或初始化/认证失败可能让 `always()` 与 Handoff 都无法运行。下一次调用不得因遗留 `in-progress` 拒绝执行。

## Goal

App Server 客户端使用 `thread/goal/set`，objective 不包含 TUI 命令 `/goal`。

### Work Goal objective

```text
使用 $implement 完成 Issue #N。
读取 Issue、评论、远端分支和现有 PR，定位当前状态。
实现并验证 Acceptance Criteria；仅勾选已有证据证明满足的项目。
提交并 push 代码；完成后创建或更新 Draft PR。
```

只有实现、测试、code review、commit、push、适用的验收项更新和 Draft PR 都完成后，Coding Agent 才能把 Work Goal 标记为 `complete`。

### Handoff Goal objective

```text
停止继续实现。
检查当前 workspace、分支和未提交修改。
提交适合保存的未完成代码并 push。
不得创建完成用 Draft PR，不得把未完成验收项勾选为完成。
```

Handoff 不更新 Issue 进展，不继续实现，也不触发第二次 Handoff。

## Budget 与终态

- 默认总预算为 400,000 tokens。
- 固定 Handoff 预算为 20,000 tokens，不允许调用者修改。
- 有限总预算必须大于 20,000；Work Goal 使用 `total - 20,000`。
- `unlimited` 只让 Work Goal 不受有限预算约束；Work Goal blocked 后的 Handoff 仍固定为 20,000。
- 标签触发使用默认预算；人工 dispatch 可以指定正整数或 `unlimited`。
- Runtime Token Budget 不是精确 provider 硬上限，也不是费用预算。

| Work Goal | Handoff Goal | Job conclusion |
|---|---|---|
| `complete` | 不启动 | success |
| `blocked` | `complete` | failure，已尝试保存代码 |
| `budgetLimited` | `complete` | failure，已尝试保存代码 |
| `blocked` / `budgetLimited` | `blocked`、`budgetLimited` 或 failed | failure，收尾未完成 |
| Action、认证、App Server 或 runner 异常 | 不保证启动 | failure |

Action 不从 final message 解析关键字，也不因 Handoff 启动成功而声称代码已经保存。

## Action 接口

建议首版输入：

```yaml
with:
  working-directory: ${{ github.workspace }}
  prompt: <work goal objective>
  token-budget: 400000 # 或 unlimited
  handoff-prompt: <handoff goal objective>
  codex-version: <固定版本>
  permission-profile: :workspace
```

`handoff-token-budget` 是 Action 内部固定常量 20,000，不作为公开配置。`OPENAI_API_KEY` 是可选环境变量；未提供时使用 runner 已准备的 Codex 登录状态。`GH_TOKEN` 由 Workflow 注入给 Coding Agent，Action 不读取或解释它。

建议首版输出为 `work-goal-status`、`handoff-goal-status`、`token-budget-state`、`work-tokens-used`、`handoff-tokens-used` 与 `final-message`。

Action 先使用匹配固定版本的 runner CLI 或 runner tool cache；缺失时安装到版本化 cache，不执行每次全局安装。每个 job 启动独立 App Server 进程，结束后停止，不运行跨 job daemon。

## 开发、安装与测试

`workflow/.github/` 是开发源，根 `.github/` 是本仓库实际 dogfooding 的已安装副本。开发期间二者允许不一致；不设置强制 CI 同步检查。开发和测试完成后显式运行 `graph-engineering init` 安装，`graph-engineering check` 由操作者按需检查当前安装是否匹配开发源。

实现只要求三类自动化测试：

1. App Server JSON-RPC、Goal 状态与预算拆分单元测试；
2. Fake App Server 覆盖 `complete`、`blocked`、`budgetLimited` 与 Handoff 再失败；
3. 在临时目录验证 `graph-engineering init/check` 的安装行为，不比较开发中的仓库根 `.github/`。

安装完成后使用本仓库真实 `coding-ticket` dogfood；不建立独立 Consumer 仓库、Evidence Bundle 或 Stable 晋级流程。

## 非目标

- 不修改 Development Task；
- 不恢复跨 attempt Session、Goal 或未提交 workspace；
- 不把 `in-progress` 当作分布式锁；
- 不独立验证 Coding Agent 的 GitHub 交付事实；
- 不自动批准、合并、发布或部署；
- 不用 job timeout 或软截止触发 Handoff；
- 不保证硬中断后的代码保存。

## 后续 Issue 图

本文只记录未来票据，不在本次设计工作中创建 GitHub Issue。

```text
I1 收缩当前交付与领域模型
├── I2 实现项目自有 Codex Goal Action
│   └── I3 将 Coding Workflow 接入新 Action
├── I4 收缩 graph-engineering init/check 安装契约
└── I5 安装到根 .github 并用真实 coding-ticket dogfood

I2 ──blocks──> I3
I1 + I3 + I4 ──block──> I5
```

### I1 收缩当前交付与领域模型

删除当前 Candidate/Stable/Consumer/Evidence 晋级模型和相关活动索引，归档历史 evidence，保留历史 Release 事实；不改写已发布 tag。

### I2 实现项目自有 Codex Goal Action

实现固定 CLI 与认证、App Server JSON-RPC、每 attempt 新 Session、有限与 unlimited Work Budget、固定 Handoff Budget、单次 Handoff 和结构化输出，并以 fake transport 测试状态机。

### I3 将 Coding Workflow 接入新 Action

保留 Development 风格的事件、权限、concurrency、checkout 与标签语义；移除外部 `codex-action`、Task Repository、Session recovery 和交付核验，按本文终态映射结束 Job。

### I4 收缩 `graph-engineering init/check` 安装契约

保留 `workflow/.github/` 到目标 `.github/` 的显式安装与按需检查，删除当前 Definition/Profile/Evidence 身份与晋级逻辑；临时目录测试安装，不要求开发源与仓库根副本实时一致。

### I5 安装并 dogfood

在 I1–I4 完成并通过测试后，将开发源安装到本仓库根 `.github/`，提交安装副本，并用真实 Coding Ticket 验证正常完成以及一次 blocked 或 budgetLimited Handoff。
