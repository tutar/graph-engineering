# Workflow Definition 交付契约

仓库用 [`delivery/definitions.json`](../delivery/definitions.json) 记录 Workflow Definition（工作流定义）的交付身份。每条记录分别声明 Definition 名称与版本、来源 commit、Repository Release 版本、不可变 Git tag、发布时路径和可复制安装根目录；这两个版本字段是独立事实，不能靠相同字符串或目录名互相推导。

运行以下命令可核验当前映射、全部已发布路径和 Evidence 绑定：

```bash
node scripts/verify-definition-delivery.mjs
```

验证器把 `currentTasks` 与 `publishedDefinitions` 作为两类独立事实核验：前者要求每种 Workflow Task 只有一个无版本当前路径、可复制安装根与行为测试根；后者要求 tag 精确解析到记录的完整 commit，并直接从该 tag 的 Git tree 检查安装内容。它还确认 `workflow-definitions/` 已退出当前源码树，并检查 Evidence Manifest 明示的 Definition、Repository Release、Compatibility Profile（如该 Bundle 已记录）和 Action revision，不允许当前实现自动继承旧 Evidence。

Legacy Development Definition 发布早于 GitHub Release 对象的使用；清单将其历史仓库交付版本 `0.1.2` 明确标为 `legacy-tag`，不虚构不存在的 GitHub Release。PR Review 的 `v0.2.x` 条目则标为 `github-release`。

## 获取与所有权

- **当前实现**：唯一交付源 [`workflow/.github/`](../workflow/.github/)，当前只交付 [Development](../workflow/README.md)。PR Review 已退役，Repository Review 尚未实施；目录调整不冻结 Candidate 或继承历史 Evidence。
- **历史发布内容**：由交付清单中的完整 commit 与 Git tag 承载。维护者可以在已有 clone 中使用 `git archive <gitRef> <path>/files/.github` 导出；主分支不再保存这些源码副本。
- **Consumer Workflow Instance（消费项目工作流实例）**：Consumer 把导出的 `.github/` 普通文件复制进自己的仓库后自行拥有；运行时不访问本仓库，也不是远程 Reusable Workflow。Consumer 的本地修改不改变来源 Definition 的身份或证据。

本分支未发布 CLI `0.3.1` 使用整套 `init` 与 `check`，打包资产从唯一交付源生成，不维护人工模板副本。安装与接口细节见 [CLI 说明](../packages/cli/README.md)，本地打包接入见 [README](../README.md#接入)。已发布 `v0.3.0` 和 CLI `0.3.0` 保留原契约，不因本分支更改而被回写。

例如，从已发布 `v0.2.4` 取得 PR Review Definition：

```bash
git archive v0.2.4 workflow-definitions/github-pr-review/v0.1.4/files/.github \
  | tar -x --strip-components=4 -C /path/to/consumer
```

复制之后由 Consumer 审阅并提交这些文件；命令只展示离线取得方式，不把 Consumer 改成在线依赖本仓库。

## 升级与迁移

现有 Consumer Workflow Instance 不会自动迁移。本分支 CLI 的 `graph-engineering migrate` 只识别已冻结的旧版文件组合，先展示删除与新增 diff；交互终端确认后执行，非交互环境必须显式传入 `--apply`。来源无法识别、项目文件已有不能安全转换的修改，或新旧安装同时存在时停止。CLI 不 commit、push 或修改 GitHub Settings。

Development 保持现有权限、标签和人工事件、Goal Prompt、恢复协议、预算与 Stop hook 收尾行为。迁移只移除经过来源校验的旧文件，保留无关 Consumer 文件；旧 PR Review 明确报告退役并要求人工处理，不自动卸载、改写或接管。旧按任务安装/检查接口不静默路由到整套安装。

升级者仍应审阅 runner labels、事件配置、Event Prompt 和项目策略；来源未知或项目自有修改无法安全转换时进行人工合并。当前目录未冻结，没有新增真实 Consumer Evidence 或 Stable 晋级结论。

## Evidence 与修复来源边界

交付清单的 `evidenceBindings` 是历史 Bundle 的索引，不是当前实现的通过名单。每个 Bundle 继续绑定自己的冻结 Definition、Repository Release、Profile、Action revision 与 Consumer 输入；新路径或新实现必须重新冻结并运行，不能拼接旧结果。

[PR #46](https://github.com/tutar/graph-engineering/pull/46) 是 Bundle 6 失败后形成的修复来源，不作为要合并的 `v0.1.5` 目录原形。其完整 Check history 分页、重复身份 fail-closed、目标 head 重读与发布审计行为已由[将 PR Review Task 迁入当前任务布局](https://github.com/tutar/graph-engineering/issues/49)在当时的任务布局中重新实现并覆盖测试，随后按 [ADR-0006](adr/0006-retire-pr-review-and-unify-workflow-delivery.md) 退出当前产品；PR #46 因而由[移除历史版本副本并完成当前布局切换](https://github.com/tutar/graph-engineering/issues/51)以“被当前实现取代”关闭，而不合并旧版目录形态，也不删除其 branch、讨论或证据链接。完整 Bundle 6 FAIL（包括相同 head 上两个同身份 Check）仍保存在 [Evidence Manifest](evidence/github-pr-review-v0.1.4-consumer-validation.md)，重复 Check 不删除、不改写；[Bundle 7 准备](evidence/bundle-7-preparation.md) 继续保持 `NOT_FROZEN / NOT_RUN`，没有虚构 Release、Consumer PR、SHA 或 Case Result。
