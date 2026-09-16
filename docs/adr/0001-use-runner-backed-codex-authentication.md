---
status: superseded by ADR-0002
---

# Use runner-backed Codex authentication for PR Review

Repository Release `v0.2.0` 已发布的 `github-pr-review/v0.1.0` Candidate 使用 GitHub-hosted runner 与仓库 `OPENAI_API_KEY`，但真实 Consumer 验证无法取得该凭据，也偏离项目已有的 self-hosted Codex runner 路线。项目不回写已发布版本，而以 Repository Release `v0.2.1` 和 Workflow Definition `github-pr-review/v0.1.1` 发布修正版：review job 使用带固定 capability labels 的专用 self-hosted runner，`openai/codex-action` 继续锁定不可变 revision、安装固定 Codex CLI 并复用 runner 的 Codex 登录状态；GitHub-hosted API-key 路径、直接调用 runner CLI 和动态 Provider fallback 均不属于该修正版。

旧 Candidate 与 PR #38 的未完成 Evidence Bundle 保留为历史事实，不与修正版 Case Results 拼接。修正版必须在新的公开 Consumer Project 中，以同一冻结组合重新执行 Draft、ready review、新 SHA 与同 SHA 重跑 Cases；安全失败路径仍由后续 Stable Promotion ticket 验证。
