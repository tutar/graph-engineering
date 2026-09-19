# Graph Engineering

本上下文定义 Graph Engineering（图工程）在 GitHub 软件研发场景中的应用语言：项目用 GitHub 持久事实连接 Workflow Task、Goal Run 与人工 Gate，并由 Agent Runtime 原生 Goal 驱动单次任务执行。本项目不拥有或实现 Loop Runtime。

## Language

**Harness（驾驭系统）**:
在一次受控 Agent Turn 中提供上下文、Skill、工具、权限、沙箱与安全边界的执行环境。
_Avoid_: Loop Runtime、Graph、Runner

**Agent Turn（智能体轮次）**:
Agent 在 Harness 中完成的一次模型与工具交互；一个 Goal Run 可以跨越多个 Agent Turn。
_Avoid_: Goal Run、整个业务流程

**Agent Runtime（智能体运行时）**:
原生执行 Agent Turn，并拥有 Goal 生命周期、自动续轮和完成判断的运行环境。
_Avoid_: Agent Action、GitHub Workflow

**Loop Engineering（循环工程）**:
围绕 Agent Runtime 原生 Goal，设计明确目标、Completion Condition 与运行边界，使 Agent 持续工作直至完成或交接；它是 Graph Engineering 中单个 Goal Run 的工程边界。
_Avoid_: Workflow 重试策略、Graph Engineering、中央 Runtime

**Graph Engineering（图工程）**:
定义多个 Goal Run、Verifier、Human Gate 与业务节点之间的拓扑、转移和整体完成判断；本项目把它应用于 GitHub 软件研发。
_Avoid_: Loop Engineering、Harness Engineering、LangGraph 特定实现

**Event Prompt（事件提示模板）**:
项目为某类 GitHub Event 配置的模板；Workflow 用它引用业务对象并形成 Goal Prompt。
_Avoid_: Acceptance Criteria、固定系统 Prompt、Agent Action 配置

**Workflow Task（工作流任务）**:
项目希望 Agent 完成的一种工作，具有明确目标、Completion Condition、副作用权限与结果交付责任；它不是触发事件或单个 Job。
_Avoid_: GitHub Event、Task Invocation、Workflow Definition

**Task Invocation（任务调用）**:
某个 Workflow Task 被一次已接纳事件启动的执行身份；每个 GitHub Actions job attempt 都是独立调用，并创建新的 Codex Session 与 Goal Run。
_Avoid_: Workflow Task、Issue、Session Resume

**Development Task（研发实现任务）**:
以 Development Ticket 的目标和 Acceptance Criteria 为依据，实现、验证代码并交付 Draft PR 的 Workflow Task；不包含自动批准、合并或发布。
_Avoid_: Development Ticket、Coding Task、完整 CI/Review Graph

**Coding Task（编码任务）**:
由带标签 Issue 或人工 dispatch 启动，通过 Codex 原生 Goal 使用 `implement` Skill 实现、验证并交付 Draft PR 的 Workflow Task。
_Avoid_: Development Task、Development Ticket、Agent Action

**PR Review Task（PR 审查任务）**:
已退役的历史任务：针对具体 PR 的代码变更检查 Standards 与 Spec，并交付绑定目标提交的审查结果；它不负责实现修复或合并。
_Avoid_: Development Task、Repository Review Task、自动批准

**Repository Review Task（仓库审查任务）**:
尚未实施的后续 Workflow Task，面向仓库的增量代码审查并交付建议报告；它不是针对单个 PR 的审查，也不授权自动修改代码。
_Avoid_: PR Review Task、自动重构、Graph Gate

**Review Report（审查报告）**:
Repository Review Task 的建议性结果载体；它不构成修复授权或变更验收证据。
_Avoid_: 修复 PR、通过证明、自动变更

**Development Ticket（研发票据）**:
携带指定标签、并至少给出业务目标与 Acceptance Criteria 的 GitHub Issue；Harness 向 `implement` Skill 提供它。
_Avoid_: Goal Run、Draft PR、完整 CI/Review Graph

**Goal Prompt（目标提示）**:
由 Event Prompt 形成并通过 App Server `thread/goal/set` 交给 Agent Runtime 的输入，包含工作目标、Completion Condition 与业务对象引用。
_Avoid_: `/goal` 命令文本、Acceptance Criteria 的事实源、普通单轮指令

**Completion Condition（结束条件）**:
Goal Prompt 中声明的可衡量终态，由 Agent Runtime 原生 Goal 用于判断继续、完成或交接。
_Avoid_: Workflow conclusion、完整业务流程状态、Acceptance Criteria 清单

**Acceptance Criteria（验收条件）**:
具体 Issue、Ticket、PR 或其他业务对象中定义的可验证完成要求；它不是 Workflow 的通用 Schema。
_Avoid_: Event Prompt、Workflow 配置、Graph Gate

**Goal Run（目标运行）**:
Agent Runtime 围绕一个 Goal Prompt 原生驱动多个 Agent Turn，直至完成、阻塞、预算受限、失败或取消。
_Avoid_: Agent Turn、GitHub Workflow Run、整个 Graph

**Work Goal（工作目标）**:
一次 Coding Task Invocation 的主要 Goal Run，负责定位 GitHub 当前事实、实现与验证 Acceptance Criteria、提交并推送代码，以及在完成时创建或更新 Draft PR。
_Avoid_: Handoff Goal、整个 Workflow Task、单个 Agent Turn

**Handoff Goal（交接目标）**:
Work Goal 进入 `blocked` 或 `budgetLimited` 后，在同一 Codex Session 与 workspace 中至多启动一次的收尾 Goal Run；它只保存适合提交的未完成代码并推送，不继续实现或创建完成用 Draft PR。
_Avoid_: 自动重试、第二次 Work Goal、异常恢复保证

**Fresh Goal Run（全新目标运行）**:
每次 Task Invocation 根据 Issue、评论、远端分支和 PR 当前事实创建的独立 Goal Run；它不依赖上一调用的 Session 或 runner 本地状态。
_Avoid_: Session Resume、步骤回放、跨调用上下文共享

**Runtime Token Budget（运行时 Token 预算）**:
Agent Runtime 对 Goal Run 执行的模型消费边界；有限 Coding Task 总预算为 Work Goal 预算加固定 Handoff 预算，`unlimited` 只取消 Work Goal 的有限预算。
_Avoid_: 精确 provider 硬上限、Action 日志统计、费用预算

**Agent Action（智能体 Action）**:
本项目维护的通用 GitHub Action，负责准备固定 Codex CLI、认证、启动 App Server、设置 Work/Handoff Goal 并返回结构化终态；它不拥有 GitHub 标签、分支、Issue、PR 或 workspace 生命周期。
_Avoid_: Agent Runtime、Workflow Task、GitHub 业务控制器

**Runner-backed Codex Authentication（Runner 承载的 Codex 认证）**:
未提供 API key 时，由 self-hosted runner 向 Agent Action 提供既有 Codex 登录状态的认证方式；Action 仍检查固定 CLI 版本，但不输出认证材料。
_Avoid_: 偶然可用的未检查 CLI、仓库 API Key、动态 Provider

**Human Command（人工命令）**:
由对目标仓库拥有 write 或更高权限的人，以 open Issue 或 PR 评论中的 `@codex` 加非空指令发出的明确要求。
_Avoid_: 普通评论、Graph Gate、系统指令

**Command Run（命令运行）**:
Human Command 启动的独立 Goal Run；它不自动扩大为无限自主循环。
_Avoid_: Development Ticket、Graph transition、定时任务

**Operational Label（运行态标签）**:
表达 Task Invocation 当前可能占用中的 GitHub 标签；`in-progress` 是可见状态提示而非原子锁，真正的同 Issue 并发互斥由 Workflow concurrency group 提供。
_Avoid_: Triage state、分布式锁、完成证据

**Effect Profile（副作用配置）**:
项目为一次 Workflow Task 静态声明的 Agent 权限与工具能力上限；它不能逐次代理或验证 Agent 的每个 GitHub 操作。
_Avoid_: 动态权限 DSL、单次操作审批、Prompt 安全保证

**Read-only Effect Mode（只读副作用模式）**:
Agent 可以读取完成 Goal 所需的仓库及 Issue/PR 上下文，但没有 GitHub 写凭据。
_Avoid_: 无 GitHub 访问、Agent-write Effect Mode

**Agent-write Effect Mode（Agent 可写副作用模式）**:
Agent 在 Effect Profile 的能力上限内直接获得 Git 与 GitHub API 写能力，可以保存工作分支进度、创建或更新 PR；Workflow 不逐次代理这些操作。
_Avoid_: 默认无限写权限、自动合并、可信步骤代执行

**Write Authorization（写入授权）**:
由具备所需仓库权限的操作者通过指定标签授予的一次性 Agent-write Effect Mode 运行许可；它不证明运行期间读取的所有动态内容均可信。
_Avoid_: 长期授权、内容安全证明、运行占用状态

**Workflow Definition（工作流定义）**:
位于 `workflow/.github/`、可由 `graph-engineering init` 安装到项目根 `.github/` 的普通文件集合；开发源与已安装 dogfooding 副本允许在开发期间暂时不同步。
_Avoid_: Candidate Definition、Stable Definition、中央 Runtime

**Installed Workflow（已安装工作流）**:
项目根 `.github/` 中实际响应 GitHub Event 的 Workflow Definition 副本；`graph-engineering check` 可显式检查它与开发源是否一致，CI 不强制两者始终相同。
_Avoid_: Consumer Workflow Instance、远程 Reusable Workflow、开发源

**Repository Release（仓库发布版本）**:
表达 `graph-engineering` 仓库整体代码、CLI 与文档的版本化快照；它不表达当前工作流的 Candidate 或 Stable 成熟度。
_Avoid_: Workflow 运行状态、兼容性证明、所有任务共用的业务版本
