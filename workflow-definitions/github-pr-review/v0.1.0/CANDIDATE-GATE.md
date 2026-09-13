# github-pr-review v0.1.0 Candidate Publication Gate

- Evaluated: 2026-09-12
- Definition: `github-pr-review/v0.1.0`
- Repository release: `v0.2.0`
- Gate Decision: PASS — Candidate only
- Stable status: no Stable Supported Profile

## Automated contract evidence

Run from the repository root:

```bash
node --test workflow-definitions/github-pr-review/v0.1.0/test/*.test.mjs
```

The suite verifies these publication categories at the Workflow Instance boundary:

| Category | Evidence |
| --- | --- |
| routing | Supported lifecycle, Draft exclusion, manual rerun, configurable event subset and per-PR concurrency |
| Goal Prompt | Trusted repository/PR/base/head binding, configurable Event Prompt, Completion Condition and separate Standards/Spec axes |
| mapping | Locked Codex Compatible Executor inputs, actual `final-message` output and explicit terminal mapping |
| permissions | Read-only review job, isolated trusted scripts, no persisted Git credential and Checks-only trusted publisher |
| validation | Exact result structure, Profile/config contract, forbidden overrides and target binding |
| SHA freshness | Publisher rereads current PR head and rejects stale target artifacts |
| idempotency | Same-SHA reruns update one logical Check; new SHA creates a distinct Check |
| fail-closed | Action failure/cancellation, handoff, empty/malformed/missing/mismatched/spoofed output and incompatible configuration |

The gate also checks the complete copyable asset list, immutable Action SHA/source tag, Candidate/Stable wording, release/Definition version separation, and continued presence of every `github-development-ticket` v0.1.x version.

## Evidence boundary

These are local automated contract and static template tests. The controlled Agent Action is a Fake Action substitute; it is not evidence of real `openai/codex-action`, runner, credential, network or Consumer Project compatibility. Agent final text is diagnostic input and is not publication or compatibility evidence. Passing this gate authorizes Candidate publication only.

Real Consumer Must-pass Cases and one frozen Evidence Bundle are required before Stable Promotion. Until then there is no Stable Supported Profile, and forks, private network dependencies, other runners, other Action revisions and modified mappings remain Not Yet Verified.
