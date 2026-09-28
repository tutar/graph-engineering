# @tutar/graph-engineering

一次安装项目自有的 Graph Engineering（图工程）GitHub 工作流集合。完整 Quick Start、运行前提与支持边界见 [Graph Engineering](https://github.com/tutar/graph-engineering#quick-start)。

v0.3.3 提供整套 Workflow 安装与版本升级 CLI，发布资产见 [npm](https://www.npmjs.com/package/@tutar/graph-engineering/v/0.3.3) 与 [GitHub Release](https://github.com/tutar/graph-engineering/releases/tag/v0.3.3)：

```bash
npx --yes @tutar/graph-engineering@0.3.3 init [--dry-run] [--project /path/to/consumer]
npx --yes @tutar/graph-engineering@0.3.3 check [--json] [--project /path/to/consumer]
npx --yes @tutar/graph-engineering@0.3.3 migrate [--apply] [--project /path/to/consumer]
```

`init` 将 `workflow/.github/` 开发源的打包资产整体复制到目标 Git 仓库的 `.github/`。当前集合包含独立的 Coding 与 Development Workflow；没有 PR Review 或未实现的 Repository Review workflow。目标文件或安装记录已存在时停止，不覆盖；`--dry-run` 不写入。

安装记录为 `.github/graph-engineering/installation.json`：`schemaVersion: 3`，包含 `product`、`productVersion`、`sourceCommit`、`delivery: workflow`、整套 `files` 清单和任务名。它只记录安装来源，不表达 Definition/Profile 身份、成熟度或兼容性证明。旧 schema 可以读取，但 `check` 会要求显式重新安装或迁移，不能把它误称为当前安装。

`check` 只读检查文件、安装记录和本地/远程前置条件；项目自有修改标记 `UNVERIFIED`。`ready` 仅在所有检查均为 `PASS` 时为真；阻断项令命令非零退出，其他待配置或未验证项不表示安装失败。开发期间不要求 CI 强制开发源与已安装副本一致。

当前 Development 模板交付本地 Action，其 Task Invocation 与恢复代码来自 `tutar/codex-action@393ad456e354dc9da7be630c09be243cc1d212af`。Action 要求 Codex CLI 最低稳定版本 `0.153.4`，复用 runner 已安装的兼容 CLI；使用 checkout 外的 runner-local task state root 支持同一 GitHub run 的显式 rerun。安装和静态 `check` 不证明 runner 认证、隔离、恢复或真实任务执行已经验收；完整运行前提及操作边界见仓库的 Development Workflow 说明。

`migrate` 仅处理固定来源 `927bd96156f750546019581b653b7601db9c71c8` 的旧 Development 文件。默认显示计划；交互确认或非交互显式 `--apply` 后才改写。未知或修改过的来源、目标冲突、既有新安装记录均停止；保留无关项目文件。旧 PR Review 安装须人工决定如何处理，CLI 不自动卸载或接管。

`init/check pr-review` 明确报告退役；`init/check development` 明确报告任务选择接口已取消，不静默执行其他任务。

## Workflow 版本升级（0.3.3 起）

旧版 0.3.1/0.3.2 CLI 不含 `upgrade`。0.3.3 CLI 提供独立入口，首次支持 0.3.1 起的 schema 3 安装；不修改历史 npm 包。执行升级的 CLI 版本与项目安装版本独立，默认目标是执行命令的 CLI 版本；`--to` 只接受准确稳定版本，如 `0.3.2`，不接受 `latest` 或范围。目标需使用该版本的已发布包；无法取得或核对来源则停止。

```text
graph-engineering upgrade [--to <version>] [--from-package <baseline.tgz>] [--to-package <target.tgz>] [--apply] [--project <path>]
```

默认仅展示路径计划、包来源提交与 SHA-512、内容 diff（包括安装记录），不写入目标项目，也不交互询问。`--apply` 应用整套无冲突计划。同版本核对来源后报告无需升级；降级、旧 schema、缺失安装记录、版本/来源提交/文件清单不匹配均停止。未提供本地包时通过 `npm pack @tutar/graph-engineering@<准确版本> --ignore-scripts` 取得资产，核对 npm 报告的 integrity、包身份、版本与 release metadata；基线的来源提交和模板文件清单还须与安装记录一致。不运行包内代码或安装脚本。需要本地 `npm`、Git、tar；离线时只需要 Node.js 20+、Git、tar 与可信的包文件。

用新版 CLI 将旧项目升级到准确的 0.3.2（CLI 版本与目标安装版本可以不同）：

```bash
npx --yes @tutar/graph-engineering@0.3.3 upgrade --to 0.3.2 --project /path/to/project
npx --yes @tutar/graph-engineering@0.3.3 upgrade --to 0.3.2 --project /path/to/project --apply
npx --yes @tutar/graph-engineering@0.3.2 check --project /path/to/project
```

省略 `--to` 时目标为 0.3.3，使用 0.3.3 CLI 执行 `check` 核对该目标版本。不要使用旧版 0.3.2 CLI 执行升级命令。

离线前在联网环境取得旧版与目标版原始包；可从对应 GitHub Release 下载同一资产。另将 0.3.3 CLI 包解包到 `/path/to/offline-cli/`。把这些包复制到离线机器，核对可信发布来源的 SHA-512 后执行：

```bash
npm pack @tutar/graph-engineering@0.3.1 --ignore-scripts --pack-destination /path/to/assets
npm pack @tutar/graph-engineering@0.3.2 --ignore-scripts --pack-destination /path/to/assets
node /path/to/offline-cli/package/bin/graph-engineering.mjs upgrade --to 0.3.2 --project /path/to/project \
  --from-package /path/to/assets/tutar-graph-engineering-0.3.1.tgz \
  --to-package /path/to/assets/tutar-graph-engineering-0.3.2.tgz
# 检查预览后，在同一命令末尾添加 --apply。
```

两个本地参数均提供时不会调用 npm 或访问网络。包自身的身份、版本、来源提交与模板清单仍会核对，并输出 SHA-512；离线核对依赖操作者提供可信原始发布资产，包内 metadata 本身不是真实性签名。

三方合并使用旧版原始模板、项目文件和目标模板：保留 runner、触发条件、Prompt 等可合并修改；未改文件应用上游变更，上游未改时保留项目内容及删除；已等于目标的文件不重复写入。仅处理旧/新模板路径并集，无关文件不接管。新增路径碰撞、修改与删除、重叠修改、无法可靠合并的二进制或非 UTF-8 双方修改会报告冲突，退出码为 1；即使带 `--apply` 也不改写任何项目文件，不写冲突标记。人工编辑项目文件解决冲突后重新执行预览，再应用。

应用前复核所有涉及文件（包括保留项）的内容、存在状态、权限和安装记录，若计划后变化则停止。可捕获的普通写入失败恢复原文件内容、存在状态、权限和安装记录；整套文件成功后才写入目标包版本、来源提交与原始模板清单。保留的项目修改不成为新模板基线，后续升级仍使用记录版本的原始包；使用目标版本 CLI 的只读 `check` 可以继续报告 `UNVERIFIED`。恢复保证不覆盖断电、强制终止，也不承诺多文件事务原子性或并发编辑期间的隔离。

维护者可在发布前复现真实包升级检查：

```bash
node packages/cli/scripts/verify-published-upgrade.mjs /path/to/assets /path/to/candidate.tgz --online
```

该检查使用隔离 Git 项目，同时验证在线包获取与离线包、默认预览、显式应用、项目修改、新增 Action/Skill 桥接文件及安装记录。文件升级及静态检查不证明 runner 认证或真实任务执行。
