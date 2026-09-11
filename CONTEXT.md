# Loop Engineering

本上下文定义 Agent Loop Engineering（智能体循环工程）在 GitHub 上的应用语言：项目把 GitHub Event 转换为带结束条件的 Goal Prompt，并通过 Compatible Executor 接入 Agent Runtime 原生的 Goal 循环。本项目不拥有或实现 Loop Runtime。

## Language

**Harness（驾驭系统）**:
在一次受控 Agent Turn 中提供上下文、Skill、工具、权限、沙箱、安全边界与运行恢复能力的执行环境。
_Avoid_: Loop Runtime、Graph、Runner

**Agent Turn（智能体轮次）**:
Agent 在 Harness 中完成的一次模型与工具交互；一个 Goal Run 可以跨越多个 Agent Turn。
_Avoid_: Goal Run、整个业务流程

**Agent Runtime（智能体运行时）**:
原生执行 Agent Turn，并拥有 Goal 的生命周期、自动续轮和完成判断的运行环境。
_Avoid_: Agent Action、Compatible Executor、GitHub Workflow

**Loop Engineering（循环工程）**:
围绕 Agent Runtime 原生 Goal，设计明确的目标、Completion Condition 和运行边界，使 Agent 可以自主持续工作直至完成或交接。本项目只提供它在 GitHub 上的应用方式，不实现 Loop Runtime。
_Avoid_: Workflow 重试策略、Graph Engineering、中央 Runtime

**Event Prompt（事件提示模板）**:
Consumer Project 为某类 GitHub Event 配置的模板；Workflow 用它引用业务对象并形成 Goal Prompt。
_Avoid_: Acceptance Criteria、固定系统 Prompt、Agent Action 配置

**Goal Prompt（目标提示）**:
由 Event Prompt 形成、交给 Agent Runtime 原生 Goal 的输入，包含工作目标、Completion Condition，并可引用业务对象中的 Acceptance Criteria。
_Avoid_: Acceptance Criteria 的事实源、普通单轮指令、Graph Definition

**Completion Condition（结束条件）**:
Goal Prompt 中声明的可衡量终态，由 Agent Runtime 原生 Goal 用于判断继续、完成或交接。
_Avoid_: Workflow conclusion、完整业务流程状态、Acceptance Criteria 清单

**Acceptance Criteria（验收条件）**:
具体应用的 Issue、Ticket、PR 或其他业务对象中定义的可验证完成要求。应用应明确写出它，但它不是 Workflow 的通用 Schema。
_Avoid_: Event Prompt、Workflow 配置、Graph Gate

**Goal Run（目标运行）**:
Agent Runtime 围绕一个 Goal Prompt 原生驱动多个 Agent Turn，直至完成、阻塞、失败、取消或需要人工交接。
_Avoid_: Agent Turn、GitHub Workflow Run、整个 Graph

**Fresh Goal Run（全新目标运行）**:
每次 GitHub Workflow Run 根据 Issue、PR、branch、commit、Check 等当前 GitHub 持久事实创建的独立 Goal Run；它重新协调剩余工作，不重放上一次执行步骤，也不依赖旧 Session、runner 工作区、日志或 artifact 才能正确运行。
_Avoid_: Session Resume、步骤回放、跨 Run Loop Runtime

**Agent Action（智能体 Action）**:
将一种 Agent Runtime 安装并启动在 GitHub Actions Job 中的现有 GitHub Action，并拥有该 Runtime 特有的认证、权限和调用接口。
_Avoid_: Compatible Executor、Agent Runtime、Workflow Definition

**Compatible Executor（兼容执行器）**:
本项目维护的薄适配层，把 Workflow 提供的 Goal Prompt 与运行配置映射为一个 Agent Action 的输入，并把其终态映射回 Workflow；它不实现 Goal、续轮、Evaluator 或业务验收。
_Avoid_: Agent Action、Loop Runtime、动态 Provider 系统

**Graph Engineering（图工程）**:
定义多个 Goal Run、Verifier、Human Gate 与业务节点之间的拓扑、转移和整体完成判断；CI 或 Review Gate 失败后启动新的 Repair Goal Run 属于这一层。
_Avoid_: Loop Engineering、Harness Engineering、LangGraph 特定实现

**Development Ticket（研发票据）**:
携带指定标签、并至少给出业务目标与 Acceptance Criteria 的 GitHub Issue；Harness 向 `implement` Skill 提供它，Skill 成功结束即表示首个 Development Goal Run 完成。
_Avoid_: Goal Run、Draft PR、完整 CI/Review Graph

**Human Command（人工命令）**:
由对目标仓库拥有 write 或更高权限的人，以任意 open Issue 或 open PR 的新评论首个非空白 token `@codex` 加非空指令的形式发出的明确要求；事件路由用它与目标对象上下文形成 Goal Prompt。
_Avoid_: 普通评论、Graph Gate、系统指令

**Command Run（命令运行）**:
Human Command 启动的独立 Goal Run；每条命令不自动重试，并在正常结束时返回成功、失败或阻塞结果。
_Avoid_: Development Ticket、Graph transition、无限自主循环

**Operational Label（运行态标签）**:
表达 Loop 当前执行占用状态、但不属于 Matt triage state role 的 GitHub 标签；`in-progress` 是当前唯一的运行态标签。
_Avoid_: Triage state、完成证据、业务状态源

**Effect Profile（副作用配置）**:
Consumer Project 为一次 Workflow Instance 静态声明的 Agent 权限与工具能力上限；首版提供 `read-only` 与 `branch-and-pr`，额外写能力必须由项目显式扩展。它不能逐次代理或验证 Agent 的每个 GitHub 操作。
_Avoid_: 动态权限 DSL、单次操作审批、Prompt 安全保证

**Read-only Effect Mode（只读副作用模式）**:
Agent 可以读取完成 Goal 所需的仓库及 Issue/PR 上下文，但没有 GitHub 写凭据；Workflow 自身仍可用独立可信步骤发布配置允许的运行状态和结果。
_Avoid_: 无 GitHub 访问、Agent-write Effect Mode

**Agent-write Effect Mode（Agent 可写副作用模式）**:
通过审核 Gate 后，Agent 在 Effect Profile 的能力上限内直接获得 Git 与 GitHub API 写能力，可以保存工作分支进度、创建或更新 PR、评论业务对象；Workflow 不声称逐次代理这些操作。
_Avoid_: 默认执行模式、无限制仓库管理权限、可信步骤代执行

**Write Authorization（写入授权）**:
由具备配置所需仓库权限的操作者通过指定标签授予的一次性 Agent-write Effect Mode 运行许可；默认授权者须有 `admin` 权限，Consumer Project 可以配置额外 actor 或 team allowlist。授权标签在运行期间保留，并在任一终态后消费；它降低未经审核任务进入可写 Workflow 的风险，但不证明运行期间读取的所有动态内容均可信。
_Avoid_: 长期授权、内容安全证明、运行占用状态

**Workflow Definition（工作流定义）**:
`loop-engineering` 为一种 GitHub Agent Loop 用法维护的、带来源版本且可整体复制的普通文件集合，包括事件路由、可配置 Event Prompt 和 Compatible Executor；未经真实 Consumer Project 验证时是 Candidate Definition。
_Avoid_: Reusable Workflow、中央 Runtime、通用 DSL

**Workflow Instance（工作流实例）**:
Consumer Project 从某个 Workflow Definition 版本复制并自行拥有的可运行工作流；项目可以自由修改，记录的来源版本只表示最后参考的定义版本，不保证文件仍完全一致。
_Avoid_: 中央托管实例、只读副本、远程调用
