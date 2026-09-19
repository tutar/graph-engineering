# [新增 Coding Task：静态 Compatible Executor、同 Run 恢复与最小交付校验](https://github.com/tutar/graph-engineering/issues/70) 验证报告

> 归档：此报告只描述当时实现与验证结果，不属于当前 Coding Task 的活动验收流程。

本报告记录 `github-coding-task/v0.1.0` 的本地 Candidate Publication Gate（候选发布门）证据。它不声明真实 Consumer Project（消费项目）已经验收，也不把 Development、#67 或固定 Action 自身的历史证据当作 Coding Task 的 Stable 证据。

## 验收映射

1. **独立 Definition 与路由**：`github-coding-task.yml` 使用 `ready-for-agent`、`coding-ticket`、人工 Issue number 和独立 Issue concurrency group；Development Workflow 与历史 `0.1.2` tag 不被改写。
2. **静态 Executor/Profile**：`delivery/definitions.json` 锁定 Action `393ad456e354dc9da7be630c09be243cc1d212af`、CLI `0.153.4`、self-hosted Linux X64、runner-backed authentication、`:workspace`、公开输入输出和 `unsupported/unlimited` Token Budget 能力。
3. **恢复与隔离**：两次 Action 调用共享 caller `task-id: coding` 和 checkout 外 task state root。固定 Action 的公开契约以 repository、run、job、caller task 和 matrix 构成身份，`run_attempt` 不进入身份；不同 Run/Task 不共享 Session、Codex home、workspace 或 task record，缺失材料采用可见 replacement。
4. **结果分层与交付**：Workflow 分别输出 Action machine outcome、结构化 Agent result、delivery state 与 Token Budget state。交付校验只有干净仓库、base 后提交、远端 HEAD 和唯一 open Draft PR 四项。
5. **终态清理**：四项交付事实通过后，先移除 `coding-ticket` 与 `in-progress`，再在 task state root 边界内删除 Task Repository；任一步失败都会恢复 `coding-ticket` 并移除 `in-progress`，其他非成功终态也保留恢复材料并只移除 `in-progress`。
6. **证据边界**：文档明确保留 Candidate 状态，并列出正常交付、同 Run rerun、完成跳过、A/B 隔离、replacement 和交付检查所需的新 Consumer Evidence Bundle。

## 本地验证

- `env -u NODE_TEST_CONTEXT node --test --test-concurrency=1 workflow/test/*.test.mjs packages/cli/test/*.test.mjs test/*.test.mjs`：39/39 通过；包含真实临时 Git remote 的新分支/远端分支恢复测试、结果状态机与受限仓库删除行为测试，以及缺失 Profile 字段的 fail-closed 测试。
- `node scripts/verify-definition-delivery.mjs`：2 个当前 Workflow Task、8 个历史发布 Definition、4 个 Evidence binding 与 1 个 audit source 通过。
- `git diff --check`：通过。

这些静态与本地测试不会调用付费模型，也不证明 runner、认证、真实 GitHub 事件、Session recovery 或 Stable promotion。Session/clone/replacement/A-B 隔离能力依据当前 Profile 锁定的同一 Action revision 及其已完成依赖 #62–#65；Coding Task 自身的真实 Consumer 组合仍待单独 Evidence Bundle。
