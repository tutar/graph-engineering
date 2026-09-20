# @tutar/graph-engineering

一次安装项目自有的 Graph Engineering（图工程）GitHub 工作流集合。完整 Quick Start、运行前提与支持边界见 [Graph Engineering](https://github.com/tutar/graph-engineering#quick-start)。

```bash
npx --yes @tutar/graph-engineering@0.3.1 init [--dry-run] [--project /path/to/consumer]
npx --yes @tutar/graph-engineering@0.3.1 check [--json] [--project /path/to/consumer]
npx --yes @tutar/graph-engineering@0.3.1 migrate [--apply] [--project /path/to/consumer]
```

`init` 将 `workflow/.github/` 开发源的打包资产整体复制到目标 Git 仓库的 `.github/`。当前集合包含独立的 Coding 与 Development Workflow；没有 PR Review 或未实现的 Repository Review workflow。目标文件或安装记录已存在时停止，不覆盖；`--dry-run` 不写入。

安装记录为 `.github/graph-engineering/installation.json`：`schemaVersion: 3`，包含 `product`、`productVersion`、`sourceCommit`、`delivery: workflow`、整套 `files` 清单和任务名。它只记录安装来源，不表达 Definition/Profile 身份、成熟度或兼容性证明。旧 schema 可以读取，但 `check` 会要求显式重新安装或迁移，不能把它误称为当前安装。

`check` 只读检查文件、安装记录和本地/远程前置条件；项目自有修改标记 `UNVERIFIED`。`ready` 仅在所有检查均为 `PASS` 时为真；阻断项令命令非零退出，其他待配置或未验证项不表示安装失败。开发期间不要求 CI 强制开发源与已安装副本一致。

当前 Development 模板锁定 `tutar/codex-action@393ad456e354dc9da7be630c09be243cc1d212af` 与 Codex CLI `0.153.4`，使用 checkout 外的 runner-local task state root 支持同一 GitHub run 的显式 rerun。安装和静态 `check` 不证明 runner 认证、隔离、恢复或真实任务执行已经验收；完整运行前提及操作边界见仓库的 Development Workflow 说明。

`migrate` 仅处理固定来源 `927bd96156f750546019581b653b7601db9c71c8` 的旧 Development 文件。默认显示计划；交互确认或非交互显式 `--apply` 后才改写。未知或修改过的来源、目标冲突、既有新安装记录均停止；保留无关项目文件。旧 PR Review 安装须人工决定如何处理，CLI 不自动卸载或接管。

`init/check pr-review` 明确报告退役；`init/check development` 明确报告任务选择接口已取消，不静默执行其他任务。
