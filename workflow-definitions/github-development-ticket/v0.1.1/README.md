# github-development-ticket v0.1.1 — Legacy Frozen

将同时带 `ready-for-agent` 与 `development-ticket` 标签的 Development Ticket（研发票据）交给 Codex Goal Runtime，由 Matt `$implement` Skill 完成实现、自测、review、commit、push 与 Draft PR。

这是可复制的 Workflow Definition（工作流定义），不是远程依赖。`files/` 中的路径与 Consumer Project（消费项目）仓库根目录相同；复制后形成由项目自行维护的 Workflow Instance（工作流实例）。

本版本属于 Legacy Frozen（旧版冻结）产品线：此前已经验证，继续可用并保留原文件与行为，只接受严重安全修复和事实纠正，不新增能力。

## 接入

1. 将 `files/.github/` 复制到项目根目录的 `.github/`。
2. 为仓库添加名为 `ready-for-agent`、`development-ticket` 和 `in-progress` 的标签。
3. 配置能够运行 `codex`、`gh` 和 Node.js 20+ 的持久化 self-hosted runner。
4. 确认 GitHub Actions 可以写入 contents、issues 与 pull requests，并允许 Actions 创建 Pull Request。
5. 根据项目实际情况修改 Workflow 中的 runner labels、默认分支、Git identity、超时和 token budget。
6. 创建至少包含业务目标与 Acceptance Criteria（验收条件）的 Issue，先添加 `ready-for-agent`，确认它是可直接实现的 Ticket 后，再手动添加 `development-ticket`。

也可以从 Actions 页面手动运行 Workflow，并提供 Issue number（Issue 编号）。

## 运行语义

一次运行只处理一个 Issue：

1. 新增 `development-ticket` 标签时，Workflow 验证 Issue 仍为 open 并同时具有 `ready-for-agent`；仅有 `ready-for-agent` 的 Spec 不会进入本 Workflow。
2. Workflow 以 `repository + issue_number` 作为 Ticket 身份，并用同一身份设置并发组。
3. Controller 只在该 Issue 的机器评论中查找 Thread Record（线程记录）。
4. 找不到记录时创建新 Thread，设置 Goal 后立即把 Thread ID 写回该 Issue。
5. 找到记录时只恢复该 Issue 对应的 Thread；若 Goal 已经 `complete`，直接成功结束，不再次激活。
6. Goal 成功后，Workflow 独立检查工作树、远端开发分支和 Draft PR 是否符合交付要求。

因此 Issue #1 已有 Thread 不会导致 Issue #2 被恢复：Issue #2 的评论中没有自己的 Thread Record，第一次运行一定创建新 Thread。

## Goal Prompt

Controller 只向 Loop Runtime 提供简洁目标：

> 使用 Matt Skill `$implement` 完成 `<issue-url>`；若 Issue 含 Acceptance Criteria，逐项依据实际验证结果，只将已满足项的复选框更新为已勾选；完成后将提交 push 到当前开发分支；如果不存在关联 PR，创建指向默认分支的 Draft PR。只有实现、自测、review、commit、push、Draft PR，以及适用时的验收条件状态同步都完成后才能结束 Goal。

Issue 内的业务目标与 Acceptance Criteria 属于业务对象和 Harness/Skill 输入，不复制进 Goal Prompt。

v0.1.1 保持 v0.1.0 的 Thread Record 格式；升级后的 Workflow Instance 会继续恢复已有 Ticket 的原 Thread。

## 停止与恢复

- 成功：Codex Goal 状态为 `complete`，并且 Workflow 的交付检查通过。
- 失败或阻塞：Codex Goal 进入非 `complete` 终态，Workflow 返回失败。
- 预算：默认累计 token budget 为 200,000；项目可修改。
- 时间：Job 默认最多运行 120 分钟。
- 中断：重新运行相同 Issue 时，从该 Issue 的 Thread Record 恢复 Goal。

v0.1.0 的恢复只在 Runner 能继续访问原 Codex Thread 存储时成立。当前实证覆盖同一持久化 self-hosted runner 上的 App Server 重启与额度中断恢复；多个彼此不共享 Codex Thread 存储的 Runner 不在本版本承诺范围内。

## 项目拥有的边界

复制后的项目负责：

- Issue 的业务目标、Acceptance Criteria 与项目上下文；
- runner、权限、分支命名、超时和预算；
- 对 Workflow Instance 的任何项目特有修改；
- required checks、review、merge 和后续发布流程。

本定义不会自动 approve、merge、deploy、跨仓库写入或动态提权，也不会绕过项目的 required checks。Harness 继续执行 sandbox 与权限边界。
