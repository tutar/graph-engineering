# Bundle 6 本地准备清单

此文档保留准备时的历史草案；后续已发布 [冻结清单](https://github.com/tutar/loop-engineering/issues/29#issuecomment-5698487064)，实际执行结论以 [Bundle 6 结果](github-pr-review-v0.1.4-consumer-validation.md) 为准（FAIL），不得用本草案覆盖最终事实。

状态：DRAFT / NOT_FROZEN / NOT_RUN。此文档不是已执行的 Evidence Manifest（证据清单），不授权公开发布、合并、启动 runner 或 Actions。

## Candidate 输入

- 本地修复分支：`fix/issue-29-structured-output-schema`。
- 仓库 main 基线：`1b2a025dc42c912191c32e8269087f5cb160cd56`。
- 计划 Repository Release：`v0.2.4`；计划 Definition/Profile：`github-pr-review/v0.1.4` / `github-pr-review/codex/v0.1.4`。最终 merge SHA/tag 待授权交付后记录。
- Action：`tutar/codex-action@f33581290086e62dc34d420a7f1862477fc2b503`；Codex CLI：`0.153.4`。认证、权限、runner labels 不变。
- Profile SHA-256：`983a6821f4e7b4643b0b7f79f9eeada418d6638200b75de2fb1a0bb4942a16ea`。
- Workflow SHA-256：`6036cf09e6e5e02b9cb4336ecf1990bee454dd4cac2482cfa87bffd5bfa4b134`。
- Schema SHA-256：`e9ccabe1b39445514888059bfad70019586419570abd7cc56537f6ee221ffd7b`。
- 配置：model/effort 空、includeDrafts=false、manualDispatch=true、safetyStrategy=read-only；不传 permission-profile 或 repository API key。

## Consumer 准备顺序（尚未执行）

1. 授权交付新 Candidate 后，在 Actions 保持暂停、runner 停止时，将完整 `.github/` 复制到 Consumer main。当前只读核验 main 为 `cbdd7acd6fcf6a6faab203ee73fc15e12988a736`，执行前必须再次核验。
2. 从更新后的 Consumer main 创建新 `validation/bundle-6-greeting` 分支和新 Draft PR；移植冻结的第一、第二业务改动，而非复用含旧控制文件的 PR head。
3. 记录最终 Consumer main SHA、PR、两个实际 head SHA、base/两个 head 的 `.github` Git tree 以及完整文件散列。三份控制文件必须完全一致；不能仅依赖默认分支 checkout。
4. 公开完整冻结清单并获得执行授权后才启动专用 runner、启用 Actions、执行四个 Case。执行期间不修改任何冻结输入。

## 必跑结果（全部 NOT_RUN）

| Case | 预期与断言 | 当前结果 |
| --- | --- | --- |
| Draft 人工 dispatch | route 排除 Draft；review/publish 跳过；两个 head 上无目标 Review Check | NOT_RUN |
| 第一 head Ready | 真实 Action/Codex 成功；结构化双轴完整、绑定可信 repository/PR/base/head；独立 publisher 创建有效第一 head Check | NOT_RUN |
| 第二提交 synchronize | 形成全新 Goal；真实 review 成功；第二 head 创建独立 Check，第一 head Check 保留 | NOT_RUN |
| 第二 head 人工 dispatch | 使用当前可信 PR facts；真实 review 成功；更新同一个逻辑 Check，无重复 Check | NOT_RUN |

每项记录 Expected、Observed、Assertions、PASS/FAIL/NOT_RUN、run/job/Check 链接；Action outcome 必须从真实 outcome 核验，不能以 continue-on-error 步骤显示的 success 替代。结束后恢复暂停状态。

## 证据边界

[Bundle 5 结果](https://github.com/tutar/loop-engineering/issues/29#issuecomment-5696742062) 仍为 FAIL；本清单不修订或拼接旧结果。schema guard 仅检查保守官方子集，不模拟真实 Responses API。新版本必须重新完成全部 Consumer Case；静态测试不代表 API 接受、双轴 Review 完成、Check 发布或 Stable 晋级。

根因与修复依据：[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) 的根 object、全部字段 required、可空字段和 additionalProperties=false 限制，以及 Bundle 5 实际 `oneOf` 拒绝。互斥和目标校验仍由可信 capture 持有；可空 schema 不是放宽业务验收。
