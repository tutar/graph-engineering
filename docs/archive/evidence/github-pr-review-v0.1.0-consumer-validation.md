# github-pr-review v0.1.0 Consumer Validation Evidence Manifest

> 归档：此文件只保留历史事实，不属于当前工作流的发布或验收流程。

- Status: in progress; Candidate remains without a Stable Supported Profile.
- Consumer Project: [`nian1123/loop-engineering-consumer-validation`](https://github.com/nian1123/loop-engineering-consumer-validation)
- Consumer baseline: [`5234bc345ac76077ea3b21141f21a3d29e445ed4`](https://github.com/nian1123/loop-engineering-consumer-validation/commit/5234bc345ac76077ea3b21141f21a3d29e445ed4)

## Frozen combination

| Input | Frozen value |
| --- | --- |
| Candidate source | [`tutar/loop-engineering` `v0.2.0`](https://github.com/tutar/loop-engineering/releases/tag/v0.2.0), commit [`0c2e87a66e79e32213e2aa3d0207852340dbabe3`](https://github.com/tutar/loop-engineering/commit/0c2e87a66e79e32213e2aa3d0207852340dbabe3) |
| Definition | `github-pr-review/v0.1.0` |
| Compatibility Profile | `github-pr-review/codex/v0.1.0` |
| Agent Action | `openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e` (source tag `v1`) |
| Runner Profile | GitHub-hosted `ubuntu-24.04` |
| Permission / safety | `:read-only` / `read-only` |
| Event Prompt | `Review this change against the repository rules and its requested behavior.` |
| Consumer Workflow Instance digest | SHA-256 `85258029f84ddfa6fab6142fd8ef9b0170abfcc275327ee7543760a4eb59059e` |

The [Consumer verifier](https://github.com/nian1123/loop-engineering-consumer-validation/blob/main/validation/verify-evidence.mjs) rejects case aggregation if the copied `.github` Workflow Instance differs from this digest. A different Action revision, Profile, runner, mapping, or Workflow Instance starts a distinct evidence bundle.

## Case results

| Case | Expected and observed outcome | Decision | Evidence |
| --- | --- | --- | --- |
| Draft PR routing | A Draft `opened` event runs only the trusted router; review/publish remain skipped and no Candidate review Check is created. Observed exactly that behavior. | PASS | [Case Result](https://github.com/nian1123/loop-engineering-consumer-validation/blob/main/validation/cases/01-draft-routing.md), [Workflow run 34731120217](https://github.com/nian1123/loop-engineering-consumer-validation/actions/runs/34731120217), [PR #1](https://github.com/nian1123/loop-engineering-consumer-validation/pull/1) |
| Ready review, new SHA, same-SHA rerun | Not run: the Consumer repository has not yet configured the required `OPENAI_API_KEY` Actions secret. | NOT_RUN | [Issue #29 progress](https://github.com/tutar/loop-engineering/issues/29#issuecomment-5650010116) |

## Boundaries and limitations

Local static tests, a Fake Action, a workflow conclusion, and Agent final text are not compatibility evidence. The remaining Must-pass Cases must observe a real Consumer PR, GitHub-hosted runner, `openai/codex-action` invocation, two independent Standards/Spec results, and the trusted Check Run bound to the corresponding head SHA.

Forks, other runners, network-dependent review steps, altered Action revisions, altered mappings, and altered Profiles are Not Yet Verified and inherit no support claim. Optional tracing is diagnostic only and cannot change a Case Result or Gate Decision.
