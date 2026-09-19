# 私有跨仓库 Loop Engineering 复用机制调研

> 归档：此调研服务于已放弃的跨 Consumer Workflow 交付方向，不描述当前直接 dogfooding 设计。

> **后续决策状态（2026-09-02）**：本文关于 GitHub 跨私有仓库 Reusable Workflow 的官方能力与约束仍作为机制证据保留，但项目没有采用本文的首版推荐。经 [确定版本化 Workflow Definition 的部署与演进方式](https://github.com/tutar/loop-engineering/issues/7) 与 [以 Codex Goal Runtime 收缩 Loop Engineering 边界](https://github.com/tutar/loop-engineering/issues/8) 决定：中央只维护带版本、可复制的 Workflow Definition；Consumer Project 自行拥有并修改 Workflow Instance，运行时不远程调用中央 Workflow。Definition 内容进一步收缩为事件路由、Skill 与业务对象引用、Codex Goal Runtime 调用及必要硬停止边界。

## 问题与研究时结论（后续未采用）

问题是：一个私有中央 `loop-engineering` 仓库，如何以最简单的 GitHub 原生方式向多个私有项目提供可复用事件工作流，并继续使用各项目可访问的 Self-hosted Runner（自托管运行器）？本文不设计中央 Runtime（运行时）。

首版最小方案是 Reusable Workflow（可复用工作流）加每个项目一个薄 Caller Workflow（调用方工作流）：

1. 中央仓库维护声明 `on: workflow_call` 的完整 Job（作业）流程；
2. 消费项目的薄工作流声明本项目事件、最小 `permissions`、输入、Secret（密钥）和中央版本；
3. 中央工作流使用消费项目有权访问的 Self-hosted Runner；
4. 消费项目先把中央工作流固定到完整 Commit SHA（提交哈希），升级时显式更新该 SHA。

这不需要常驻服务或中央 Webhook。GitHub 负责私有工作流下载、事件启动、排队、日志和取消。Custom Action（自定义 Action）适合以后封装稳定的重复步骤；Workflow Template（工作流模板）适合生成薄调用文件；GitHub App（GitHub 应用）加 Webhook 会引入服务部署、安装、权限和令牌生命周期，当前不是最简单方案。

## GitHub 已确认的约束

### 跨私有仓库访问

GitHub 支持把私有仓库中的 Action 和 Reusable Workflow 分享给同一用户拥有的其他私有仓库，或同一组织内的其他私有仓库。中央仓库必须在 `Settings > Actions > General > Access` 显式允许相应范围；公共仓库不能调用私有仓库中的工作流。[管理仓库的 GitHub Actions 设置](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository) [共享私有仓库中的 Action 和工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/share-across-private-repositories)

Runner 下载私有中央仓库内容时，GitHub 会发放只有该仓库读取权限、约一小时后过期的 Scoped Installation Token（限域安装令牌），仅为下载中央工作流无需在消费项目另配 PAT（个人访问令牌）。但消费仓库的外部协作者可能通过运行日志间接接触中央仓库内容，中央流程不得把敏感实现或 Secret 输出到日志。[在组织中共享 Action 和工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/share-with-your-organization)

### 事件入口留在消费仓库

Reusable Workflow 必须位于中央仓库 `.github/workflows/` 并声明 `workflow_call`。消费仓库在 Job 层调用：

```yaml
jobs:
  loop:
    uses: tutar/loop-engineering/.github/workflows/ticket.yml@<full-commit-sha>
```

消费仓库仍需声明 `issues`、`issue_comment`、`pull_request_review` 或 CI 后继等真实触发事件；中央工作流接收声明过的输入和 Secret。[复用工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) 这形成必要边界：项目决定“什么事件可以启动”，中央仓库维护“启动后如何运行 Loop”。

### 版本与持续更新

跨仓库调用可引用 Commit SHA、Release Tag（发布标签）或 Branch（分支）；GitHub 明确称完整 SHA 是稳定性和安全性最好的选择。[复用工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)

因此首版应固定 SHA。中央发布新版本不会静默改变项目；升级是在项目中修改一行引用并经 PR 审查。若以后真实需要统一滚动升级，再单独决定是否改用受保护的版本 Tag。

### 权限与 Secret

调用 Job 可以声明 `permissions`；中央工作流获得的 `GITHUB_TOKEN` 和 `github` Context（上下文）属于消费仓库。被调用工作流只能保持或降低调用方权限，不能自行提权；嵌套调用也只能逐级收紧。[复用工作流配置参考](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)

Secret 必须由调用方显式传入，或在同一组织/企业内使用 `secrets: inherit`。首版宜显式列出所需 Secret。Workflow 级 `env` 不会自动跨调用边界传播；稳定配置应使用输入、Repository/Organization Variable（仓库/组织变量）或输出。[复用工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) [复用工作流配置参考](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)

### Self-hosted Runner

当调用方与中央工作流归同一用户或组织时，被调用工作流可使用调用方上下文中可访问的 Self-hosted Runner，包括消费仓库 Runner，或已授权给该项目的组织 Runner；中央仓库不能借此授予消费项目本无权使用的 Runner。[复用工作流配置参考](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)

`runs-on` 可使用 Runner Group（运行器组）和标签；多个标签累计匹配，Runner 必须全部满足。[在工作流中使用 Self-hosted Runner](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow) 可先统一一个通用标签，或以后把允许的 Label/Group 做成受控输入；不得把评论文本直接拼入 `runs-on`。

### 取消与并发

Reusable Workflow 不产生脱离调用方的中央任务系统，运行记录与 Context 都属于消费仓库。因此手动取消、超时及 API 取消仍作用于消费仓库 Workflow Run。GitHub 还提供 Force Cancel（强制取消）API，但只应在普通取消无响应时使用，并要求目标仓库 `Actions: write`。[Workflow Runs REST API](https://docs.github.com/en/rest/actions/workflow-runs)

调用 Job 支持 `concurrency`。GitHub 警告：若调用方与被调用方使用相同 Concurrency Group（并发组）并启用 `cancel-in-progress`，被调用工作流可能取消自己的调用方，因为其 `${{ github.workflow }}` 是调用工作流名称。[复用工作流配置参考](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations) 首版应只由薄 Caller Workflow 拥有同目标并发规则，中央工作流不再声明同名取消组，无需中央锁或数据库。

## 四种机制比较

| 机制 | 复用与更新 | 权限、Runner 与边界 | 研究时首版判断 |
|---|---|---|---|
| Reusable Workflow | 跨同一用户/组织私有仓库；可固定 SHA，项目改一行升级 | 使用消费仓库 Context；权限只能收紧；Secret 由调用方传入；可用调用方可访问的 Runner | **首选**，可复用完整 Job/多 Job 流程 |
| Custom Action | 与工作流使用相同私有组件访问和版本引用 | 作为一个 Step 运行；外层仍定义事件、Job、`runs-on`、权限和并发 | 以后抽取稳定重复步骤，不能单独替代完整编排 |
| Workflow Template / 复制 | 配置时把 YAML 提交进项目；此后是独立副本 | 每个副本自行维护权限、Secret、Runner | 仅作首次安装脚手架，适合生成薄调用文件 |
| GitHub App + Webhook | 安装到选定仓库，服务端可集中升级 | 需要 App 权限、安装、Webhook Secret、公网接收服务和短期令牌 | 当前过重；需 Actions 之外的中央入口时再评估 |

Custom Action 把多个 Step 组合成一个 Step，而 Reusable Workflow 能复用完整 Workflow。[创建 Composite Action](https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action) Workflow Template 会把文件提交进目标仓库，所以“中央变化不会自动同步”是其复制语义的直接推论。[创建组织 Workflow Template](https://docs.github.com/en/actions/how-tos/reuse-automations/create-workflow-templates) [使用 Workflow Template](https://docs.github.com/en/actions/how-tos/write-workflows/use-workflow-templates)

GitHub App 权限决定可订阅事件和调用 API 的范围；Webhook 需要接收 URL 和 Webhook Secret。Installation Token 不能超出 App 安装仓库及权限，约一小时过期。[使用 GitHub App Webhook](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/using-webhooks-with-github-apps) [选择 GitHub App 权限](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) [生成 Installation Access Token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)

## 若采用 Reusable Workflow 的最小切片（后续未采用）

在 `projects/agent-infra/infra` 首次验证时只需：

1. 在 `loop-engineering` 开启允许同一用户私有仓库调用 Actions/Reusable Workflows 的 Access；
2. 中央仓库增加一个带 `workflow_call` 的版本化工作流；
3. `agent-infra/infra` 增加一个薄 Caller Workflow，声明一个真实事件、最小权限、目标 Runner 和固定 SHA；
4. 在消费仓库观察完整触发、Runner 分配、Codex 返回、取消和日志证据；
5. 第二个项目只复制薄调用层并更换项目输入，验证复用是否真实成立。

首个切片不需要 Custom Action、模板仓库、GitHub App、Webhook 服务、中央队列或中央状态库。若第二个项目仍出现较多稳定重复，再把“生成薄调用文件”做成 Template；若中央流程内部出现跨工作流稳定步骤，再提取 Custom Action。

## 仍需方案决策的事项

- 中央工作流首个公开 Contract（契约）的输入、输出和 Secret；
- Runner 统一固定标签还是受控项目输入；
- SHA 发布与消费项目升级的命名、审核方式；
- 第一条端到端事件，以及同一 Issue/PR 的 Concurrency Group 构造。
