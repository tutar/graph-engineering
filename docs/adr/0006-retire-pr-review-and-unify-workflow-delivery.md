---
status: accepted
---

# 退役 PR Review，整套交付但保持任务与权限独立

用户需要的是 Development Task（研发实现任务）与后续 Repository Review Task（仓库审查任务），而不是以单 PR、绑定提交的 CI Check 为核心的 PR Review Task（PR 审查任务）产品。决定退役当前 PR Review 产品面，不将其 PR Check 契约改造成仓库审查；当前 Workflow Definition（工作流定义）采用唯一交付源并由 CLI 整套安装，以减少分任务交付树和安装边界带来的维护歧义，但不采用合并全部任务、事件与权限的总工作流。

## 与既有决策的关系

- 延续 [ADR-0004](0004-organize-workflows-by-task.md) 中按任务目标、副作用权限及结果责任保留独立 workflow 入口、薄编排和项目自有文件的原则；本决策取代其继续演进 PR Review 的产品范围，并明确统一的是交付与安装边界，不是任务或权限。
- 延续 [ADR-0003](0003-keep-current-definitions-and-release-history.md) 的历史追溯与冻结事实保障。历史 PR Review 的 Release、tag、固定提交、ADR 与 Evidence（证据）保留；退役不将未通过真实 Consumer 验证的 Candidate Definition（候选工作流定义）改称为受支持的 Legacy Frozen Definition（旧版冻结定义）。
- 旧 ADR 保留产生时的背景与取舍；其中关于当前产品范围的后续选择以本决策为准，不回写历史发布或失败证据。

## 后果与交付边界

- 统一交付源为 `workflow/.github/`，其中 `workflows/` 放独立任务入口，`graph-engineering/` 放执行代码；允许执行代码内部按任务组织，只提取实际共用的逻辑，不再按任务维护各自的整套交付树。
- CLI 整套安装当前文件集合到 Consumer Project（消费项目）的 `.github/`，取消按任务分别安装的当前产品接口；复制后仍由 Consumer 自行拥有，不新增中央远程运行依赖。
- 删除当前 PR Review 的源码、专属测试、打包模板、CLI 支持和默认导航，不自动卸载或修改已经复制到 Consumer 的旧实例。
- 保留 Development 的现有触发、Goal、实现与验证、恢复和 Draft PR 交付行为。统一目录不扩大可写实现任务的权限，也不让只读分析获得结果发布凭据。
- 先完成退役与统一交付，再独立实施定时或人工启动的增量代码审查；架构改进分析及其交互自动化适配延期，不作为仓库审查必须同时执行的组成部分。
- 保留根级、CLI、Development 行为测试和历史追溯验证，移除退役任务的专属测试；本地验证不构成新的 Stable Definition（稳定工作流定义）支持证据。

实施范围与验收依据为 [退役 PR Review，统一 Workflow 交付与整套安装](https://github.com/tutar/graph-engineering/issues/59)。后续审查的基线、无增量、缺失规格和重跑规则留在 Issue 规格中，不进入领域词汇表；该票据已记录对 [后续需求：可开关的每周仓库审查](https://github.com/tutar/graph-engineering/issues/47) 的阶段收缩。本 ADR 记录已接受的方向，不表示源码迁移、PR Review 删除或后续审查已经实现。
