# github-pr-review v0.1.4 Consumer Evidence Bundle 6

> 归档：此文件只保留历史事实，不属于当前工作流的发布或验收流程。

- Evaluated: 2026-09-17 (Asia/Shanghai); runs span 2026-09-16–17.
- Gate Decision: FAIL — same-head logical Check uniqueness is contradicted.
- Definition remains Candidate; no Stable Supported Profile.
- [Pre-execution freeze](https://github.com/tutar/loop-engineering/issues/29#issuecomment-5698487064).
- [Consumer PR #4](https://github.com/tutar/loop-engineering-consumer-validation/pull/4).

## Frozen inputs

| Input | Value |
| --- | --- |
| Repository Release / Candidate merge | `v0.2.4` / `d41b988c5e93e2bb51a33b47d1f98a080af41edb` |
| Definition / Profile | `github-pr-review/v0.1.4` / `github-pr-review/codex/v0.1.4` |
| Agent Action / Codex CLI | `tutar/codex-action@f33581290086e62dc34d420a7f1862477fc2b503` / `0.153.4` |
| Consumer main, base and trusted control plane | `3c6334403c46180879bfe189b27f055bdde91b8c` |
| First reviewed head | `c2f486fc39caa363ba6d30d0be2688e15dd47907` |
| Second reviewed head | `363ad49a084bf1aab1cbaf3152f5da34f146b7de` |
| Identical base / both-head `.github` tree | `e814dfaa0d9b9b2c2be856925e83f451afe68150` |
| Profile SHA-256 | `983a6821f4e7b4643b0b7f79f9eeada418d6638200b75de2fb1a0bb4942a16ea` |
| Workflow SHA-256 | `6036cf09e6e5e02b9cb4336ecf1990bee454dd4cac2482cfa87bffd5bfa4b134` |
| Schema SHA-256 | `e9ccabe1b39445514888059bfad70019586419570abd7cc56537f6ee221ffd7b` |
| Runner | Dedicated repo-scoped `tutar-consumer-validation`, `2.337.0`, Linux/X64, `[self-hosted, Linux, X64, codex]` |
| Authentication | Runner default-home existing Codex login; no repository API key |
| Inputs | Empty model/effort; includeDrafts=false; manualDispatch=true; safetyStrategy=read-only; no permission-profile |

All 13 Consumer control files match Candidate assets byte-for-byte. The actual PR job graph is frozen in both heads, not merely checked out from the default branch. No frozen input changed during retries. Business tests are first head 4/4 and second head 5/5 PASS; these are not Agent Review evidence.

## Case Results

| Case | Expected | Observed | Assertions / Decision | Direct evidence |
| --- | --- | --- | --- | --- |
| 1. Draft manual dispatch | Draft does not start Goal or publish Review Check | route success; review/publish skipped; first-head named Check count 0 | Actual job conclusions and API count match: PASS | [Run 35103826926](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35103826926), [route](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35103826926/job/104819764999) |
| 2. First head ready_for_review | Real double-axis review; trusted result binds exact target; publish first-head Check | Codex CLI executed; capture and publisher success; Standards/Spec pass; one Check on first head | Trusted result repository/PR/base/head match freeze; runtime completed; Check external_id/head match: PASS | [Run 35103892314](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35103892314), [review](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35103892314/job/104820055251), [publish](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35103892314/job/104820897954), [Check 104820953530](https://github.com/tutar/loop-engineering-consumer-validation/runs/104820953530) |
| 3. Second head synchronize | New-head review binds current PR head; old-head Check stays on old commit | Attempt 1 failed on account usage limit, actual Action failure/empty output, publisher fail-closed; attempt 2 after quota recovery completed real review/publish for same frozen second head | Attempt 1: FAIL, retained. Attempt 2: target binding/current SHA PASS; old-head evidence retained. Attempt 2 created an additional same-identity Check, contradicting overall idempotency | [Attempt 1](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35104286354/attempts/1), [failed review](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35104286354/job/104821381325), [Attempt 2](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35104286354/attempts/2), [review](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35104286354/job/105016856282), [publish](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35104286354/job/105017460142) |
| 4. Second-head manual rerun | Successful fresh review updates one logical Check; no duplicates in complete API listing | First manual run after quota recovery created Check 105016714601; synchronize attempt 2 created 105017484118; final manual run successfully reused 105017484118, but both Checks remain | `filter=all` lists 2 same-name/head/external_id Checks, not 1. Reusing the latest ID does not restore uniqueness: FAIL | [Initial manual run 35162476962](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35162476962), [final manual run 35162988102](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35162988102), [final publish](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35162988102/job/105018301958), [Check 105016714601](https://github.com/tutar/loop-engineering-consumer-validation/runs/105016714601), [Check 105017484118](https://github.com/tutar/loop-engineering-consumer-validation/runs/105017484118) |

The sequence deviation is explicit: quota failure prevented original synchronize completion, so the first successful second-head Check came from a manual dispatch before synchronize attempt 2. The final manual dispatch follows that retry. This is one unchanged frozen Bundle, not a substitution from older versions. All failed attempts remain evidence; a green run is not a passing uniqueness assertion.

## Identity and audit

First head has one logical Check `104820953530`; second head has two `105016714601` and `105017484118`. All report Standards/Spec pass and correctly bind their own reviewed SHA. The two second-head Checks share:

```text
github-pr-review/v0.1.4:tutar/loop-engineering-consumer-validation:pull-request:4:363ad49a084bf1aab1cbaf3152f5da34f146b7de
```

Read-only uniqueness reproduction (assert exactly one named Check) returned `2 !== 1`. [Complete Check API](https://api.github.com/repos/tutar/loop-engineering-consumer-validation/commits/363ad49a084bf1aab1cbaf3152f5da34f146b7de/check-runs?filter=all&per_page=100) contains both IDs; `latest` contains only the newer one. [GitHub's filter contract](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference) does not promise logical-identity uniqueness. Replaying today's real query response through production matching selects PATCH; the exact query response at the duplicate-creation instant was not logged, so the creation-time visibility cause remains unproven.

Actual Action outcome was checked independently of continue-on-error's displayed step conclusion. Downloaded trusted result artifacts for first and second head contain matching repository, PR 4, frozen base/head, both axes and runtime completed. Usage failure preserved terminal failed and did not write a second-head Check at that moment. No account, model input, Action, CLI, permission or credential route was changed to bypass quota.

## Visibility, limitations and lifecycle

Runs, jobs, Checks, freeze and Consumer are public; GitHub may require sign-in for artifact download, and retention can expire. Downloaded artifacts were inspected locally; this manifest does not copy credentials or raw sensitive logs. The exact Check API is the authoritative uniqueness source, not only the latest UI view or local mocks.

Consumer Actions were disabled and the dedicated runner stopped after all runs terminated; PR #4 remains open and Ready on frozen second head. Repeated Checks are preserved, not deleted to manufacture a pass. No Consumer merge or Stable promotion occurred.

Bundles 1–5 remain historical and must not be spliced into this result. Optional tracing was not enabled and has no asserted successful failure-injection result here; trace-failure independence remains unverified. Untested forks, other/shared runners, network combinations, credentials and revisions inherit no support claim. New publication logic requires a new Candidate/Release and new frozen evidence, not patching Bundle 6 in place.
