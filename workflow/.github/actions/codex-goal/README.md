# Codex Goal Action

This local JavaScript Action runs one project-agnostic Codex Work Goal. The caller owns checkout, branch selection, GitHub Issues, labels, commits, pushes, and pull requests.

`codex-version` is the minimum stable CLI version. The Action reuses the first compatible CLI from `PATH`, then checks the minimum-version runner tool cache. If neither is compatible, it installs the minimum version into `RUNNER_TOOL_CACHE/codex/<version>/<arch>` without changing the global installation. Invalid version output and prereleases below the stable minimum are incompatible. With `OPENAI_API_KEY`, it creates and later removes an isolated `CODEX_HOME`; without the variable, the App Server inherits the runner's prepared login state.

For a Work prompt containing `$skill-name`, the Action refreshes the target directory's App Server `skills/list` catalog before creating the Work Goal. Every mentioned Skill must resolve to one enabled entry and its catalog-provided absolute `SKILL.md` path. The Action prepends an instruction to read and follow those files before task operations. Missing, disabled, ambiguous or inconsistent entries fail before `thread/goal/set`; prompts without a mention keep their original objective and do not query the catalog. This is a read-and-follow compatibility bridge. Codex Goal input still does not provide native structured Skill invocation, so native loader dependencies, warnings and invocation telemetry are not claimed. The Action does not read or copy Skill contents.

Finite `token-budget` values must exceed 100,000. The Action reserves exactly 100,000 for one Handoff Goal and gives the remainder to Work. `unlimited` removes only the Work limit. Work `complete` succeeds without Handoff; Work `blocked` or `budgetLimited` runs at most one Handoff in the same App Server thread and workspace, then fails the Action regardless of the Handoff result.

`log-mode` controls the allowlisted Codex App Server events written to the Job log and defaults to `safe`:

- `safe` writes event type, Work/Handoff phase, status, token usage, elapsed time, and command exit code without Runtime content.
- `detailed` additionally writes UI-visible reasoning summaries, Agent messages, commands and incremental output, MCP calls/progress/results, and file changes.
- `silent` keeps the minimum pre-existing behavior and does not project App Server events.

Every projected line begins with `[codex][work|handoff][event]`. Runtime control characters are escaped, multiline content is separately prefixed, and known Action secrets are redacted. Account/authentication notifications, raw JSON-RPC, hidden reasoning, and unknown events are never projected. Renderer failures do not change a Goal result; invalid JSON-RPC and other App Server protocol failures still fail the Action.
