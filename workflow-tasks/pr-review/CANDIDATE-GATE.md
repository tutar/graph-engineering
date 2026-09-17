# 当前 PR Review Task 静态发布门

Gate Decision: **PASS for current-layout implementation only**. Candidate only; no Stable Supported Profile.

当前测试覆盖以下契约：

- routing 与人工入口，包括 Draft 默认静默；
- 绑定 PR、base/head SHA 的 Goal Prompt；
- Standards/Spec 两轴输出与 Compatible Executor mapping；
- runner and authentication、Action and CLI pin；
- review/publish permissions 分离；
- 输出 validation、SHA freshness、idempotency 与 fail-closed；
- Check 完整历史分页、精确 identity 协调、重复或畸形历史闭锁失败；
- Fresh Goal Run 与按 PR 串行的 concurrency。

Fake Action 和本地 GitHub API fixture 只证明当前文件集合的自动化契约，不证明真实 Consumer compatibility。Agent final text is not evidence of trusted publication；历史 Evidence 也不证明当前 Candidate 已通过。新的冻结身份、Release、Consumer Project 与 Evidence Bundle 由后续验收建立。
