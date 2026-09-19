# github-pr-review v0.1.1 Consumer validation

> 归档：此文件只保留历史事实，不属于当前工作流的发布或验收流程。

## Frozen combination

| Field | Value |
| --- | --- |
| Repository Release | `v0.2.1` |
| Workflow Definition | `github-pr-review/v0.1.1` |
| Compatibility Profile | `github-pr-review/codex/v0.1.1` |
| Candidate commit | `25d122696d96d0e71e4ae47c88da1071b85a7c19` |
| Agent Action | `openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e` |
| Codex CLI | `0.153.4` |
| Consumer | `tutar/loop-engineering-consumer-validation` |
| Consumer PR/head | PR #2 / `cedca3ec607fe7e7256ce5971f67b9827b8691fe` |
| Runner labels | `[self-hosted, Linux, X64, codex]` |

## Gate Decision: FAIL

Draft routing passed, but ready review run [`35081359069`](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35081359069) failed before `codex exec`. With no `openai-api-key`, the Action did not start its Responses API proxy and therefore did not create `$CODEX_HOME/$GITHUB_RUN_ID.json`; its `Read server info` step nevertheless attempted to read that file and failed. The trusted publisher failed closed and did not publish a successful review Check.

| Case | Decision | Evidence |
| --- | --- | --- |
| Draft PR does not start review Goal | PASS | [Run 35081321891](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35081321891) |
| Ready PR produces Standards and Spec review | FAIL | [Review job 104745912803](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35081359069/job/104745912803) |
| New SHA becomes current conclusion | NOT_RUN | Blocked by ready review failure |
| Same-SHA rerun converges on one Check | NOT_RUN | Blocked by ready review failure |

The exact diagnosis and safe stop are recorded in [Issue #29](https://github.com/tutar/loop-engineering/issues/29#issuecomment-5695520116). This Evidence Bundle disproves the frozen combination's runner-login compatibility. It must not be spliced into `github-pr-review/v0.1.2` or any later Evidence Bundle.
