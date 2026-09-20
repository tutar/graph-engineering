# Codex Goal Action

This local JavaScript Action runs one project-agnostic Codex Work Goal. The caller owns checkout, branch selection, GitHub Issues, labels, commits, pushes, and pull requests.

The Action reuses an exact matching Codex CLI from `PATH` or the runner tool cache. If missing, it installs the requested fixed version into `RUNNER_TOOL_CACHE/codex/<version>/<arch>` without changing the global installation. With `OPENAI_API_KEY`, it creates and later removes an isolated `CODEX_HOME`; without the variable, the App Server inherits the runner's prepared login state.

Finite `token-budget` values must exceed 100,000. The Action reserves exactly 100,000 for one Handoff Goal and gives the remainder to Work. `unlimited` removes only the Work limit. Work `complete` succeeds without Handoff; Work `blocked` or `budgetLimited` runs at most one Handoff in the same App Server thread and workspace, then fails the Action regardless of the Handoff result.

`log-mode` controls the allowlisted Codex App Server events written to the Job log and defaults to `safe`:

- `safe` writes event type, Work/Handoff phase, status, token usage, elapsed time, and command exit code without Runtime content.
- `detailed` additionally writes UI-visible reasoning summaries, Agent messages, commands and incremental output, MCP calls/progress/results, and file changes.
- `silent` keeps the minimum pre-existing behavior and does not project App Server events.

Every projected line begins with `[codex][work|handoff][event]`. Runtime control characters are escaped, multiline content is separately prefixed, and known Action secrets are redacted. Account/authentication notifications, raw JSON-RPC, hidden reasoning, and unknown events are never projected. Renderer failures do not change a Goal result; invalid JSON-RPC and other App Server protocol failures still fail the Action.
