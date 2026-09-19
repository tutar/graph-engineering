# [项目 Workflow 接入恢复版 Agent Action](https://github.com/tutar/graph-engineering/issues/66) 验证报告

> 归档：此报告只描述当时实现与验证结果，不属于当前 Coding Task 的活动验收流程。

范围：[项目 Workflow 接入恢复版 Agent Action](https://github.com/tutar/graph-engineering/issues/66)。本报告记录 Candidate Definition（候选工作流定义）的本地与静态证据，不声明真实 Consumer Project（消费项目）已经验收或 Definition 已晋级 Stable。

## 当前 Workflow 盘点

`delivery/definitions.json` 与 `node scripts/verify-definition-delivery.mjs` 共同确认主分支只有一个当前 Workflow Task（工作流任务）：`workflow/.github/workflows/github-development-ticket.yml` 的 Development Task（研发实现任务）。PR Review 已退役，Repository Review 尚未实施；历史 Definition 只从固定 Git 引用取得，不在本票改写。

## 验收映射

1. **全部当前 codex-action Workflow 接入任务身份、持久目录和 rerun 恢复**：唯一当前 Workflow 以同一固定 Action revision 分别执行 `task-phase: prepare` 和 run；两次都使用 caller `task-id: development` 与 `${{ runner.tool_cache }}/graph-engineering/codex-task-state`。Task Invocation（任务调用）的完整身份由 Action 加入 repository、`run_id`、job 与 matrix，caller identity 不依赖 Issue，因而公开 step 契约覆盖无 Issue 的调用；本 Development 实例仍从 Issue 形成业务 Goal Prompt（目标提示）。
2. **保留既有接入与调度边界**：仍订阅 `issues: labeled` 和 `workflow_dispatch`，保留原 checkout revision、`development-ticket` / `in-progress` 标签处理、Issue 维度 concurrency 与 `cancel-in-progress: false`。没有新增排队、调度、远端任务记录或 `in-progress` 锁判断。
3. **Compatible Executor 保持薄映射**：Workflow 只传入 prompt、固定 CLI、permission profile、workspace、task identity 和 state root。Action 结束后，Harness（驾驭系统）继续核对工作树、远端分支及唯一 Draft PR；Action 不查询业务状态或推断 Acceptance Criteria 已满足。新 GitHub run 是新 Task Invocation，同一 run 的 rerun 延续原身份。
4. **不可变兼容组合与历史边界**：`delivery/definitions.json` 将当前 Candidate 记录为 `github-development-ticket/v0.2.0`，并以 `github-development-ticket/codex/v0.2.0` 集中绑定 Action、CLI、runner、permission profile 与持久目录；验证器再核对 Workflow 实际引用这些值。历史 `github-development-ticket/v0.1.2` 和已发布 Release/CLI 内容不变，旧 app-server Controller 仅从当前 Candidate 源移除。
5. **可复制 Candidate 与公开契约核验**：CLI 模板从唯一 `workflow/.github/` 源生成；打包测试把它安装到临时 Consumer，逐文件比对并重复运行只读 `check`。Workflow 契约测试核对两阶段固定 Action、固定 CLI、持久 workspace、现有触发/checkout/标签/并发与 Harness 交付检查。文档明确本地静态证据不等于真实 Consumer 验收。

## 已执行验证

- `node --test --test-concurrency=1 workflow/test/*.test.mjs`：2 个测试文件通过。
- `node --test packages/cli/test/*.test.mjs`：12 个 CLI 安装、迁移、检查与冲突用例通过。
- `node --test test/*.test.mjs`：5 个 Definition delivery、历史可取得性、打包及临时 Consumer 用例通过。
- `node scripts/verify-definition-delivery.mjs`：一个当前 Development 源、8 个历史发布 Definition、4 个 Evidence binding 全部可核验。
- `git diff --check`：通过。

上述检查不运行真实 GitHub Actions、不启动付费模型，也不验证 runner 登录、网络中断、session replacement 或同主机多 runner 行为；这些能力的 Action 实现证据属于固定 revision，其在本 Workflow Instance 中的真实运行仍需后续 Consumer Evidence Bundle。
