# Graph Engineering

本上下文定义 Graph Engineering（图工程）在 GitHub 软件研发场景中的应用语言：项目以 GitHub 持久事实连接 Workflow Task、Goal Run、Verifier 与人工 Gate，并通过 Compatible Executor 接入 Agent Runtime 原生的 Goal 循环。本项目不拥有或实现 Loop Runtime。

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
围绕 Agent Runtime 原生 Goal，设计明确的目标、Completion Condition 和运行边界，使 Agent 可以自主持续工作直至完成或交接；它是 Graph Engineering 中单个 Goal Run 的工程边界。
_Avoid_: Workflow 重试策略、Graph Engineering、中央 Runtime

**Event Prompt（事件提示模板）**:
Consumer Project 为某类 GitHub Event 配置的模板；Workflow 用它引用业务对象并形成 Goal Prompt。
_Avoid_: Acceptance Criteria、固定系统 Prompt、Agent Action 配置

**Workflow Task（工作流任务）**:
Consumer Project 希望 Agent 完成的一种工作，具有明确的目标、Completion Condition、副作用权限与结果交付责任；它不是触发事件，同一任务可以由多个事件启动。
_Avoid_: GitHub Event、单个 Job、Workflow Definition

**Task Invocation（任务调用）**:
某个 Workflow Task 被一次已接纳事件启动的独立执行身份；不同事件及不同 Agent Action 调用各自独立，同一次调用的失败重试延续该身份。
_Avoid_: Workflow Task、Issue、GitHub Event 类型、执行尝试

**Development Task（研发实现任务）**:
以 Development Ticket 的目标和 Acceptance Criteria 为依据，实现、验证代码并交付 Draft PR 的 Workflow Task；不包含自动批准、合并或发布。
_Avoid_: Development Ticket、PR Review Task、完整 CI/Review Graph

**Coding Task（编码任务）**:
由 Agent Runtime 经静态安装的 Compatible Executor 独立实现、验证并交付 Draft PR 的 Workflow Task，是 Agent Action 路径的新任务身份；Executor 只负责映射调用，它可以处理 Development Ticket，但不继承 Development Task 的 Definition、Session 或证据。
_Avoid_: Development Task、Development Ticket、Agent Action

**PR Review Task（PR 审查任务）**:
已退役的历史任务：针对具体 PR 的代码变更，分别检查 Standards（规范）与 Spec（规格），并交付绑定目标提交的审查结果的 Workflow Task；Agent 分析不拥有结果发布的写权限，也不负责实现修复或合并。
_Avoid_: Development Task、Repository Review Task、自动批准

**Repository Review Task（仓库审查任务）**:
尚未实施的后续 Workflow Task，面向仓库的增量代码审查并交付建议报告；架构改进分析延期，它不是针对单个 PR 的审查，也不授权自动修改代码。
_Avoid_: PR Review Task、自动重构、Graph Gate

**Review Report（审查报告）**:
Repository Review Task 的建议性结果载体，呈现实际执行的代码审查，并在包含架构改进分析时将其单独呈现；可信发布步骤拥有报告发布责任，报告本身不构成修复授权或变更验收证据。
_Avoid_: Evidence Bundle、修复 PR、通过证明

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
新 Task Invocation 根据 Issue、PR、branch、commit、Check 等当前 GitHub 持久事实创建的独立 Goal Run；它重新协调剩余工作，不依赖上一任务的 Session 或本地执行状态才能正确运行。
_Avoid_: Session Resume、步骤回放、跨任务上下文共享

**Session Resume（会话恢复）**:
Agent Action 在同一 Task Invocation 的显式失败重试中，利用 Agent Runtime 可取得的原生会话状态继续未完成工作；它是上下文延续方式，不是业务事实源，也不代表跨 Runner 迁移或自动重试。
_Avoid_: Fresh Goal Run、步骤回放、Issue 共享会话、任务调度

**Session Replacement（会话替换）**:
原生会话不存在、损坏或无法加载时，在明确报告恢复失败后，为同一 Task Invocation 建立新的当前会话；旧会话仅作为诊断历史，不再作为后续恢复目标。
_Avoid_: 静默降级、业务完成证明、网络错误重试

**Agent Action（智能体 Action）**:
将一种 Agent Runtime 安装并启动在 GitHub Actions Job 中的现有 GitHub Action，并拥有该 Runtime 特有的认证、权限和调用接口。
_Avoid_: Compatible Executor、Agent Runtime、Workflow Definition

**Compatible Executor（兼容执行器）**:
本项目维护的薄适配层，把 Workflow 提供的 Goal Prompt 与运行配置映射为一个 Agent Action 的输入，并把其终态映射回 Workflow；它不实现 Goal、续轮、Evaluator 或业务验收。
_Avoid_: Agent Action、Loop Runtime、动态 Provider 系统

**Compatibility Profile（兼容配置）**:
随 Compatible Executor 版本交付的静态约束，以不可变 revision 锁定一个具体 Agent Action 来源，并声明输入映射、所需权限、可用输出及可信验证方式；约束不匹配时运行失败并交接，不协商、猜测或动态发现能力。
_Avoid_: Effect Profile、运行时 capability discovery、通用 Agent Runtime 接口

**Runner-backed Codex Authentication（Runner 承载的 Codex 认证）**:
由专用 self-hosted runner 向明确支持该路径的 Codex Agent Action 提供既有 Codex 登录状态的认证方式；Compatibility Profile 必须锁定该 Action 的来源与 revision，不能仅因 runner 已登录或 Action 的 API key 输入可选就推断兼容。Agent Action 仍拥有 Codex CLI 版本与调用边界，runner 上偶然存在的 CLI 不构成兼容承诺。
_Avoid_: 预安装 Codex、仓库 API Key、动态 Provider

**Graph Engineering（图工程）**:
定义多个 Goal Run、Verifier、Human Gate 与业务节点之间的拓扑、转移和整体完成判断；CI 或 Review Gate 失败后启动新的 Repair Goal Run 属于这一层。本项目是 Graph Engineering 在 GitHub 软件研发场景中的一种实现。
_Avoid_: Loop Engineering、Harness Engineering、LangGraph 特定实现

**Development Ticket（研发票据）**:
携带指定标签、并至少给出业务目标与 Acceptance Criteria 的 GitHub Issue；Harness 向 `implement` Skill 提供它，Skill 成功结束即表示首个 Development Goal Run 完成。
_Avoid_: Goal Run、Draft PR、完整 CI/Review Graph

**Human Command（人工命令）**:
由对目标仓库拥有 write 或更高权限的人，以任意 open Issue 或 open PR 的新评论首个非空白 token `@codex` 加非空指令的形式发出的明确要求；事件路由用它与目标对象上下文形成 Goal Prompt。
_Avoid_: 普通评论、Graph Gate、系统指令

**Command Run（命令运行）**:
Human Command 启动的独立 Goal Run；每条命令不自动重试，并在正常结束时返回成功、失败或阻塞结果，显式失败重试仍属于原 Task Invocation。
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
`graph-engineering` 为 GitHub 软件研发场景中的一种 Graph Engineering 实现维护的、带来源版本且可整体复制的普通文件集合，包括事件路由、可配置 Event Prompt 和 Compatible Executor；未经真实 Consumer Project 验证时是 Candidate Definition。
_Avoid_: Reusable Workflow、中央 Runtime、通用 DSL

**Candidate Definition（候选工作流定义）**:
已经形成可复制版本、但尚未在真实 Consumer Project 中完整验证其正常完成、失败或交接及重复运行语义的 Workflow Definition；只有留下可复核的真实运行证据后才能晋级为 Stable Definition（稳定工作流定义）。
_Avoid_: 草稿、仅凭静态测试即可发布的稳定版本、Legacy Frozen Definition

**Legacy Frozen Definition（旧版冻结定义）**:
已经发布并验证、仍可由 Consumer Project 复制使用，但退出默认演进路线的 Workflow Definition；其历史交付内容与验证记录保持可追溯，仅接受严重安全问题和事实纠错，不新增能力或承诺适配未来平台变化。
_Avoid_: Candidate Definition、默认推荐路线、已删除或不可使用的版本

**Repository Release（仓库发布版本）**:
表达 `graph-engineering` 仓库整体架构、CLI 与内容快照的版本；它与各 Workflow Definition 独立拥有的版本生命周期不同。
_Avoid_: Workflow Definition Version、所有 Definition 共用的统一版本

**Candidate Publication Gate（候选发布门）**:
判断一个 Candidate Definition 是否已具备可供真实项目试用且不会误导使用者的静态完整性门槛；通过它不表示该 Definition 已在真实 Consumer Project 中验证或已晋级 Stable。
_Avoid_: Stable Promotion Gate、真实运行验收、生产兼容保证

**Stable Promotion Gate（稳定晋级门）**:
依据同一冻结版本在真实 Consumer Project 中形成的 Evidence Bundle，判断 Candidate Definition 是否可以在明确 Supported Profile 内晋级为 Stable Definition。
_Avoid_: Candidate Publication Gate、一次 happy path、未限定范围的通用兼容声明

**Supported Profile（受支持配置）**:
一个 Stable Definition 以真实证据承诺支持的精确运行组合，包括 Workflow Definition、Compatibility Profile、Agent Action revision、runner、权限模式、事件来源及其他影响契约的环境边界；未经验证的组合不自动继承该承诺。
_Avoid_: Consumer 可配置项清单、动态 capability discovery、对所有环境的兼容声明

**Evidence Bundle（证据包）**:
针对同一冻结 Candidate、Action revision、Consumer Workflow Instance 与 Supported Profile 完整执行发布 Case 后形成的版本化证据集合；不同契约版本的历史结果不能拼接成一个通过结论。
_Avoid_: 单个绿色 Workflow Run、Agent 自述、跨版本证据拼接

**Evidence Manifest（证据清单）**:
Evidence Bundle 的仓库内索引，记录冻结输入、Case Result、外部事实链接、已知限制、证据可见性及必要的核验信息，但不复制敏感日志或 Consumer Project 私有内容。
_Avoid_: 原始运行日志、测试实现、无证据链接的人工总结

**Case Result（用例结果）**:
一个发布 Case 的 Expected Outcome、Observed Outcome、Assertions、Gate Decision 与证据链接；预期失败路径在实际行为符合预期时可以判为 `PASS`。
_Avoid_: Workflow conclusion、仅有通过或失败文字的结论、Agent final text

**Workflow Instance（工作流实例）**:
Consumer Project 从某个 Workflow Definition 版本复制并自行拥有的可运行工作流；项目可以自由修改，记录的来源版本只表示最后参考的定义版本，不保证文件仍完全一致。
_Avoid_: 中央托管实例、只读副本、远程调用
