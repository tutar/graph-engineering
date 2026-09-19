---
status: accepted
---

# 自有 Codex Goal Action 并在本仓库直接 dogfood

Coding Task 不再绑定 `tutar/codex-action`，改由本项目维护通用 Codex Goal Action：调用者准备 workspace，Action 负责固定 CLI、认证、App Server、Goal 与预算，Workflow 负责事件、权限、并发和标签。开发源继续位于 `workflow/.github/`，通过 `graph-engineering init` 安装到根 `.github/` 后直接在本仓库 dogfood；项目不再用 Candidate、Stable、Consumer Validation 或 Evidence Bundle 管理当前工作流成熟度，因为这套发布模型的维护与 token 成本超过本项目直接使用所需的价值。

Action 不读取 Issue 业务状态，不管理分支、PR 或标签，也不独立核验 Agent 交付；Work Goal 的结构化终态是 Job 成功依据。历史发布与 evidence 作为归档事实保留。本决策取代 ADR-0002 对维护版 `codex-action` 的当前绑定，但不回写历史 Release。
