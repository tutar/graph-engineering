# Graph Engineering

Graph Engineering 是图工程在 GitHub 软件研发场景中的一种实现：项目以 GitHub 持久事实连接 Workflow Task（工作流任务）、Goal Run（目标运行）、Verifier（验证器）与人工 Gate（门禁），并把每个 Workflow Instance（工作流实例）交给 Consumer Project（消费项目）自行拥有。

## Quick Start

在目标项目的 Git 仓库根目录安装 PR Review Task（PR 审查任务）：

```bash
npx --yes @tutar/graph-engineering@0.3.0 init pr-review
```

命令复制项目自有的 Workflow 文件、记录精确安装来源并运行只读检查。它不会自动注册 runner、登录 Codex、安装 Skill、提交文件或修改 GitHub Settings；结尾的 `ACTION REQUIRED` 会列出仍需完成或当前环境无法确认的条件。

随时重新检查：

```bash
npx --yes @tutar/graph-engineering@0.3.0 check pr-review
```

## Workflow Tasks

- [PR Review Task](workflow-tasks/pr-review/README.md)：对非 Draft PR 分别执行 Standards（规范）与 Spec（规格）审查，以只读 Agent job 形成结果，再由可信 publish job 写入绑定目标 commit 的 Check Run。安装命令为 `init pr-review`。
- [Development Task](workflow-tasks/development/README.md)：根据 Development Ticket（研发票据）实现、验证并交付 Draft PR。它需要可写权限和持久化 self-hosted runner，安装命令为 `init development`。

两种任务拥有独立的目标、权限和运行语义；CLI 要求显式选择，不会一次安装多个 Task。现有旧版实例使用以下命令先查看迁移计划：

```bash
npx --yes @tutar/graph-engineering@0.3.0 migrate
```

## 工作方式与边界

```text
GitHub 持久事实
    -> Workflow Task + Event Prompt
    -> Compatible Executor
    -> Agent Action
    -> Agent Runtime 原生 Goal Run
    -> Verifier / Human Gate / 后续节点
```

Graph Engineering 负责软件研发 Graph 中节点的目标、转移、权限和完成判断。Compatible Executor（兼容执行器）只把 Goal Prompt（目标提示）与运行配置映射到固定 Agent Action，并把终态映射回 Workflow；本项目不实现 Loop Runtime（循环运行时），也不把 Agent 自述当作验收证据。

Workflow Definition（工作流定义）在安装后是 Consumer Project 拥有的普通文件，不依赖本仓库在线运行。具体 Issue、PR 或 Ticket 继续拥有业务目标与 Acceptance Criteria（验收条件）。

## 当前交付状态

Repository Release `v0.3.0` 与 `@tutar/graph-engineering@0.3.0` 共同交付产品迁名、当前协议和安装 CLI。Repository Release、CLI 与 Workflow Definition 各有明确身份；发布当前 Task 不表示它已经成为 Stable Definition（稳定工作流定义）。

PR Review Task 当前仍未获得新的真实 Consumer Evidence Bundle，不能从本地测试、历史 Evidence 或重新打包推导出 Stable 支持结论。历史 `github-pr-review/v0.1.1`、`v0.1.2` 与 `v0.1.4` 的真实验证失败继续保留。`github-development-ticket/v0.1.2` 仍是 Legacy Frozen Definition（旧版冻结定义）。

## 文档

- [领域语言](CONTEXT.md)
- [Workflow Definition 交付、历史版本与证据契约](docs/definition-delivery.md)
- [Legacy Development Quick Start](docs/legacy-development-quick-start.md)
- [迁名决策 ADR](docs/adr/0005-rename-product-and-protocol-to-graph-engineering.md)
- [PR Review Candidate 发布门](workflow-tasks/pr-review/CANDIDATE-GATE.md)

项目采用 [MIT License](LICENSE)。
