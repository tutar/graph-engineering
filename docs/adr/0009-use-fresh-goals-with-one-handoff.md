---
status: accepted
---

# 每次调用使用全新 Goal，并只允许一次 Handoff

每个 GitHub Actions job attempt 创建新的 Codex Session 和 Work Goal，从 Issue、评论、远端分支与 PR 重新定位状态，不恢复 runner 本地 Session。Work Goal 进入 `blocked` 或 `budgetLimited` 时，Action 在相同 Session 与 workspace 中至多启动一次固定 100,000 token 的 Handoff Goal，用于提交并推送适合保存的未完成代码；Handoff 再失败或耗尽即异常结束，不递归收尾。

不设置 Workflow job timeout 或软截止时间；人工取消、平台终止、runner 丢失、App Server 崩溃及认证失败不保证收尾。这个取舍用 GitHub 持久事实和简单的单次交接取代本地 Task Repository、Session Resume 与 Session Replacement，因而取代 ADR-0007。
