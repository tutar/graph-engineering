# 当前 PR Review Task

这是主分支中持续演进的 PR Review Task（PR 审查任务）。将 `files/.github/` 整体复制到 Consumer Project（消费项目）后，Consumer 自行拥有和维护这些普通文件；运行时不访问 `graph-engineering`，也不调用远程 Reusable Workflow（可复用工作流）。

它处理非 Draft PR 的 `opened`、`reopened`、`synchronize`、`ready_for_review` 事件，并提供人工 rerun。Draft 默认静默。review job 只读目标代码和 PR，由 Agent 分别输出 Standards（规范）与 Spec（规格）两轴结果；只有独立的可信 publish job 能写 Check Run。

## 安装

在 Consumer Project 根目录执行：

```bash
npx --yes @tutar/graph-engineering@0.3.0 init pr-review
```

CLI 会安装 `files/.github/` 中的项目自有文件、记录来源并运行检查。随后按 `ACTION REQUIRED` 准备 `code-review` Skill、带 `[self-hosted, Linux, X64, codex]` labels 且 Actions 服务用户已有 Codex 登录状态的专用 runner，并保留项目自己的规范与规格来源。只在 `.github/graph-engineering/pr-review-config.json` 的公开配置边界内调整事件、Event Prompt、model/effort 和 Check 展示文本。

重复检查而不修改文件：

```bash
npx --yes @tutar/graph-engineering@0.3.0 check pr-review
```

Compatibility Profile（兼容配置）继续锁定 `tutar/codex-action@f33581290086e62dc34d420a7f1862477fc2b503` 和 Codex CLI `0.153.4`。配置或 Profile 不匹配、Agent 输出缺失或畸形、目标 SHA 变化、Check 历史重复或畸形时均闭锁失败且不发布。

发布器以 `filter=all` 分页读取目标 head 的完整 Check 历史，最多读取 100 页。它按 head SHA、Check name 和 external identity 精确匹配：零条创建，一条更新，多条或历史畸形则失败。历史读取完成后再次读取当前 PR head，只有目标仍未变化才写入；日志只记录发布方法、已有 Check ID、external identity 和历史条目数。

## 验证和证据边界

```bash
node --test --test-concurrency=1 workflow-tasks/pr-review/test/*.test.mjs
```

测试从当前目录直接执行当前生产文件，不读取历史版本源码。它们覆盖事件路由、Draft、人工入口、Goal、双轴输出、权限、固定 Action/CLI、fail-closed、Fresh Goal Run、并发和 Check 历史协调。

`v0.3.0` 的新组合冻结及实际 Case 见 [Bundle 8](../../docs/evidence/bundle-8-graph-engineering-v0.3.0-consumer-validation.md)。它不继承迁名前 Bundle 7 的结果，也不凭产品迁名获得 Stable 支持。历史 Release 与对应 Evidence 从 [`delivery/definitions.json`](../../delivery/definitions.json) 和 [Workflow Definition 交付契约](../../docs/definition-delivery.md) 定位；历史 FAIL 不能作为当前实现的通过证据。
