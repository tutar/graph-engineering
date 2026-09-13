# github-pr-review v0.1.0 Candidate

这是 Workflow-first 路线的 Candidate Definition（候选工作流定义）。把 `files/.github/` 整体复制到 Consumer Project（消费项目）后，项目自行拥有其 Workflow Instance（工作流实例）；运行时不依赖 `loop-engineering` 仓库。

当前版本支持非 Draft PR 的 `opened`、`reopened`、`synchronize`、`ready_for_review` 与人工 dispatch；Draft 创建和更新保持静默，转为 ready 后启动。它尚未通过 Candidate Publication Gate，也没有 Supported Profile（受支持配置）。完整失败路径与真实 Consumer 验证由后续 tickets 补齐。

## 安装与运行

1. 将 `files/.github/` 复制到 Consumer Project 根目录的 `.github/`。
2. 安装仓库的 `code-review` Skill，并保留仓库自身的规范文档。
3. 在 Actions secrets 中配置 `OPENAI_API_KEY`。
4. 从 Actions 页面运行 `Loop Engineering PR Review`，输入真实 PR number，可选修改 Event Prompt。

## Consumer 配置边界

Consumer 只编辑 `pr-review-config.json`。允许的键和边界如下：

- `events.pullRequestActions`：从 `opened`、`reopened`、`synchronize`、`ready_for_review` 中选择无重复子集；`manualDispatch` 可开关；`includeDrafts` 在本 Candidate 中必须保持 `false`。
- `eventPrompt`：自动事件使用的非空 Goal 前言；人工 dispatch 可为单次运行覆盖它。
- `runner`：`ubuntu-24.04` 或 `ubuntu-22.04`。这些是 Candidate 可配置值，不是已经真实验证的 Stable Supported Profile。
- `codex.model`：空值表示 Action 默认值，也可填写只含字母、数字、点、下划线和连字符的明确 model；`codex.effort` 可为默认空值、`low`、`medium`、`high`、`xhigh`。
- `codex.permissionProfile` 与 `codex.safetyStrategy` 属于公开但受限的 sandbox 配置面；本只读 Candidate 分别只允许 `:read-only` 与 `read-only`，不能降级。
- `check.name` 与 `check.title`：非空且不超过 100 字符的发布显示设置。

配置文件不提供 Action source/revision、输入输出 mapping、Profile implementation、Provider 或 capability 开关。缺字段、未知字段、未允许值、Profile 身份不符或静态 Profile 任一契约被修改时，router 输出 `configuration-handoff`、不启动 review，也不自动换 Action/Provider 或降低安全限制。修改 Action SHA、mapping、Executor 或 Profile 后，该副本已退出 `github-pr-review/v0.1.0` Candidate 声明；官方升级必须发布新的 Definition 版本并重新验证。

Workflow 先把默认分支上的控制脚本 checkout 到独立的 `.loop-engineering-trusted` 目录且不持久化 Git 凭据，用只读 GitHub token 读取 PR 的 repository、number、base SHA、head SHA、title 与 body；随后把固定的 head SHA checkout 到独立 `review-workspace`。Event Prompt 与这些可信事实形成 Goal Prompt，并要求 Agent 在该待审目录调用 Consumer Project 的 `code-review` Skill。prepare、schema 与 capture 始终来自可信目录，PR 内容不能替换执行器映射。Codex review job 只有 `contents: read`、`pull-requests: read` 与读取现有 Checks 所需的权限；它只产出符合 JSON Schema 的候选 review output。

独立 `publish` job 才拥有 `checks: write`。Workflow 只允许从默认分支启动，并让该 job 明确 checkout 默认分支上的可信 publisher；publisher 先验证上游 job 成功，再重新读取当前 PR head、核对候选结果中的目标身份与两轴结构，然后创建绑定 reviewed head SHA 的 Check Run。Agent 文本本身不是可信发布结果的证据，额外的“已发布”或“已通过”字段会被拒绝。

Action step 的真实 outcome 与结构化输出共同映射为 `completed`、`handoff`、`failed` 或 `cancelled`。只有 `completed` 且结果完整、目标匹配时才会进入发布；Action 失败/取消、明确 handoff、空或畸形 JSON、缺少任一 review 轴、未知字段和 SHA/目标错配都会 fail closed。失败诊断写入 job summary 与 `review-diagnostic.md`，不会创建成功 Check，也不会启动外层 retry loop。review job 的 token 只有 contents、PR 和既有 Checks 的读取权限，同时 Codex 使用 `:read-only` permission profile 与无网络的 `read-only` safety strategy，因此评论、改标签、push 或发布 Check 的尝试均不具备可用能力；可信 publish job 也没有 Issues、PR 或 contents 写权限。

Check 的稳定身份是 `github-pr-review/v0.1.0 + repository + PR number + reviewed head SHA`，记录在 Check Run 的 `external_id`。publisher 只在当前 head 上查找名称、head SHA 和 `external_id` 均匹配的既有 Check：同 SHA rerun 更新原 Check，新 SHA 创建独立 Check，旧 SHA Check 仍保留在旧 commit 上。若发布前 PR head 已改变，publisher 以 `stale-target` 诊断失败且不写入旧结果；此判断只依赖可信 GitHub facts 和固定身份，不依赖 Agent 文本、本地跨 Run 状态或 Session。

每次 GitHub Workflow Run 都重新路由 Event，并从 GitHub API 读取当前 PR、base/head branch、commit 与 Check facts，形成独立 Fresh Goal Run（全新目标运行）。Definition 不保存 Resume Record、Session ID、Goal ID 或旧 transcript。根级 concurrency group 由 repository + PR number 构成，`cancel-in-progress: false` 让同一 PR 的完整 GitHub Workflow Runs 串行排队，不同 PR 使用不同 group。

## Compatibility Profile

`codex-compatible-executor.mjs` 与 `codex-compatibility-profile.json` 随本 Definition 一起版本化且不可独立选择。Profile 锁定 `openai/codex-action` 来源 tag `v1` 对应的 commit `86365089eb2b84e0a8fb0717b304f8bdcb13b20e`，声明必需输入、Goal/schema/runtime 映射、review/publish 权限、唯一可观察输出 `final-message`、终态与 fail-closed 规则。Executor 在每次路由与发布前验证整个静态 Profile。本切片没有 Resume Record、Session ID、Goal ID、动态 Provider、Agent-write 或 v0.1.x Controller。

## 本地验证

```bash
node --test workflow-definitions/github-pr-review/v0.1.0/test/*.test.mjs
```

行为测试在本地假 GitHub API 上执行生产 `prepare`、`capture` 与 `publish` adapters，并在两者之间放入可控 Agent Action 替身和 artifact 边界，观察 Goal 是否形成以及可信 Check 是否发布。模板测试只覆盖该行为 seam 无法观察的 Action pin、文件完整性和 job 权限声明。
