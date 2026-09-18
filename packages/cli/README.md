# @tutar/graph-engineering

一次安装项目自有的 Graph Engineering（图工程）GitHub 工作流集合。当前 CLI `0.3.1` 是未发布的本分支实现；使用源码 `npm pack` 生成的本地包，具体步骤见 [仓库接入说明](https://github.com/tutar/graph-engineering#接入)。已发布 `0.3.0` 不提供新接口。

```bash
graph-engineering init [--dry-run] [--project /path/to/consumer]
graph-engineering check [--json] [--project /path/to/consumer]
graph-engineering migrate [--apply] [--project /path/to/consumer]
```

`init` 将唯一 `workflow/.github/` 交付源的打包资产整体复制到 Consumer 的 `.github/`。当前集合包含独立的 Coding 与 Development Workflow；没有 PR Review 或未实现的 Repository Review workflow。目标文件或安装记录已存在时停止，不覆盖；`--dry-run` 不写入。

安装记录为 `.github/graph-engineering/installation.json`：`schemaVersion: 2`，`product`、`productVersion`、`delivery: workflow`、整套 `files` 清单，以及 `installations.coding`/`installations.development` 中的 CLI 版本、来源 commit、Definition、Profile 和 namespace。记录来源不表示项目文件永远与模板相同。旧 schema 1 记录可以识别，但不会被整套检查误称为新安装记录。

`check` 只读检查文件、整套记录和本地/远程前置条件；项目自有修改标记 `UNVERIFIED`。`ready` 仅在所有检查均为 `PASS` 时为真；阻断项令命令非零退出，其他待配置或未验证项不表示安装失败。CLI 不替代真实 Consumer 运行验证。

当前 Development 模板锁定 `tutar/codex-action@393ad456e354dc9da7be630c09be243cc1d212af` 与 Codex CLI `0.153.4`，使用 checkout 外的 runner-local task state root 支持同一 GitHub run 的显式 rerun。安装和静态 `check` 不证明 runner 认证、隔离、恢复或真实 Consumer 交付已经验收；完整运行前提及操作边界见仓库的 Development Workflow 说明。

`migrate` 仅处理固定来源 `927bd96156f750546019581b653b7601db9c71c8` 的旧 Development 文件。默认显示计划；交互确认或非交互显式 `--apply` 后才改写。未知或修改过的来源、目标冲突、既有新安装记录均停止；保留无关项目文件。旧 PR Review 安装须人工决定如何处理，CLI 不自动卸载或接管。

`init/check pr-review` 明确报告退役；`init/check development` 明确报告任务选择接口已取消，不静默执行其他任务。
