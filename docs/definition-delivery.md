# Workflow Definition 交付契约

仓库用 [`delivery/definitions.json`](../delivery/definitions.json) 记录 Workflow Definition（工作流定义）的交付身份。每条记录分别声明 Definition 名称与版本、来源 commit、Repository Release 版本、不可变 Git tag、发布时路径和可复制安装根目录；这两个版本字段是独立事实，不能靠相同字符串或目录名互相推导。

运行以下命令可核验当前映射、全部已发布路径和 Evidence 绑定：

```bash
node scripts/verify-definition-delivery.mjs
```

验证器要求 tag 精确解析到记录的完整 commit，并直接从该 tag 的 Git tree 检查安装内容。因此历史 Definition 即使以后不再保留于主分支，仍可从固定引用取得。它还要求每种当前 Definition 只有一条记录，并检查 Evidence Manifest 明示的 Definition、Repository Release、Compatibility Profile（如该 Bundle 已记录）和 Action revision，不允许迁移后的当前实现自动继承旧 Evidence。

## 获取与所有权

- **当前实现**：主分支中正在演进、后续将迁入无版本任务布局的源码。当前映射以交付清单为准；不能从“目录中版本号最大”猜测。
- **历史发布内容**：由交付清单中的完整 commit 与 Git tag 承载。维护者可以在已有 clone 中使用 `git archive <gitRef> <path>/files/.github` 导出；迁移完成后不要求主分支继续保存该源码副本。
- **Consumer Workflow Instance（消费项目工作流实例）**：Consumer 把导出的 `.github/` 普通文件复制进自己的仓库后自行拥有；运行时不访问本仓库，也不是远程 Reusable Workflow。Consumer 的本地修改不改变来源 Definition 的身份或证据。

当前两个安装入口在迁移期间保持不变：

- `workflow-definitions/github-development-ticket/v0.1.2/files/.github/`
- `workflow-definitions/github-pr-review/v0.1.4/files/.github/`

例如，从已发布 `v0.2.4` 取得 PR Review Definition：

```bash
git archive v0.2.4 workflow-definitions/github-pr-review/v0.1.4/files/.github \
  | tar -x --strip-components=4 -C /path/to/consumer
```

复制之后由 Consumer 审阅并提交这些文件；命令只展示离线取得方式，不把 Consumer 改成在线依赖本仓库。

## Evidence 与修复来源边界

交付清单的 `evidenceBindings` 是历史 Bundle 的索引，不是当前实现的通过名单。每个 Bundle 继续绑定自己的冻结 Definition、Repository Release、Profile、Action revision 与 Consumer 输入；新路径或新实现必须重新冻结并运行，不能拼接旧结果。

[PR #46](https://github.com/tutar/loop-engineering/pull/46) 是 Bundle 6 失败后形成的修复来源，不作为要合并的 `v0.1.5` 目录原形。完整 Bundle 6 FAIL（包括相同 head 上两个同身份 Check）保存在 [Evidence Manifest](evidence/github-pr-review-v0.1.4-consumer-validation.md)，重复 Check 不删除、不改写；[Bundle 7 准备](evidence/bundle-7-preparation.md) 明确保持 `NOT_FROZEN / NOT_RUN`，没有虚构 Release、Consumer PR、SHA 或 Case Result。后续 #49 在当前任务布局中重做和验证修复，不能把 PR #46 的本地测试当成真实 Consumer 兼容证据。
