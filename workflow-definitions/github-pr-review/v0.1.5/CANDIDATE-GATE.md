# github-pr-review v0.1.5 Candidate Publication Gate

- Evaluated: 2026-09-17
- Definition: `github-pr-review/v0.1.5`
- Repository release: `v0.2.5`
- Gate Decision: PASS — Candidate only
- Stable status: no Stable Supported Profile
- Local result: 49/49 tests PASS; PR Review v0.1.0–v0.1.5 regression: 231/231 PASS.

## Automated contract evidence

Run from the repository root:

```bash
node --test workflow-definitions/github-pr-review/v0.1.5/test/*.test.mjs
```

The suite verifies these publication categories at the Workflow Instance boundary:

| Category | Evidence |
| --- | --- |
| routing | Supported lifecycle, Draft exclusion, manual rerun, configurable event subset and per-PR concurrency |
| Goal Prompt | Trusted repository/PR/base/head binding, configurable Event Prompt, Completion Condition and separate Standards/Spec axes |
| mapping | Locked Codex Compatible Executor inputs, actual `final-message` output and explicit terminal mapping |
| runner and authentication | Review uses fixed `[self-hosted, Linux, X64, codex]` labels; route/publish remain isolated; no API-key input or direct runner CLI |
| Action and CLI pin | Immutable `tutar/codex-action` commit and explicit `codex-version: 0.153.4` |
| permissions | Read-only review job, isolated trusted scripts, no persisted Git credential and Checks-only trusted publisher |
| validation | Exact result structure, Profile/config contract, forbidden overrides and target binding |
| SHA freshness | Publisher rereads current PR head and rejects stale target artifacts |
| idempotency | Same-SHA reruns update one logical Check; new SHA creates a distinct Check |
| fail-closed | Action failure/cancellation, handoff, empty/malformed/missing/mismatched/spoofed output and incompatible configuration |

The gate also checks the complete copyable asset list, immutable maintained Action SHA/source ref/upstream base/patch identity, explicit CLI pin, frozen runner/authentication Profile, Candidate/Stable wording, release/Definition version separation, and continued presence of `github-pr-review/v0.1.0`, `v0.1.1` plus every `github-development-ticket` v0.1.x version.

## Evidence boundary

Eight additional production publisher regressions cover history hidden from latest, cross-page identity, same-identity duplicates, malformed history/identity fields, bounded incomplete pagination and head changes before write. The visibility fixture is adversarial, not an asserted replay of the unlogged creation-time API response. These checks prove local safeguards only. Bundle 6 remains FAIL; new Bundle 7 is NOT_FROZEN / NOT_RUN. This Candidate is prepared locally, not published, and is not Stable.

继承的回归直接读取 Workflow 交给 Action 的 `review-result.schema.json`，检查保守 Structured Outputs 子集；并在生产 capture 映射处覆盖可空输出与语义错误组合。该 guard 是离线契约检查，不是 API acceptance emulator。Bundle 5、Bundle 6 均保留 FAIL，新 Candidate 的真实 Consumer Cases 均为 NOT_RUN；当前仅 Draft PR 交付，尚未合并或发布。

These are local automated contract and static template tests. The controlled Agent Action is a Fake Action substitute; it is not evidence of real `tutar/codex-action`, runner, credential, network or Consumer Project compatibility. Agent final text is diagnostic input and is not publication or compatibility evidence. Passing this gate authorizes Candidate publication only.

Real Consumer Must-pass Cases and one frozen Evidence Bundle are required before Stable Promotion. Until then there is no Stable Supported Profile. Forks, shared runners, actors without write access, other runner labels, API-key authentication, direct CLI execution, dynamic Providers, private network dependencies, other Action revisions and modified mappings remain Not Yet Verified or outside this Definition.
