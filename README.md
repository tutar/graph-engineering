# Graph Engineering

Graph Engineering（图工程）以 GitHub 持久事实连接 Workflow Task（工作流任务）、Goal Run（目标运行）、Verifier（验证器）与人工 Gate（门禁）。当前方向是在本仓库直接安装并 dogfood 工作流，不再以 Candidate、Stable、Consumer Validation 或 Evidence Bundle 管理当前工作流成熟度。

> 实现状态：目标设计已经确认，代码迁移尚未开始。当前 `workflow/.github/`、CLI 和根 `.github/` 仍可能体现旧的 `codex-action`、Session recovery 与交付 manifest 实现；不要把设计文档误读为已运行行为。

## 接入

当前开发源是 [`workflow/.github/`](workflow/.github/)，CLI 将整套文件安装到项目根 `.github/`。开发源与本仓库已安装的 dogfooding 副本可以在开发期间暂时不同；开发和测试完成后显式运行 `init`，需要时用 `check` 检查一致性，CI 不强制两者实时相同。

本分支 CLI `0.3.1` 尚未发布；不要用已发布的 `0.3.0` 命令验证新接口。在源码仓库打包后安装本地产物：

```bash
cd packages/cli
npm pack --pack-destination /tmp
# 在目标 Git 仓库根目录执行；本项目 dogfooding 时目标就是本仓库：
npm exec --yes --package=/tmp/tutar-graph-engineering-0.3.1.tgz -- graph-engineering init --dry-run
npm exec --yes --package=/tmp/tutar-graph-engineering-0.3.1.tgz -- graph-engineering init
npm exec --yes --package=/tmp/tutar-graph-engineering-0.3.1.tgz -- graph-engineering check
```

安装写入 `.github/` 与安装来源记录，然后执行只读检查。任何目标文件冲突都会停止，不覆盖已有文件；`check` 可以重复执行，不修改项目。`ACTION REQUIRED` 或 `UNVERIFIED` 表示需要人工配置或当前环境无法确认的条件，文件匹配不代表 runner、认证或真实运行已验证。CLI 不注册 runner、不登录 Codex、不安装 Skill、不提交文件，也不修改 GitHub Settings。

## 退役与迁移

PR Review Task（PR 审查任务）已退出当前源码、测试、打包与安装支持。`init pr-review`、`check pr-review` 明确报告退役；旧 `init development`、`check development` 报告整套接口变化。已有 Consumer PR Review 文件仍属于项目，不会自动卸载、改写或接管。

`graph-engineering migrate` 先展示可识别的旧 Development 安装计划；交互确认后修改，非交互环境需显式 `--apply`。有本地修改、未知来源、目标冲突、既有新安装记录或旧 PR Review 时停止并要求人工处理。迁移只移除确认来源的文件，保留其他项目文件。

Repository Review Task（仓库审查任务）是后续独立范围，尚未实现或交付可运行 workflow；Architecture Improvement（架构改进分析）延期。统一交付不合并任务目标、触发入口或副作用权限。

## 当前设计方向

Coding Task 将改用项目自有 Codex Goal Action：每个 attempt 创建新 Session，以 App Server 原生 Goal 执行 `$implement`；正常完成交付 Draft PR，`blocked` 或 `budgetLimited` 时在同一 workspace 只启动一次固定预算的 Handoff Goal。Workflow 只负责事件、权限、并发、checkout、标签和 Job 结论，不独立核验 Agent 的分支或 PR 交付事实。

完整边界、Prompt、预算、Action 接口、测试门槛与后续 Issue 图见 [Coding Task 直接 dogfooding 设计](docs/design/coding-task-dogfooding.md)。历史 Release 不回写，历史 evidence 已移入 [`docs/archive/evidence/`](docs/archive/evidence/)。

- [领域语言](CONTEXT.md)
- [Coding Task 直接 dogfooding 设计](docs/design/coding-task-dogfooding.md)
- [历史文档归档](docs/archive/README.md)
- [CLI 接口及安装记录](packages/cli/README.md)
- [退役与统一交付决策](docs/adr/0006-retire-pr-review-and-unify-workflow-delivery.md)
- [自有 Codex Goal Action 与 dogfooding 决策](docs/adr/0008-own-the-codex-goal-action-and-dogfood-it.md)
- [Fresh Goal 与单次 Handoff 决策](docs/adr/0009-use-fresh-goals-with-one-handoff.md)
- [Legacy Development Quick Start（归档）](docs/archive/legacy-development-quick-start.md)

项目采用 [MIT License](LICENSE)。
