# Bundle 8 — Graph Engineering v0.3.0 Consumer validation

Gate Decision: IN_PROGRESS — no Stable promotion.

## Bundle 8 — v0.3.0 freeze (before verification)

All Cases NOT_RUN at this freeze. Bundle 7 remains historical FAIL; none of its results are reused.

- Source / Candidate: Repository Release `v0.3.0`, commit `049fdb6a98ab9867572637a5728f91f4683124ce`; current task `workflow-tasks/pr-review/files/.github/`, runtime Definition `github-pr-review/current`, Profile `github-pr-review/codex/current`.
- Actual installation: `npx --yes @tutar/graph-engineering@0.3.0 migrate --apply`.
- Exact npm integrity: `sha512-v3rFmD9JsU1UUx4MyV9MZM782wGHBRovUC1CPn1ZZlar830DGUDuu4Gm5La0VrQUdd2BW69oNBy8Tcr04Zh0vQ==`.
- Consumer remains private: `tutar/loop-engineering-consumer-validation`; control PR #7 merged. Base/default main `04b4f8940cca742684015c8a398790e6c3119eda`.
- Fresh business PR #8, Spec #1; first head `443e479198f8d8bd47d9fb416333d58f0bf013ea`; second head `c0e29e6657d51bebdb9363e4a82004e22ca77c82` created locally, not uploaded until synchronize.
- Base and both heads `.github` Git tree `c7cd78da4f74a8eee36efd147f5136c98a90c000`. All 13 template files match the published package and source; extra installation.json records new identity.
- Workflow SHA256 `196403810572c3b65d5bdddcaf279be09b4238e788e0108bcd464905a3e38390`; Profile SHA256 `a0d066306b89f9bb5831ef13e5f423b07983c020168d12e7a4ec75e3e73226d9`; schema SHA256 `e9ccabe1b39445514888059bfad70019586419570abd7cc56537f6ee221ffd7b`; installation SHA256 `7e212afe57737240d56a56ac3097107b4db214fc98e5a237107dc20c33fb7c9d`.
- New protocol directory `.github/graph-engineering`; trusted checkout `.graph-engineering-trusted`; publisher checkout `.graph-engineering-publisher`; Check name `Graph Engineering / PR Review`, title `PR Review`. External identity remains current Definition + exact Consumer repo/PR/head. `refs/graph-engineering` and development record kind `graph-engineering:github-development-ticket:v0.3.0` are frozen release protocol identities; this read-only PR Review task creates neither development refs nor Thread Records. Their absence is expected, not a claim of Development Task runtime validation.
- Action `tutar/codex-action@f33581290086e62dc34d420a7f1862477fc2b503`, upstream `openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e`; Action CLI `0.153.4`.
- Dedicated repository runner ID 4 `tutar-consumer-validation`, runner 2.337.0 Linux/X64 labels self-hosted/Linux/X64/codex. Existing default-home ChatGPT Codex login; explicit launcher `NODE_USE_ENV_PROXY=1`; inherited proxy endpoints/credentials not published; no API key or fallback.
- `includeDrafts=false`, `manualDispatch=true`, model/effort empty, safety read-only, no permission-profile; prompt `Review this change against the repository rules and its requested behavior.` Agent permissions contents/pull-requests/checks read; independent trusted publish job checks write using GITHUB_TOKEN. Optional tracing disabled.
- Source tests 83/83 PASS after prepack asset generation; business tests 4/4 then 5/5. Neither substitutes for real Consumer cases.

Case plan: (1) Draft manual, no Review/Check; (2) Ready first head, real Standards/Spec exact target and one Check; (3) synchronize frozen second head, new current conclusion with old history retained; (4) manual same head, same Check ID and full-history count=1; (5) native synchronize rerun, same identity count=1 after entire Workflow; (6) subsequent manual if prior unique-state prerequisite holds. Preserve duplicates on FAIL; full paginated filter=all audit, actual Action outcome and trusted artifacts authoritative. Each Case Expected/Observed/Assertions/PASS|FAIL|NOT_RUN/evidence recorded. No splicing; any changed combination requires a new bundle. No fork/other runner/shared runner/network/credential/revision inherits support. No Stable claim. Restore Actions disabled and runner stopped after terminal runs.

Tracing boundary: production differential regression can establish diagnostic-only Gate dependency; this freeze has no enabled external plugin and must not claim real exporter failure injection.


## Case Results

| Case | Expected | Observed | Assertions | Decision / evidence |
| --- | --- | --- | --- | --- |
| 1 Draft manual | route success, review/publish skipped; no target Check | matched expectation | named Check first-head count=0; second head not yet uploaded, no zero-count claim | PASS: [Run](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35191988739) |
| 2 Ready | real Action/CLI, Standards/Spec exact first head; one Check | Action outcome success, CLI 0.153.4; both axes pass; POST | exact target tuple; completed run; count=1, Check ID 105107438752 | PASS: [publisher job](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35192088302/job/105107408306), artifact 10484367353 |
| 3 synchronize | current conclusion bound to frozen second head; old history retained | Action outcome success, CLI 0.153.4; both axes pass | exact target tuple; new-head count=1, Check 105108650357; first-head Check 105107438752 retained | PASS: [publisher job](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35192450086/job/105108619028), artifact 10484278202 |
| 4 manual same SHA | same Check ID; full-history count=1 | attempt 1 reached the real review but external Codex usage limit ended the Action; trusted execution terminal=failed; publisher failed closed and wrote no Check | prior Check remains the only target identity; the stale prior `review-result.json` in the persistent workspace is not treated as this attempt's result | IN_PROGRESS: [failed attempt](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35192769552), artifact 10484721135; retry only after quota reset |
| 5 native rerun | same identity and ID after entire Workflow; count=1 | pending | pending | NOT_RUN |
| 6 final manual | retain unique Check after native rerun | pending | depends on Case 5 | NOT_RUN |

## Evidence visibility and boundaries

[Verification-before-execution freeze](https://github.com/tutar/graph-engineering/issues/29#issuecomment-5710321028). Consumer links require private repository access. Public manifest never copies business context, raw logs or credentials. Artifacts are checked before reruns and their trusted JSON retained privately; no attempt substitution. Bundle 7 remains a separate historical FAIL. Local tests require `node packages/cli/scripts/sync-package-assets.mjs` before CLI tests: the raw initial invocation lacked ignored prepack assets and failed three CLI tests; with correct preparation the full suite passed 83/83. This is build preparation, not a runtime fix or Consumer proof.

Case 4 attempt 1 is retained as an external-quota diagnostic rather than hidden: the Action log reports the usage limit and reset time, `review-execution.json` says `agent-action: execution ended with failure`, and the trusted publisher makes no write. Because the persistent runner workspace also contained a prior successful `review-result.json`, the execution terminal is authoritative and that stale file is explicitly rejected as attempt evidence. A later attempt may establish the planned Case only with a fresh real Action completion and the same frozen inputs; it cannot erase this diagnostic.
