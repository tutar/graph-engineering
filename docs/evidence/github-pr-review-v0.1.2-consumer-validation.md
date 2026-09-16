# github-pr-review v0.1.2 Consumer validation

## Gate Decision: FAIL

Evidence Bundle 3 froze Repository Release `v0.2.2`, Workflow Definition `github-pr-review/v0.1.2`, maintained Action `tutar/codex-action@f33581290086e62dc34d420a7f1862477fc2b503`, Consumer control-plane commit `f52737ebde5f0d116fafc7f74881c7a79c2574cf` and PR #2 head `cedca3ec607fe7e7256ce5971f67b9827b8691fe`.

[Run 35086208140](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35086208140) failed the first Case:

- Manual dispatch started review while PR #2 was Draft, contrary to `includeDrafts=false`.
- The maintained Action correctly skipped proxy server-info on the no-key path.
- Execution then failed because the Profile supplied both `permission-profile: :read-only` and `safety-strategy: read-only`, an Action-rejected combination.
- Trusted capture and publish failed closed; no successful Candidate Check was published.

The remaining ready/new-SHA/same-SHA Cases were `NOT_RUN`. Full freeze and result details are in [Issue #29](https://github.com/tutar/loop-engineering/issues/29#issuecomment-5696174583). This bundle must not be spliced into later evidence.
