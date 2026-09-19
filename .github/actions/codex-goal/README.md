# Codex Goal Action

This local JavaScript Action runs one project-agnostic Codex Work Goal. The caller owns checkout, branch selection, GitHub Issues, labels, commits, pushes, and pull requests.

The Action reuses an exact matching Codex CLI from `PATH` or the runner tool cache. If missing, it installs the requested fixed version into `RUNNER_TOOL_CACHE/codex/<version>/<arch>` without changing the global installation. With `OPENAI_API_KEY`, it creates and later removes an isolated `CODEX_HOME`; without the variable, the App Server inherits the runner's prepared login state.

Finite `token-budget` values must exceed 20,000. The Action reserves exactly 20,000 for one Handoff Goal and gives the remainder to Work. `unlimited` removes only the Work limit. Work `complete` succeeds without Handoff; Work `blocked` or `budgetLimited` runs at most one Handoff in the same App Server thread and workspace, then fails the Action regardless of the Handoff result.
