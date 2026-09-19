# Bundle 7 本地准备（NOT_FROZEN / NOT_RUN）

> 归档：此文件只保留历史事实，不属于当前工作流的发布或验收流程。

针对 Bundle 6 实际两个同身份 Check 的失败证据，记录后续修复与重新验证所需工作。新的 Definition、Profile、Repository Release、Consumer PR、commit/head SHA 与 Case Result 均未分配或冻结；PR #46 只是修复来源，不是待发布 Candidate。不得改变已冻结 Bundle 6 或删除重复 Check 来制造通过。

## 已完成的本地保障

- 生产 publisher 查询 `filter=all` 并分页完成后按精确 head / name / external_id 匹配；0 个创建，1 个更新，多个匹配诊断失败且零写入。
- 后页匹配不会误判缺失；畸形列表、坏/重复 ID、100 页上限均失败隔离，不依据截断列表创建 Check。
- 多页查询后再次读取可信当前 PR head；SHA 变化禁止发布。
- 发布日志仅记录 method、已有 Check ID、external_id 和历史条目数，不记录凭据、headers 或原始 Agent 内容。
- 八项生产 publisher 新回归先验证红色失败，再修复转绿；新 Candidate 49/49 PASS，六版回归 231/231 PASS。未改变旧版可复制运行文件。

可见性 fixture 是明确的对抗输入，并非 Bundle 6 未记录的创建瞬间 GITHUB_TOKEN 响应的真实重放。旧版当前 API 响应的匹配函数本来就能选择 PATCH；真实重复创建瞬间的细节仍未完全证实。本地测试不能据此宣称真实问题已解决。

## 必须重新冻结与执行

1. 当前任务布局中的替代实现完成并获得远端交付授权后，才为新 Candidate 分配并冻结 Definition/Profile/Release 身份、merge/tag、Action SHA、CLI、runner 版本、配置与资产 hashes。认证、Model 输入与权限不能因额度不足而切换。
2. Actions 暂停、runner 停止时更新完整 Consumer main 控制文件；从新 main 创建全新业务分支和 Draft PR，产生两个实际 head。
3. 核验 base 和两个 head 的 `.github` tree 完全一致，再公开最终冻结清单；当前不填写虚构 SHA、PR 或 run。
4. 跑 Draft 人工 dispatch、第一 head Ready、第二 head synchronize、第二 head 人工重跑四项；全部真实 Case 目前 NOT_RUN。
5. 额外重跑成功的原 synchronize Workflow Run，再人工 dispatch 同一 head，覆盖 Bundle 6 出现的跨事件/attempt 组合。每次发布前后都用 `filter=all` 检查唯一 ID，不仅看 latest 或绿色 run。
6. 核验新 SHA Check 与旧 SHA Check 独立、历史保留且当前 PR 只采用当前 head。核验手动和事件 rerun 均复用当前 head 的一个逻辑 Check。
7. 原始失败与所有 retry 单独记录；配置未改且身份一致才能属于同一 Bundle。任一更改产生新冻结组合，不拼接旧结果。
8. 结束后恢复 Actions 暂停、专用 runner 停止；新的 Evidence Manifest 记录 Expected、Observed、Assertions、PASS/FAIL/NOT_RUN 和直接 run/job/Check 链接。

## 未完成边界

Bundle 6 完整结果已获授权并[公开到 Issue #29](https://github.com/tutar/loop-engineering/issues/29#issuecomment-5706374180)，结论仍为 FAIL。Issue #29 未因本地保障而宣告完成，尚未勾选幂等验收，也不创建“验收已完成”PR。可选 tracing 失败独立性尚无直接 failure-injection 证据，不把未启用 tracing 伪装为该测试通过。未验证 forks、共享/其他 runners、网络、凭据与 revisions 不继承支持声明；没有 Stable Supported Profile。
