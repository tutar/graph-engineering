# Issue 59 验证报告

> 归档：此报告只描述当时实现与验证结果，不属于当前 Coding Task 的活动验收流程。

范围：[退役 PR Review，统一 Workflow 交付与整套安装](https://github.com/tutar/graph-engineering/issues/59)。本报告区分 Local Regression（本地回归）、Static Delivery Verification（静态交付核验）与 Real Consumer Validation（真实消费项目验证）。

## 本地回归

执行入口：

```bash
node packages/cli/scripts/sync-package-assets.mjs
node --test --test-concurrency=1 test/*.test.mjs packages/cli/test/*.test.mjs workflow/test/*.test.mjs
node scripts/verify-definition-delivery.mjs
git diff --check
```

当前测试共 44 项。CLI 测试在临时 Git Consumer 仓库验证外部安装、检查、冲突、退役及迁移行为；根级测试实际执行 `npm pack`、解包并运行产物 CLI。Development 回归保留，执行代码和 YAML 与实施前 `d843f85` 的五个文件逐字一致；布局变化不修改事件、权限、Goal Prompt、恢复、网络、预算或 Stop hook 行为。

## 逐项验收依据

| Issue 验收项 | 直接证据 |
| --- | --- |
| PR Review 退出当前产品和接入导航 | 当前 `workflow-tasks/` 不存在；生成包不含 PR Review 模板或迁移资产；CLI 旧入口测试验证明确退役且不改变 Consumer；README 和 CLI 导航只推荐整套 Development。 |
| 唯一当前交付源与整套安装 | `workflow/.github/` 为唯一交付源；根级实际 npm pack 测试逐文件比较源码、模板和临时 Consumer；schema 2 安装记录含整套清单与固定来源。 |
| 冲突不覆盖、检查不写入、迁移保障、旧接口明确拒绝 | CLI 测试比较检查前后完整 `.github/` 文件内容；覆盖部分冲突、重复安装、项目自有修改、旧记录、修改过的迁移来源、迁移目标冲突、迁移预览及无关文件保留；迁移显示路径计划与内容 diff，修改需确认或显式 `--apply`。 |
| Development 行为保持且相关回归通过 | 五个运行文件与实施前逐字比较；现有 Goal、网络、线程身份及恢复、预算、取消、Stop hook、权限与交付回归保留并通过。 |
| 根级与 CLI 测试保留、历史追溯通过 | 保留 `test/`、`packages/cli/test/` 与 Development 测试；验证所有 8 个历史 Definition 的 tag、SHA、发布路径及历史导出，另有删除历史源码副本的 fixture 测试。 |
| 历史发布、ADR、Evidence 保留，当前决定记录 | `publishedDefinitions`、`evidenceBindings`、`auditSources` 保持原值；旧 ADR、Release 说明和 Evidence 无改动；当前说明引用已接受 ADR-0006；Bundle 6 FAIL 与 Bundle 7 NOT_FROZEN / NOT_RUN 原样保留；未执行删除/修改远程 Release、tag 或 Check 的操作。 |
| 未交付未实现的 Repository Review | 实际包和安装结果只有 Development YAML 及四个执行文件；README 和 CONTEXT 明示 Repository Review 尚未实施，架构分析延期。 |
| 报告区分验证层级 | 本报告分别陈述本地回归、静态核验与下述未执行的真实 Consumer 验证。 |

## 静态交付核验

交付验证器保留历史映射：8 个已发布 Definition、4 个 Evidence 绑定、1 个审计来源。当前任务共同使用一个交付源；旧源码根必须不存在。生成模板来自唯一源码，不人工维护副本；只有 Development 的固定旧迁移资产进入包。

CLI `0.3.1` 为本分支未发布实现，没有发布 npm 版本或 GitHub Release；已发布 `0.3.0` 不被改写。安装记录注明来源，不把用户修改过的文件称为模板匹配，也不把旧 per-task 记录误称为整套记录。

## 真实 Consumer 验证：未执行

临时本地 Consumer 验收没有运行真实 GitHub Actions、启动 Codex Goal 或验证 runner 认证、中断恢复和远程 Draft PR 交付。本票不创建新的 Candidate 冻结、Evidence Bundle 或 Stable 晋级结论。保留既有回归与逐字运行文件比较证明本次布局未改变已有实现；它们不能替代新的真实 Consumer 运行证据。
