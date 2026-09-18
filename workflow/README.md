# 当前 Development Task

将同时带 `ready-for-agent` 与 `development-ticket` 标签的 Development Ticket（研发票据）交给 Codex，由 Matt `$implement` Skill 完成实现、自测、review、commit、push 与 Draft PR。

这是主分支持续维护、可整体复制的 `github-development-ticket/v0.2.0` Candidate Definition（候选工作流定义），其 Compatibility Profile（兼容配置）身份为 `github-development-ticket/codex/v0.2.0`。权威绑定记录位于 `delivery/definitions.json`。它尚未经过真实 Consumer Project（消费项目）的完整运行验收，不是 Stable Definition（稳定工作流定义）。已发布且验证过的 `github-development-ticket/v0.1.2` 继续作为 Legacy Frozen Definition（旧版冻结定义）从 Git tag `0.1.2` 取得；本目录不会回写其内容或继承其证据。

## 精确兼容组合

- Agent Action（智能体 Action）：`tutar/codex-action@393ad456e354dc9da7be630c09be243cc1d212af`
- Codex CLI：`0.153.4`
- runner：持久化 self-hosted Linux X64，具备 `flock`、Git、GitHub CLI 与 Action 所需的 passwordless sudo / util-linux 隔离能力
- 认证：Runner-backed Codex Authentication（Runner 承载的 Codex 认证），受信配置来源为 runner 的 Codex home
- Action permission profile：`:workspace`
- Task state root：`${{ runner.tool_cache }}/graph-engineering/codex-task-state`，位于 checkout 外，不得作为 artifact 上传

Action revision 或 CLI 版本变化会产生新的 Compatibility Profile（兼容配置），必须重新进行 Candidate 静态核验与 Consumer 验收。

## 接入

按[仓库接入说明](../README.md#接入)用本分支本地打包的 CLI 安装整套 `.github/` 文件，然后创建 `ready-for-agent`、`development-ticket` 和 `in-progress` 标签。配置满足上述组合的 runner，并确认 Actions 可以写 contents、issues 与 pull requests。

```bash
graph-engineering init
graph-engineering check
```

创建包含业务目标与 Acceptance Criteria（验收条件）的 open Issue，先添加 `ready-for-agent`，确认可直接实现后再添加 `development-ticket`。也可以从 Actions 页面输入 Issue number 手动启动。现有 Issue 事件订阅、人工入口、checkout、标签与并发组保持不变；`in-progress` 仅是 Operational Label（运行态标签），不是锁或队列。

## Task Invocation 与恢复

Workflow 用同一个公开 Action step 契约完成准备和执行：

1. `task-phase: prepare` 以 caller `task-id: development` 和持久目录定位 Task Invocation（任务调用）。
2. 首次执行才 checkout 和准备 `agent/issue-<number>` 分支；Action 将仓库复制到隔离持久 workspace。
3. 执行调用把 Goal Prompt（目标提示）、固定 CLI、permission profile 与 workspace 映射给 Action。
4. 同一 GitHub run 的显式 rerun 延续同一 Task Invocation；`run_attempt` 只是尝试元数据。新 run、新 job、不同 caller task 或 matrix 是新身份。身份不依赖 Issue，所以相同 Action 契约也适用于没有 Issue 的 PR、command 或 scheduled Workflow。
5. 本地 session 缺失、损坏或无法加载时，Action 可见地执行 Session Replacement（会话替换）；网络、配额、认证和普通失败不会触发替换。
6. Action 成功只表示调用完成。Harness（驾驭系统）随后独立核对干净工作树、远端目标分支和唯一 open Draft PR，再移除 `development-ticket` 与 `in-progress`。

Compatible Executor（兼容执行器）只映射输入与输出，不读取 Issue/PR/branch 来猜测业务完成，不实现 Goal 循环、远端任务记录、自动重试、队列或调度。换 runner 后本地记录不可取得时允许从 GitHub 持久事实重新执行；不迁移 session/workspace，也不承诺 exactly-once 副作用。

## 操作边界

- 不要上传 task state root、整个 Codex home、认证文件或原生 session。
- 多个 runner 实例可以共享主机，但每个已注册实例仍由 GitHub 调度；Action 的本地锁不把 `in-progress` 变成分布式锁。
- Consumer 负责依赖安装、额外网络/权限、required checks、review、merge 与发布。
- Definition 不自动 approve、merge、deploy、跨仓库写入或修改 GitHub Settings。
- 从历史 app-server Workflow 升级不会迁移 Thread Record、旧 Controller 状态或中断 refs；先完成当前运行，再显式安装本 Candidate。

## 静态验证

```bash
node --test --test-concurrency=1 workflow/test/*.test.mjs
node scripts/verify-definition-delivery.mjs
```

这些检查证明当前文件可复制、固定契约完整且 CLI 能安装/检查；它们不启动付费模型、不验证真实 runner/认证/网络，也不得用来声明 Consumer 已验收或 Stable 晋级。
