# Graph Engineering

Graph Engineering（图工程）以 GitHub 持久事实连接 Workflow Task（工作流任务）、Goal Run（目标运行）、Verifier（验证器）与人工 Gate（门禁）。复制后的 Workflow Instance（工作流实例）由 Consumer Project（消费项目）自行拥有，运行时不依赖本仓库在线服务。

## 接入

当前唯一交付源是 [`workflow/.github/`](workflow/.github/)，CLI 一次安装整套文件。当前交付 [Development Task（研发实现任务）与 Coding Task（编码任务）](workflow/README.md)。两者使用不同标签与独立 Workflow 入口；Coding Task 是新的 Candidate Definition（候选工作流定义），Development 的历史 `v0.1.2` 仍只从固定 tag 取得。

本分支 CLI `0.3.1` 尚未发布；不要用已发布的 `0.3.0` 命令验证新接口。在源码仓库打包后安装本地产物：

```bash
cd packages/cli
npm pack --pack-destination /tmp
# 在 Consumer Git 仓库根目录执行：
npm exec --yes --package=/tmp/tutar-graph-engineering-0.3.1.tgz -- graph-engineering init --dry-run
npm exec --yes --package=/tmp/tutar-graph-engineering-0.3.1.tgz -- graph-engineering init
npm exec --yes --package=/tmp/tutar-graph-engineering-0.3.1.tgz -- graph-engineering check
```

安装写入 `.github/` 与安装来源记录，然后执行只读检查。任何目标文件冲突都会停止，不覆盖已有文件；`check` 可以重复执行，不修改项目。`ACTION REQUIRED` 或 `UNVERIFIED` 表示需要人工配置或当前环境无法确认的条件，文件匹配不代表 runner、认证或真实运行已验证。CLI 不注册 runner、不登录 Codex、不安装 Skill、不提交文件，也不修改 GitHub Settings。

## 退役与迁移

PR Review Task（PR 审查任务）已退出当前源码、测试、打包与安装支持。`init pr-review`、`check pr-review` 明确报告退役；旧 `init development`、`check development` 报告整套接口变化。已有 Consumer PR Review 文件仍属于项目，不会自动卸载、改写或接管。

`graph-engineering migrate` 先展示可识别的旧 Development 安装计划；交互确认后修改，非交互环境需显式 `--apply`。有本地修改、未知来源、目标冲突、既有新安装记录或旧 PR Review 时停止并要求人工处理。迁移只移除确认来源的文件，保留其他项目文件。

Repository Review Task（仓库审查任务）是后续独立范围，尚未实现或交付可运行 workflow；Architecture Improvement（架构改进分析）延期。统一交付不合并任务目标、触发入口或副作用权限。

## 交付与证据

已发布 Repository Release `v0.3.0` 与 CLI `0.3.0` 保留原有内容；当前 Workflow 是尚未发布、尚未经过真实 Consumer 验收的 Candidate Definition（候选工作流定义），不承诺新的 Stable Definition（稳定工作流定义）。本地回归、静态交付核验与真实 Consumer 运行是不同证据；Coding Task 必须形成自己的 Consumer Evidence Bundle，不能继承 Development 或 #67 的证据。

历史 `github-development-ticket/v0.1.2` 仍为 Legacy Frozen Definition（旧版冻结定义）。历史 PR Review tag、Release、ADR 与 Evidence（证据）可追溯；`v0.1.1`、`v0.1.2`、`v0.1.4` 的失败事实保留，Bundle 7 仍未冻结、未运行。

- [领域语言](CONTEXT.md)
- [交付与历史追溯契约](docs/definition-delivery.md)
- [CLI 接口及安装记录](packages/cli/README.md)
- [退役与统一交付决策](docs/adr/0006-retire-pr-review-and-unify-workflow-delivery.md)
- [会话恢复归属决策](docs/adr/0007-keep-session-recovery-local-to-agent-action.md)
- [本票验证报告](docs/verification/issue-59.md)
- [恢复版 Action 接入验证报告](docs/verification/issue-66.md)
- [Coding Task 验证报告](docs/verification/issue-70.md)
- [Legacy Development Quick Start](docs/legacy-development-quick-start.md)

项目采用 [MIT License](LICENSE)。
