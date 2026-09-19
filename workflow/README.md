# 当前 Workflow Tasks

> 实现状态：Coding Task 已按 [`docs/design/coding-task-dogfooding.md`](../docs/design/coding-task-dogfooding.md) 迁移到项目自有 Codex Goal Action；Development Task 保持原有恢复与交付行为。

本目录同时交付彼此独立的 Development Task（研发实现任务）与 Coding Task（编码任务）。CLI 将整套 `.github/` 文件复制给目标项目，但两个入口保留各自的标签、并发组和 Task Invocation（任务调用）身份。

## 当前 Coding Task

当前实现使用 open Issue 上的 `ready-for-agent` 与 `coding-ticket` 准入，也保留人工 Issue number 与总 Runtime Token Budget 入口。它固定以下执行组合：

- Agent Action：随 Workflow Definition 交付的 `.github/actions/codex-goal`
- Codex CLI：`0.153.4`
- runner：self-hosted Linux X64，并提供固定 CLI 或允许 Action 写入版本化 tool cache
- 认证：配置 `OPENAI_API_KEY` 时使用本次 Action 隔离的 API key 材料；未配置时使用 Runner-backed Codex Authentication（Runner 承载的 Codex 认证）
- permission profile：`graph-engineering-delivery`，继承 `:workspace`，仅额外允许写入 workspace 的 `.git` 并启用命令网络，以完成分支、commit 与 push
- Runtime Token Budget：默认总预算 `100000`，其中固定预留 `20000` 给一次 Handoff；人工入口可传大于 `20000` 的整数或 `unlimited`

Workflow checkout 默认分支、配置 Git identity、添加 `in-progress`，再把调用者 workspace、Work Goal 和 Handoff Goal 交给项目 Action。每个 job attempt 创建全新的 App Server、Codex Session 与 Work Goal；Workflow 不准备开发分支，也不实现 Goal 循环或独立核对交付事实。

Work Goal `complete` 令 Workflow 移除 `coding-ticket` 与 `in-progress` 并成功结束。`blocked` 或 `budgetLimited` 由 Action 在同一 Session 和 workspace 中启动唯一一次固定预算 Handoff；无论 Handoff 结果如何，Workflow 都失败、尽力移除 `in-progress` 并保留 `coding-ticket`。初始化、认证、App Server 或普通执行失败遵循相同失败标签语义。遗留 `in-progress` 不参与准入；排队中的重复 Run 若发现 `coding-ticket` 已被前序成功 Run 移除，则跳过 Codex。

Coding Agent 通过 `$implement` 读取 GitHub 当前事实，优先从关联 Issue 的现有 Draft PR 或远端工作分支恢复，以可验证增量实现与验证，只勾选有直接证据的验收项，并及时 commit、push、创建或更新 Draft PR。Work Goal 以实现与验证结束、证据同步、代码 push 和 Draft PR 交付作为完成条件。预算受限或阻塞时，Handoff 停止扩大实现范围，把所有与 Issue 有关且可合法提交的修改持久化到工作分支；有远端 diff 时复用或创建明确标记未完成的 Draft PR。候选工作无法可靠归属时保留现场并报告阻塞；所有可保存修改均已 push，且 Draft PR 已存在或没有可形成 PR 的 diff 后，Handoff 才完成。Workflow 信任 Action 返回的 Goal 终态，不验证 clean worktree、远端 branch HEAD、PR 数量或 base/head。

## 当前 Development Task

将同时带 `ready-for-agent` 与 `development-ticket` 标签的 Development Ticket（研发票据）交给 Codex，由 Matt `$implement` Skill 完成实现、自测、review、commit、push 与 Draft PR。

这是主分支持续维护、可整体安装的当前 Development 实现。本次 Coding Task 收缩不修改它；已发布的历史 `github-development-ticket/v0.1.2` 继续从 Git tag `0.1.2` 取得，主分支不回写历史内容。

### 精确兼容组合

- Agent Action（智能体 Action）：`tutar/codex-action@393ad456e354dc9da7be630c09be243cc1d212af`
- Codex CLI：`0.153.4`
- runner：持久化 self-hosted Linux X64，具备 `flock`、Git、GitHub CLI 与 Action 所需的 passwordless sudo / util-linux 隔离能力
- 认证：Runner-backed Codex Authentication（Runner 承载的 Codex 认证），受信配置来源为 runner 的 Codex home
- Action permission profile：`:workspace`
- Task state root：`${{ runner.tool_cache }}/graph-engineering/codex-task-state`，位于 checkout 外，不得作为 artifact 上传

Action revision 或 CLI 版本变化必须更新相应行为测试和运行说明，不能从旧组合推断兼容。

## 接入

按[仓库接入说明](../README.md#接入)用本分支本地打包的 CLI 安装整套 `.github/` 文件，然后创建 `ready-for-agent`、`development-ticket`、`coding-ticket` 和 `in-progress` 标签。配置满足上述组合的 runner，并确认 Actions 可以写 contents、issues 与 pull requests。

```bash
graph-engineering init
graph-engineering check
```

创建包含业务目标与 Acceptance Criteria（验收条件）的 open Issue，先添加 `ready-for-agent`，再按所需任务添加 `coding-ticket` 或 `development-ticket`。也可以从对应 Actions 页面输入 Issue number 手动启动。`in-progress` 仅是 Operational Label（运行态标签），不是锁或队列。

### Development Task Invocation 与恢复

Workflow 用同一个公开 Action step 契约完成准备和执行：

1. `task-phase: prepare` 以 caller `task-id: development` 和持久目录定位 Task Invocation（任务调用）。
2. 首次执行才 checkout 和准备 `agent/issue-<number>` 分支；Action 将仓库复制到隔离持久 workspace。
3. 执行调用把 Goal Prompt（目标提示）、固定 CLI、permission profile 与 workspace 映射给 Action。
4. 同一 GitHub run 的显式 rerun 延续同一 Task Invocation；`run_attempt` 只是尝试元数据。新 run、新 job、不同 caller task 或 matrix 是新身份。身份不依赖 Issue，所以相同 Action 契约也适用于没有 Issue 的 PR、command 或 scheduled Workflow。
5. 本地 session 缺失、损坏或无法加载时，Action 可见地执行 Session Replacement（会话替换）；网络、配额、认证和普通失败不会触发替换。
6. Action 成功只表示调用完成。Harness（驾驭系统）随后独立核对干净工作树、远端目标分支和唯一 open Draft PR，再移除 `development-ticket` 与 `in-progress`。

Compatible Executor（兼容执行器）只映射输入与输出，不读取 Issue/PR/branch 来猜测业务完成，不实现 Goal 循环、远端任务记录、自动重试、队列或调度。换 runner 后本地记录不可取得时允许从 GitHub 持久事实重新执行；不迁移 session/workspace，也不承诺 exactly-once 副作用。

## 操作边界

- 不要上传 task state root、整个 Codex home、认证文件或原生 session。
- 多个 runner 实例可以共享主机，但每个已注册实例仍由 GitHub 调度；Action 的本地锁不把 `in-progress` 变成分布式锁。
- 目标项目负责依赖安装、额外网络/权限、required checks、review、merge 与发布。
- Workflow 不自动 approve、merge、deploy、跨仓库写入或修改 GitHub Settings。
- 从历史 app-server Workflow 升级不会迁移 Thread Record、旧 Controller 状态或中断 refs；先完成当前运行，再显式安装当前版本。

## 静态验证

```bash
node --test --test-concurrency=1 workflow/test/*.test.mjs
```

这些检查证明当前文件可复制且 CLI 能安装/检查；它们不启动付费模型，也不验证真实 runner、认证、网络或 Agent 交付。
