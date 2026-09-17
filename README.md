# Loop Engineering

当前 PR Review Task：[`workflow-tasks/pr-review`](workflow-tasks/pr-review/README.md)。它是主分支默认安装和持续演进入口，尚未冻结为新的 Candidate，也没有真实 Consumer 通过证据。最近的历史 Candidate `github-pr-review/v0.1.4` 已随 Repository Release `v0.2.4` 发布，Bundle 6 结论为 FAIL。Definition/Release 映射、历史取得方式与 Evidence 隔离规则见[交付契约](docs/definition-delivery.md)。

本仓库维护可整体复制到项目中的版本化 Workflow Definition（工作流定义），并明确区分 Candidate、Stable 与 Legacy Frozen 状态。项目复制后自行拥有 Workflow Instance（工作流实例），可以按项目需要修改，不依赖本仓库在线运行。

## 项目定位

`loop-engineering` 不实现 Loop Runtime（循环运行时）。它提供 Agent Loop Engineering（智能体循环工程）在 GitHub 上的一种使用方式：项目自有的 Workflow 根据 GitHub Event 选择可配置的 Event Prompt（事件提示模板），形成带明确 Completion Condition（结束条件）的 Goal Prompt（目标提示），再通过 Compatible Executor（兼容执行器）接入 Agent Action，由 Agent Runtime 原生的 `/goal` 自主续轮并判断完成或交接。

```text
GitHub Event
    -> Workflow + configurable Event Prompt
    -> Compatible Executor
    -> Agent Action
    -> Agent Runtime native /goal
```

Compatible Executor 是本项目维护的薄适配层，不是新的 Loop Runtime：它只映射 Goal Prompt、必要运行配置和终态结果。第一版新架构将适配 [`openai/codex-action`](https://github.com/openai/codex-action)；后续可以分别适配 [`deepseek-harness-action`](https://github.com/Lixiaoyiao/deepseek-harness-action) 与 [`claude-code-action`](https://github.com/anthropics/claude-code-action)，而不假定三种 Action 的输入、权限和输出完全相同。

具体应用的 Issue、Ticket 或 PR 拥有业务目标与 Acceptance Criteria（验收条件）。Workflow 不把 Acceptance Criteria 固化为通用 Schema，但项目最佳实践要求业务对象提供明确、可验证的验收条件，使 Event Prompt 能引用它们形成有效的 Goal Prompt。

新架构以 Fresh Goal Run（全新目标运行）作为跨 GitHub Workflow Run 的正确性基线：每次运行重新读取 Issue、PR、branch、commit 与 Check 等 GitHub 持久事实，识别已经完成的效果并协调剩余工作，而不是重放上一次运行的步骤。Session、runner 工作区、日志和 artifact 只可用于执行或诊断，Workflow 不维护跨 Run 的 Agent 会话恢复状态。取消、异常退出或人工 rerun 后，也必须能够仅依据 GitHub 当前事实重新运行。

Repository Release `v0.2.4` 发布 `github-pr-review/v0.1.4` Candidate，并保留所有旧 Release/Definition 的历史事实。`v0.1.1`、`v0.1.2` 与 `v0.1.4` 的真实 Consumer 验证均已失败，不能互相拼接为兼容证据。Repository Release 与 Workflow Definition 各自版本化；Repository Release 版本不等于 Definition 版本，也不代表 Candidate 已经真实兼容或晋级 Stable。

## 定义状态

- [`workflow-tasks/pr-review`](workflow-tasks/pr-review/README.md)：当前演进实现；尚未冻结为 Candidate，不继承历史 Evidence。
- [`github-pr-review/v0.1.4`](workflow-definitions/github-pr-review/v0.1.4/README.md)：最近发布的历史 Candidate；Bundle 6 已真实运行并因重复 Check 判为 FAIL，尚无 Stable Supported Profile。
- [`github-pr-review/v0.1.3`](workflow-definitions/github-pr-review/v0.1.3/README.md)：历史 Candidate；修正 Draft 人工路由与只读 Action 输入组合。
- [`github-pr-review/v0.1.2`](workflow-definitions/github-pr-review/v0.1.2/README.md)：历史 Candidate；Consumer 验证发现 Draft 人工路由与只读 Profile 缺陷。
- [`github-pr-review/v0.1.1`](workflow-definitions/github-pr-review/v0.1.1/README.md)：已发布的历史 Candidate；Consumer 验证已证明其冻结 Action revision 无法使用 runner 登录路径。
- [`github-development-ticket/v0.1.x`](workflow-definitions/github-development-ticket/v0.1.2/README.md)：Legacy Frozen；此前已验证且继续可用，只接受严重安全修复和事实纠正。

两条 Definition 是可并存的独立产品，不是原地升级。采用 PR Review 不要求迁移旧版 Thread Record、标签、Controller 状态或 Workflow Instance，也没有自动迁移承诺。

## Legacy 已验证效果

当前已经完成首个 Reference Application（参考应用）：`github-development-ticket` v0.1.2。它把一个带指定标签的 GitHub Development Ticket（研发票据）转换为 Codex `/goal`，由持久化 self-hosted runner 中的 Codex 使用 Matt `$implement` Skill 持续完成：

- 读取 Issue 中的目标与 Acceptance Criteria（验收条件）；
- 实现、自测和两轴代码审查；
- commit、push 并创建 Draft PR；
- 根据实际验证证据勾选已经满足的验收条件；
- 在额度中断、Workflow 取消或临时失败后，重新运行同一 Issue 并恢复原 Codex Thread、Goal 和未提交工作；
- 成功交付后检查分支与 Draft PR，并移除 `development-ticket` 和 `in-progress` 标签。

该闭环已在 [`tutar/agent-infra`](https://github.com/tutar/agent-infra) 的真实 Development Ticket 上验证。当前范围刻意保持较窄：只交付到 Draft PR，不自动 approve、merge、deploy，也不编排多个业务节点。

## Current Task Quick Start（默认方向）

将 [`workflow-tasks/pr-review/files/.github/`](workflow-tasks/pr-review/files/.github/) 整体复制到 Consumer Project 的 `.github/`，安装项目自己的 `code-review` Skill，并提供带 `[self-hosted, Linux, X64, codex]` labels 与既有 Codex 登录状态的专用 runner，再按[当前任务文档](workflow-tasks/pr-review/README.md)编辑唯一允许的 `pr-review-config.json`。该任务不使用仓库 `OPENAI_API_KEY`，锁定维护版 `tutar/codex-action` 的不可变修补 SHA，只做只读 PR Review，并由独立可信 publish job创建或更新 Check Run。

当前实现尚未冻结为新的 Candidate；不应把本仓库的静态测试、Fake Action、Agent final text 或历史 Evidence 当成真实 Consumer 兼容证据。静态发布门见 [`CANDIDATE-GATE.md`](workflow-tasks/pr-review/CANDIDATE-GATE.md)，历史 Release 的安装方式见[交付契约](docs/definition-delivery.md)。

## Legacy Quick Start（已验证旧版）

### 1. 准备项目

目标仓库需要：

- GitHub Actions；
- 一台持久化 self-hosted runner，能够运行 Codex、GitHub CLI（`gh`）和 Node.js 22+；
- 已登录且可使用 `/goal` 的 Codex；
- GitHub Actions 对 `contents`、`issues` 和 `pull-requests` 的写权限，并允许 Actions 创建 Pull Request。

在目标仓库的 **Settings → Actions → Runners** 中按 GitHub 给出的命令添加 runner；也可参考 [GitHub self-hosted runners 文档](https://docs.github.com/en/actions/hosting-your-own-runners)。当前已验证的运行形态是：持久化 self-hosted runner、Codex、Codex `/goal`、`gh` 和 Node.js 22+。GitHub-hosted runner、ephemeral runner、多个不共享 Codex Thread 存储的 runner、Claude Managed Agents 及其他 Agent Runtime 尚未验证；“尚未验证”不表示一定不支持，但本版本不承诺其中断恢复和稳定性。

### 2. 安装 Matt Skills

在目标项目根目录执行：

```bash
npx skills add https://github.com/mattpocock/skills
```

本 Workflow 直接使用 `$implement`。`$implement` 会在适用时使用 `$tdd` 完成测试驱动实现，并在结束前使用 `$code-review` 做 Standards（规范）与 Spec（需求）两轴审查。因此需要确保安装结果至少包含：

- `implement`
- `tdd`
- `code-review`

用户只需触发 Development Ticket Workflow，不需要分别调用这三个 Skill。

### 3. 复制 Workflow Definition

将 [`workflow-definitions/github-development-ticket/v0.1.2/files/.github/`](workflow-definitions/github-development-ticket/v0.1.2/files/.github/) 的内容复制到目标仓库的 `.github/`：

```text
.github/
├── loop-engineering/
│   ├── github-development-ticket.mjs
│   ├── stop-hook-drain.mjs
│   └── thread-record.mjs
└── workflows/
    └── github-development-ticket.yml
```

这些文件复制后就是目标项目拥有的 Workflow Instance；可以直接修改。版本号只记录它最初参考的定义版本，不会让项目依赖本仓库在线运行。

### 4. 完成项目配置

1. 创建 `ready-for-agent`、`development-ticket` 和 `in-progress` 三个标签。
2. 按项目实际情况修改 Workflow 的 runner labels、默认分支、Git identity、超时和 token budget。
3. 在 Goal 启动前安装项目依赖；如测试需要访问额外可执行文件、缓存目录或域名，把它们加入 Controller 的最小 sandbox 权限配置。
4. 检查仓库 Actions 设置已允许创建 Pull Request。

### 5. 触发第一个 Ticket

1. 创建一个 open Issue，在正文中写清业务目标和可勾选的 Acceptance Criteria。
2. 添加 `ready-for-agent`，表示内容已经可以交给 Agent。
3. 确认它是 Development Ticket 而不是 Spec 后，添加 `development-ticket`。

新增 `development-ticket` 会自动触发 Workflow。也可以在 Actions 页面手动运行 `github-development-ticket` 并输入 Issue number。第一次运行会创建 Codex Thread；后续对同一 Issue 的手动运行会恢复该 Thread，而其他 Issue 会创建自己的新 Thread。

更完整的配置、停止与恢复语义见 [`github-development-ticket` v0.1.2 文档](workflow-definitions/github-development-ticket/v0.1.2/README.md)。

## Optional Observability（可选可观测能力）

如需将 Codex Turn、模型调用、工具调用、Token 使用和子 Agent 记录到 Langfuse，可使用 [`tutar/codex-observability-plugin`](https://github.com/tutar/codex-observability-plugin)。该仓库基于 Langfuse 官方插件维护，包含本项目在 self-hosted runner 与 Codex Stop hook 场景中遇到并验证过的修复；由于相关修复尚未及时进入官方版本，目前由该分支持续维护。

该插件完全可选，不参与 Development Ticket Goal 的完成判断；未安装或 Trace 上传失败不应改变交付结果。启用前请注意：

- Trace 会上传 prompt、assistant 输出、reasoning summary、工具输入输出和 Token 使用情况，应先评估代码与数据边界；
- Runner 和 Stop hook 必须能够访问所配置的 Langfuse 地址；
- 安装、Hook 信任、凭据与故障排查步骤以插件仓库 README 为准。

## 已发布定义

- [`github-pr-review` v0.1.4 Candidate — Consumer validation failed](workflow-definitions/github-pr-review/v0.1.4/README.md)：Repository Release `v0.2.4` 发布的最近历史 Candidate；Bundle 6 因重复同身份 Check 判为 FAIL。
- [`github-pr-review` v0.1.3 Candidate](workflow-definitions/github-pr-review/v0.1.3/README.md)：Repository Release `v0.2.3` 发布的历史 Candidate；没有 Stable Supported Profile。
- [`github-pr-review` v0.1.2 Candidate — Consumer validation failed](workflow-definitions/github-pr-review/v0.1.2/README.md)：Repository Release `v0.2.2` 发布的历史 Candidate。
- [`github-pr-review` v0.1.1 Candidate — Consumer validation failed](workflow-definitions/github-pr-review/v0.1.1/README.md)：Repository Release `v0.2.1` 发布的历史 Candidate；冻结组合的 runner-login 兼容性已被真实证据否定。
- [`github-pr-review` v0.1.0 Candidate](workflow-definitions/github-pr-review/v0.1.0/README.md)：Repository Release `v0.2.0` 引入的 API-key 版本，保留为历史 Candidate。
- [`github-development-ticket` v0.1.2 — Legacy Frozen](workflow-definitions/github-development-ticket/v0.1.2/README.md)：增加中断工作恢复、可调累计预算、Stop hook 收尾、取消处理和交付标签清理。
- [`github-development-ticket` v0.1.1 — Legacy Frozen](workflow-definitions/github-development-ticket/v0.1.1/README.md)：增加基于证据的验收条件同步。
- [`github-development-ticket` v0.1.0 — Legacy Frozen](workflow-definitions/github-development-ticket/v0.1.0/README.md)：首个已验证版本。

Workflow Definition 是普通文件模板，不是 Reusable Workflow，也不是中央 Runtime。Definition 版本只表示实例最后参考的定义版本；当前仓库发布说明见 [`v0.2.4`](docs/releases/v0.2.4.md)，历史版本见 [`v0.2.3`](docs/releases/v0.2.3.md)、[`v0.2.2`](docs/releases/v0.2.2.md)、[`v0.2.1`](docs/releases/v0.2.1.md) 与 [`v0.2.0`](docs/releases/v0.2.0.md)。
