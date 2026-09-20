# Graph Engineering

Graph Engineering（图工程）以 GitHub 持久事实连接 Workflow Task（工作流任务）、Goal Run（目标运行）与人工 Gate（门禁）。CLI 将项目自有的 Workflow、Action 和配置一次安装到 Git 仓库，由项目直接拥有和演进。

## Quick Start

需要 Node.js 20+、Git 仓库和可运行 Codex 的 self-hosted GitHub Actions runner。在目标仓库根目录先预览，再安装并检查固定版本：

```bash
npx --yes @tutar/graph-engineering@0.3.1 init --dry-run
npx --yes @tutar/graph-engineering@0.3.1 init
npx --yes @tutar/graph-engineering@0.3.1 check
```

`init` 写入 `.github/` 与安装来源记录；任何目标冲突都会停止，不覆盖已有文件。`check` 是可重复执行的只读检查；`ACTION REQUIRED` 或 `UNVERIFIED` 表示仍需人工配置或当前环境无法确认。CLI 不注册 runner、不登录 Codex、不安装 Skill、不提交文件，也不修改 GitHub Settings。

## 当前设计方向

Coding Task（编码任务）使用项目自有的 Codex Goal Action：每个 attempt 创建新 Session，以 App Server 原生 Goal 执行 `$implement`；正常完成交付 Draft PR，`blocked` 或 `budgetLimited` 时在同一 workspace 最多启动一次固定预算的 Handoff Goal。Workflow 负责事件、权限、并发、checkout、标签和 Job 结论，不独立核验 Agent 的分支或 PR 交付事实。

当前交付不再以 Candidate、Stable、Consumer Validation 或 Evidence Bundle 管理 Workflow 成熟度。完整边界、Prompt、预算、Action 接口和测试门槛见 [Coding Task 设计](docs/design/coding-task-dogfooding.md)。历史 Release 不回写，历史 evidence 保存在 [`docs/archive/evidence/`](docs/archive/evidence/)。

## 退役与迁移

PR Review Task（PR 审查任务）已退出当前源码、测试、打包与安装支持。`init pr-review`、`check pr-review` 明确报告退役；旧 `init development`、`check development` 报告整套接口变化。已有 Consumer PR Review 文件仍属于项目，不会自动卸载、改写或接管。

`graph-engineering migrate` 先展示可识别的旧 Development 安装计划；交互确认后修改，非交互环境需显式 `--apply`。有本地修改、未知来源、目标冲突、既有新安装记录或旧 PR Review 时停止并要求人工处理。迁移只移除确认来源的文件，保留其他项目文件。

Repository Review Task（仓库审查任务）是后续独立范围，尚未实现或交付可运行 workflow；Architecture Improvement（架构改进分析）延期。统一交付不合并任务目标、触发入口或副作用权限。

- [领域语言](CONTEXT.md)
- [Coding Task 设计](docs/design/coding-task-dogfooding.md)
- [历史文档归档](docs/archive/README.md)
- [CLI 接口及安装记录](packages/cli/README.md)
- [退役与统一交付决策](docs/adr/0006-retire-pr-review-and-unify-workflow-delivery.md)
- [自有 Codex Goal Action 与 dogfooding 决策](docs/adr/0008-own-the-codex-goal-action-and-dogfood-it.md)
- [Fresh Goal 与单次 Handoff 决策](docs/adr/0009-use-fresh-goals-with-one-handoff.md)
- [Legacy Development Quick Start（归档）](docs/archive/legacy-development-quick-start.md)

项目采用 [MIT License](LICENSE)。
