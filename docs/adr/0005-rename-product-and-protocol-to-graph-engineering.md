---
status: accepted
---

# 将产品与运行协议迁为 Graph Engineering

项目是 Graph Engineering（图工程）在 GitHub 软件研发场景中的一种实现，而不只是单个 Goal Run 的 Loop Engineering（循环工程）封装。Repository Release `v0.3.0` 因此将 GitHub 仓库、产品、npm CLI 及当前运行协议统一迁为 `graph-engineering`；包括 Consumer Project 中的安装目录、可信 checkout 目录、内部 Git refs 与新写入的记录身份，避免长期保留产品名与协议名分裂的半迁移状态。

## 后果与边界

- `@tutar/graph-engineering@0.3.0` 与 Repository Release `v0.3.0` 共同标识本次产品交付；Workflow Definition 仍拥有独立的版本和 Candidate、Stable 或 Legacy Frozen 生命周期，不能从 Repository Release 状态推导验证结论。
- 新安装只写入 `graph-engineering` 身份；Development Task 在迁移时可以只读识别旧 Thread Record 与中断 refs，转换后只写新身份，避免现有 Ticket 的恢复链因协议迁名中断。
- CLI 同时提供新安装与显式迁移入口。新安装遇到目标文件冲突时不写入；迁移先展示 plan 与 diff，经确认后才转换项目拥有的 Workflow Instance。
- 已发布 Release、tag、SHA、Evidence Bundle、Consumer Project 名称及其历史链接保留产生时的 `loop-engineering` 身份，不回写冻结事实。当前维护文档和导航使用 `graph-engineering`，并通过迁名说明解释历史名称。
- 旧 GitHub 仓库名不再复用，以保留历史网页与 Git URL 的重定向；该重定向不构成旧 GitHub Action `uses:` 引用的兼容保证。
