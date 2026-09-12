# github-pr-review v0.1.0 Candidate

这是 Workflow-first 路线的 Candidate Definition（候选工作流定义）。把 `files/.github/` 整体复制到 Consumer Project（消费项目）后，项目自行拥有其 Workflow Instance（工作流实例）；运行时不依赖 `loop-engineering` 仓库。

当前版本支持非 Draft PR 的 `opened`、`reopened`、`synchronize`、`ready_for_review` 与人工 dispatch；Draft 创建和更新保持静默，转为 ready 后启动。它尚未通过 Candidate Publication Gate，也没有 Supported Profile（受支持配置）。完整失败路径与真实 Consumer 验证由后续 tickets 补齐。

## 安装与运行

1. 将 `files/.github/` 复制到 Consumer Project 根目录的 `.github/`。
2. 安装仓库的 `code-review` Skill，并保留仓库自身的规范文档。
3. 在 Actions secrets 中配置 `OPENAI_API_KEY`。
4. 从 Actions 页面运行 `Loop Engineering PR Review`，输入真实 PR number，可选修改 Event Prompt。

Workflow 先用只读 GitHub token 读取 PR 的 repository、number、base SHA、head SHA、title 与 body，再 checkout 已固定的 base/head。Event Prompt 与这些可信事实形成 Goal Prompt，并要求 Agent 调用 Consumer Project 的 `code-review` Skill。Codex review job 只有 `contents: read` 与 `pull-requests: read`；它只产出符合 JSON Schema 的候选 review output。

独立 `publish` job 才拥有 `checks: write`。Workflow 只允许从默认分支启动，并让该 job 明确 checkout 默认分支上的可信 publisher；publisher 重新读取当前 PR head、核对候选结果中的目标身份与两轴结构，然后创建绑定 reviewed head SHA 的 Check Run。Agent 文本本身不是可信发布结果的证据。

Check 的稳定身份是 `github-pr-review/v0.1.0 + repository + PR number + reviewed head SHA`，记录在 Check Run 的 `external_id`。publisher 只在当前 head 上查找名称、head SHA 和 `external_id` 均匹配的既有 Check：同 SHA rerun 更新原 Check，新 SHA 创建独立 Check，旧 SHA Check 仍保留在旧 commit 上。若发布前 PR head 已改变，publisher 以 `stale-target` 诊断失败且不写入旧结果；此判断只依赖可信 GitHub facts 和固定身份，不依赖 Agent 文本、本地跨 Run 状态或 Session。

每次 GitHub Workflow Run 都重新路由 Event，并从 GitHub API 读取当前 PR、base/head branch、commit 与 Check facts，形成独立 Fresh Goal Run（全新目标运行）。Definition 不保存 Resume Record、Session ID、Goal ID 或旧 transcript。根级 concurrency group 由 repository + PR number 构成，`cancel-in-progress: false` 让同一 PR 的完整 GitHub Workflow Runs 串行排队，不同 PR 使用不同 group。

## Compatibility Profile

`codex-compatibility-profile.json` 与本 Definition 一起版本化，锁定 `openai/codex-action` 来源 tag `v1` 对应的 commit `86365089eb2b84e0a8fb0717b304f8bdcb13b20e`。本切片只映射 Action 已公开的 prompt/output/schema/permission inputs 与 `final-message` 输出；没有 Resume Record、Session ID、Goal ID、动态 Provider、Agent-write 或 v0.1.x Controller。

## 本地验证

```bash
node --test workflow-definitions/github-pr-review/v0.1.0/test/*.test.mjs
```

行为测试在本地假 GitHub API 上执行生产 `prepare`、`capture` 与 `publish` adapters，并在两者之间放入可控 Agent Action 替身和 artifact 边界，观察 Goal 是否形成以及可信 Check 是否发布。模板测试只覆盖该行为 seam 无法观察的 Action pin、文件完整性和 job 权限声明。
