---
status: accepted
---

# 主分支保留当前定义，历史版本通过 Git 发布获取

此前每个 Workflow Definition（工作流定义）版本都在主分支保留完整目录，方便同一 checkout 浏览与复制，但也导致代码、测试重复和修改目标歧义。决定主分支对每种工作流只保留当前演进实现，历史版本通过 Git tag（标签）、Repository Release（仓库发布版本）及对应固定提交获取，不再为每个版本复制完整源码目录；已发布内容冻结与验证证据隔离是必须保留的保证，物理分目录不是这些保证的前提。

## 后果与边界

- Repository Release 与各 Workflow Definition 仍拥有独立版本生命周期；来源版本必须能追溯到精确交付内容，不能因统一布局而混用历史证据。
- 本决策最初只记录目标组织方式；[将 PR Review Task 迁入当前任务布局](https://github.com/tutar/loop-engineering/issues/49)、[将 Development Task 迁入统一任务布局](https://github.com/tutar/loop-engineering/issues/50) 与 [移除历史版本副本并完成当前布局切换](https://github.com/tutar/loop-engineering/issues/51) 随后完成源码迁移、历史路径收缩、交付核验与升级说明。历史内容仍由固定 Git 引用取得，验证记录继续绑定原版本。
- 不回写已发布版本；本决策不改变 ADR-0002 的固定 Action revision 与重新验证要求。
