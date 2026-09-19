---
status: superseded by ADR-0008
---

# Bind runner authentication to a maintained Agent Action

Real Consumer evidence disproved ADR-0001's assumption that `openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e` could reuse a runner's existing Codex login: without an API key it still read proxy-only server-info and failed before `codex exec`. `github-pr-review/v0.1.2` therefore binds Runner-backed Codex Authentication to immutable `tutar/codex-action@f33581290086e62dc34d420a7f1862477fc2b503`, a minimal maintained patch over that upstream commit which skips proxy server-info only on the no-key path; the Action continues to install and invoke the fixed CLI and own its permission/output boundary. Published `v0.1.1` remains unchanged with a failed Evidence Bundle, and any maintained-Action or upstream-base change requires a new Definition version and complete Consumer revalidation.
