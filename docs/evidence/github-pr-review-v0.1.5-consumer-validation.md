# github-pr-review v0.1.5 Consumer Evidence Bundle 7

Gate Decision: FAIL — native synchronize rerun contradicts same-head Check uniqueness. No Stable promotion.

Recorded before enabling Actions or executing any Bundle 7 Case. Authorized by the repository owner on 2026-09-17. Consumer remains private; links require repository access. Bundles 1–6 remain historical partial/FAIL evidence and are not spliced into this bundle.

## Candidate delivery and source identities

- Repository Release: https://github.com/tutar/loop-engineering/releases/tag/v0.2.5
- Candidate / verified tag commit: `927bd96156f750546019581b653b7601db9c71c8`.
- Workflow Definition delivery identity: `github-pr-review/v0.1.5`.
- Source and installation path: `workflow-tasks/pr-review/files/.github/`.
- Runtime source Definition/Profile: `github-pr-review/current` / `github-pr-review/codex/current`, executor version `current`. Immutable tag/commit and copied assets, not a versioned directory, freeze this exact combination.
- Action: `tutar/codex-action@f33581290086e62dc34d420a7f1862477fc2b503`; upstream `openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e`; runner-login/no-proxy patch unchanged.
- Action-installed Codex CLI: `0.153.4`.

## Consumer and target

- Consumer: https://github.com/tutar/loop-engineering-consumer-validation (private).
- Control-plane upgrade: https://github.com/tutar/loop-engineering-consumer-validation/pull/5 (merged).
- Consumer default branch / base / trusted controls: `f15d91f2f61cebd93a2fdfea20400c082321bf91`.
- New business PR: https://github.com/tutar/loop-engineering-consumer-validation/pull/6 ; Spec https://github.com/tutar/loop-engineering-consumer-validation/issues/1 .
- First head (remote Draft): `f9b00040854fb1f77fdd2781a39ea4bcb0a4964e`.
- Frozen second head (created locally; not pushed until synchronize Case): `44b3ed211c05fe7bf8be73ef6293c79ec3532df1`.
- Base and both heads have identical `.github` Git tree `1351da1bd2d2144c1ee2019de5871387abeb8321`; all 13 controls match Candidate assets byte-for-byte.
- Workflow SHA-256: `6036cf09e6e5e02b9cb4336ecf1990bee454dd4cac2482cfa87bffd5bfa4b134`.
- Profile SHA-256: `a0d066306b89f9bb5831ef13e5f423b07983c020168d12e7a4ec75e3e73226d9`.
- Schema SHA-256: `e9ccabe1b39445514888059bfad70019586419570abd7cc56537f6ee221ffd7b`.

## Runner, permissions and inputs

Registry freeze labels: `Dedicated private repository runner 2.337.0 Linux/X64 codex; NODE_USE_ENV_PROXY=1`; `Existing default-home Codex login; CLI 0.153.4; no repository API key`; modelAndEffort `empty`.

- Dedicated repository-scoped runner ID `4`, name `tutar-consumer-validation`, version `2.337.0`, Linux/X64, labels `[self-hosted, Linux, X64, codex]`.
- Only review runs self-hosted; route and publisher use `ubuntu-24.04`.
- Existing default-home Codex login, no repository API key, no credential/provider fallback.
- Inherited runner network proxy; Node environment-proxy transport enabled with `NODE_USE_ENV_PROXY=1` for trusted adapters. Proxy endpoints/credentials are not published.
- `includeDrafts=false`, `manualDispatch=true`; model and effort empty; `safetyStrategy=read-only`; no permission-profile input.
- Event Prompt: `Review this change against the repository rules and its requested behavior.`
- Check name: `Loop Engineering / PR Review`; title `PR Review`.
- Review permissions: contents/pull-requests/checks read; only independent publisher gets checks write.
- Optional tracing disabled and not a Gate input. No trace-failure injection result is asserted by this freeze.
- Business tests: first head 4/4 PASS, second head 5/5 PASS; current-layout source tests 73/73 PASS. These are not Consumer Review proof.

## Frozen Case plan — all NOT_RUN at freeze time

1. Draft manual dispatch at first head: route success, review/publish skipped, zero named Checks on both target heads.
2. First-head ready_for_review: actual fixed Action/Codex succeeds; trusted artifact has Standards/Spec and exact repository/PR/base/head; publisher creates one exact-identity Check.
3. Push the frozen second head to trigger synchronize: fresh real review binds current head; exactly one new-head Check; first-head Check retained.
4. Second-head manual dispatch: fresh review updates that same logical Check ID; complete `filter=all` listing has one match.
5. Rerun original synchronize Workflow Run, then another manual dispatch: preserve same Check ID after both; cover cross-event/attempt interaction from Bundle 6.

Each Case must record Expected, Observed, Assertions, PASS/FAIL/NOT_RUN and direct run/job/Check/artifact evidence. Actual Action outcome, not continue-on-error's displayed success, is authoritative. Listing uses all pages and `filter=all`; duplicate Checks are never deleted to manufacture a PASS. Any frozen input change requires a new bundle and complete relevant reruns. No fork, other/shared runner, network/credential combination or other revision inherits support. No Stable promotion in this ticket. Restore Actions disabled and runner stopped after terminal runs.

## 冻结修订与当前结果

- [完整冻结](https://github.com/tutar/loop-engineering/issues/29#issuecomment-5708708149)。
- [最终冻结修订 2](https://github.com/tutar/loop-engineering/issues/29#issuecomment-5708727965)：启动环境预检后显式设置 Node proxy 标志，修订前 Draft 预检不计入最终 Case aggregation。
- 修订前 Draft 预检 Run `35183110266` 保留为诊断事实，不与最终结果拼接。
- 最终 Draft Run `35183179100`：route success，review/publish skipped，第一 head 上目标 Check 数 0，PASS。
- 首次 Ready Run `35183222221`：真实 CLI `0.153.4`、实际 Action outcome success；可信结果绑定冻结 repository/PR/base/head，两轴 pass，唯一 Check `105080220085`，PASS。artifact `10480663906` 已下载并检查。
- 第二 head synchronize Run `35183495138`：真实 CLI `0.153.4`、实际 Action outcome success；双轴 pass、绑定第二 head，完整历史只包含一个目标 Check `105081063027`，第一 head Check `105080220085` 保留，PASS。artifact `10480174851` 已下载并检查。
- 同 SHA 人工 Run `35183718346`：真实双轴 pass、精确 target binding，目标 Check ID 保持 `105081063027`，完整历史中唯一；第一 head Check ID 保持 `105080220085`，PASS。artifact `10480424615` 已下载并检查。
- 原 synchronize Run `35183495138` 的 attempt 2：真实 Review 和 trusted publisher job 成功；publisher 审计日志为 PATCH `105081063027`、historyCount=1。但整个 Workflow 结束后，完整 Check API 含 `105081063027` 和 `105082182854` 两条同 head/name/external_id 记录，唯一性断言 `2 !== 1`，FAIL。新 artifact `10481432305` 已下载，双轴 pass、target 精确匹配；这些成功不能覆盖幂等失败。
- 最终计划人工 dispatch：NOT_RUN，因上一步唯一性前提已被真实证据否定。没有删除重复 Check，没有 Stable 晋级，也没有“验收完成”实现 PR。

## Case Results（最终聚合）

以下唯一性均在整个 Workflow 结束后，以 `filter=all` 的完整 Check 历史断言；不是仅查看 latest。成功 Review 不覆盖失败 Effect。

| Case | Expected | Observed | Assertions | Decision / evidence |
| --- | --- | --- | --- | --- |
| 1 Draft | 不启动 Review、不发布 Check | route success；review/publish skipped | 首 head 目标 Check count=0；尚未上传的第二 head 不作零计数断言 | PASS：[Run](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35183179100) |
| 2 Ready | 真实两轴结果精确绑定首 head，单一 Check | Action outcome success，CLI 0.153.4，两轴 pass | target tuple 匹配；count=1，ID 105080220085 | PASS：[publisher job](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35183222221/job/105080195559)；artifact 10480663906 |
| 3 synchronize | 新 head 是当前结论，保留旧 head 历史 | 两轴 pass；创建 105081063027 | 新 head count=1；旧 ID 105080220085 不变；target tuple 匹配 | PASS：[publisher job](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35183495138/job/105081038351)；artifact 10480174851（已归档） |
| 4 manual 同 SHA | 更新同一 Check，无重复 | PATCH 105081063027，historyCount=1 | 完整历史 count=1；同 ID；旧 head 不变；target tuple 匹配 | PASS：[publisher job](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35183718346/job/105081604159)；artifact 10480424615 |
| 5 native rerun | 同 SHA、同 ID，完整历史 count=1 | publisher PATCH 原 ID，但整个 run 结束后出现 105082182854 | 实际 count=2，唯一性断言失败；两轴 pass 不能覆盖 | FAIL：[attempt 2 publisher](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35183495138/job/105082142260)；artifact 10481432305 |
| 6 后续 manual | native rerun 保持唯一后，再验证人工重跑 | 前置 Case 5 已失败，未执行 | 不删除重复记录、不用后续运行替代失败 | NOT_RUN：[失败前置 attempt](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35183495138/attempts/2) |

## 最小诊断与下一步权限边界

独立诊断 branch `diagnostic/issue-29-check-api-alternatives`、commit `13c49c3f34f31132b9b857609128658d504d86de` 的唯一命名探针不执行 Codex，也不计入上表。[Run 35184940170](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35184940170) attempt 1 创建 Check `105084883562`；[attempt 2 job](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35184940170/job/105085116035) 明确记录 `NO_WRITE`，之前仅有该 ID。然而 Workflow 完成后，同 suite `95286735198`、name/head/external_id 出现第二个 ID `105085135611`。这将问题缩小到 GitHub Actions 所属 suite 的 native rerun 生命周期，而不是 publisher 重复 POST。

REST 新版本更新与 GraphQL updateCheckRun 也返回原 ID，却未阻止观察到的 Workflow 结束后复制；分别见 [REST probe](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35184572978) 与 [GraphQL probe](https://github.com/tutar/loop-engineering-consumer-validation/actions/runs/35184571347)。不声称对所有 GitHub suite 的通用保证。

下一方案是隔离 GitHub Actions suite 的专用 GitHub App publisher；这尚未实现或验证，需新的凭据/安装授权、新 Candidate 和完整新 Bundle，不修改 Bundle 7 冻结记录来制造通过。Codex runner 登录路线无需随之改变。终止验证后已核实 Consumer Actions `enabled=false`、专用 runner `offline` 且 `busy=false`。

## Artifact 可见性与保管（归档）

原 synchronize attempt-1 artifact `10480174851` 在重跑前已下载和核验，native rerun 后旧 ID 返回 404。原始三份可信 JSON 已 byte-for-byte 保存到私有 Consumer 的独立证据分支，连同 Ready、人工重跑与 synchronize attempt-2 的结果一起归档：[固定 commit df6a887](https://github.com/tutar/loop-engineering-consumer-validation/tree/df6a8870ccfd7de03a8fba2ed7fbfbade372f2b7/validation/bundle7)。这不是用新 attempt 重建旧结果，也不是改动冻结的 main/业务 branch；公开本清单不复制私有代码、context、原始日志或凭据。

GitHub run/job/Check 链接和私有归档要求 Consumer 访问权限；artifact 下载还受 retention 和 rerun 可见性影响。归档是操作者保存的实际下载快照，应与源 run/attempt/job 日志和可信绑定交叉核验，不虚构 GitHub 对归档 commit 的认证。

## tracing 与支持边界

本冻结组合未启用 tracing；生产 Gate 只依据完成的可信目标和 Standards/Spec 裁决，诊断摘要中的 trace failure 不会改变或掩盖双轴结果（生产函数差分回归 PASS）。这不是外部 tracing plugin/exporter 的故障注入，不能扩展为已验证的 tracing 集成支持声明。

当前实现没有 Stable Supported Profile。forks、其他/共享 runners、网络/凭据/其他 revisions 不继承支持；诊断探针在明确命名的独立 branch/SHA/Check 上运行，不包含 Codex，不计入 Bundle 7 Case Results。
