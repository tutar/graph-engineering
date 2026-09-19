# github-coding-task v0.1.1 Consumer Evidence Bundle 9

> 归档：此文件只保留历史事实，不属于当前工作流的发布或验收流程。

- Evaluated: 2026-09-18 (Asia/Shanghai).
- Gate Decision: COMPLETE for Qualification Evidence only — bounded exhaustion and zero-model same-Run recovery pass; completion cases remain `NOT_RUN`.
- Definition remains Candidate; no Stable Supported Profile.
- Owner: [验证 Coding Task Consumer 交付、同 Run 恢复与任务隔离](https://github.com/tutar/graph-engineering/issues/71).

## Frozen inputs

| Input | Value |
| --- | --- |
| Candidate source commit | `cb946f796cd808444370003ecb86b58462cae757` |
| Definition / Compatibility Profile | `github-coding-task/v0.1.1` / `github-coding-task/codex/v0.1.1` |
| Agent Action / Codex CLI | `tutar/codex-action@9405141578057eb1dca78f927b10f6c3cf3a79a4` / `0.153.4` |
| Consumer repository / main | `tutar/loop-engineering-consumer-validation` / `2c73ff707a51d20053a6b3bfb9f7af66165689b7` |
| Consumer tree / Workflow blob | `5786d429f67666980e070cbba73b991159334252` / `f0664aab3e826c1308ce1872458fe8def47f58df` |
| Runner | repo-scoped runner id `27`, `issue-67-bundle-8-c`, unique label `[self-hosted, Linux, X64, graph-engineering-coding]`, persistent `runner.tool_cache` |
| Authentication / permissions | runner-backed Codex login / `permission-profile: :workspace`, `approvalPolicy: never`, `drop-sudo` |
| Model / effort / schema | `gpt-5.6-sol` / `low` / `{status: completed|blocked, summary: string}` |
| Task Invocation | repository + Run `35334612102` + job `coding` + Action identity `coding` |

The two attempts below use one unchanged Workflow Instance, Action revision, CLI, runner and Task Invocation. Failed states and the provider usage event are retained.

## Budget Case Results

| Case | Expected | Observed | Decision | Direct evidence |
| --- | --- | --- | --- | --- |
| B1. Bounded exhaustion | Initial budget is fixed before model work; Runtime stops at its native limit and preserves recovery state without an Agent result or delivery checks | Attempt 1 printed `1000`, created Session `01a0b40d-0970-7d63-8038-11416701bcae`, then Goal reached `budgetLimited` at Runtime `tokensUsed=5590`; Action reported `exhausted`, Agent `not-produced`, delivery `not-run`, and skipped successful cleanup | PASS | [Attempt 1](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35334612102/attempts/1) |
| B2. Native same-Run recovery and invalid decrease | Native rerun restores the same Session, effective limit and cumulative usage; a decrease fails before model work | Attempt 2 restored the same Session and Goal, reported `previous=1000`, `tokensUsed=5590`, `runAttempt=2`, and rejected requested `500` before reactivation; usage did not increase | PASS | [Attempt 2](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35334612102/attempts/2) |
| B3. Default 400,000 normal completion | Complete delivery and record actual usage without approaching the limit | Not executed under the user's remaining-token constraint | NOT_RUN | — |
| B4. Finite increase and `unlimited` completion | Continue the same exhausted Goal and finish delivery | Not executed because it would resume model consumption | NOT_RUN | — |
| B5. Real crash/cancellation/network/quota | Preserve Runtime usage and retain non-exhaustion classifications | Public Action seam tests pass; real Consumer injections are not run | NOT_RUN | — |

The Runtime budget counter and provider event use different semantics: attempt 1 also emitted provider `totalTokens=16726`. No further model attempt was started after that exceeded the user's 15,000-token test ceiling. This manifest does not reinterpret either number as provider billing.

## Scope Decision

Bundle 9 is retained as Qualification Evidence for the frozen Runtime budget enforcement and same-Run state-recovery mechanisms. Its `NOT_RUN` cases remain historical facts and are not reinterpreted as passes.

Production qualification is owned by [#71](https://github.com/tutar/graph-engineering/issues/71) and requires a separate frozen Bundle from a real Coding Task: operator cancellation after Session record, active Goal and actual Agent work are established, followed by a native rerun of the original Run, same-Session recovery and complete delivery. Extended fault injection and Session Replacement boundaries are tracked separately by [#74](https://github.com/tutar/graph-engineering/issues/74) and do not block #71's minimum Stable gate.

## Lifecycle

This Bundle is `COMPLETE` for Qualification Evidence only.

It proves the frozen Runtime budget enforcement and same-Run state-recovery mechanisms represented by B1 and B2. It does not authorize Stable promotion and does not prove production Coding Task delivery.

Production qualification is owned by #71 and requires a separate frozen Bundle from a real Coding Task: operator cancellation after Session and active Goal establishment, followed by native rerun of the original Run, same-Session recovery and complete delivery.

The two Bundles remain separate evidence layers; their Case Results are not one combined run sequence. Any changed Definition, Action, CLI, Consumer Workflow blob, runner or permission contract requires a new Bundle.
