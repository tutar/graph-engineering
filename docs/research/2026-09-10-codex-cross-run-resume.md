# Codex 跨 GitHub Workflow Run 恢复可行性调研

> 研究快照：2026-09-10。Codex 源码核对到 `openai/codex@713caa89f389acd9cbcd77016edbb607273826af`；`openai/codex-action@v1` 核对到 `86365089eb2b84e0a8fb0717b304f8bdcb13b20e`。本文没有执行真实的跨 Runner 重启实验。

## 结论

技术上可以让 Codex 的同一 Session（会话）跨 GitHub Workflow Run（工作流运行）继续，但 **`openai/codex-action@v1` 本身不足以实现该能力**。可靠恢复至少需要同时保存并恢复：

1. Codex Thread（线程）的 Session rollout（会话记录）；
2. 与该 Thread 对应的 Goal（目标）SQLite 状态；
3. 独立持久化的工作区变更，例如 Git 分支、提交或 Patch Artifact（补丁制品）；
4. 稳定的 GitHub 对象到 Codex Thread ID 的映射。

Codex CLI（命令行工具）能够按 Session ID 恢复；源码还表明，同一 Thread 中持久状态仍为 `active` 的 `/goal` 会在恢复后重新装载，并在 Thread idle（空闲）时继续执行。`paused`、`blocked`、`usage-limited` 或 `complete` 不会被隐式改回 `active`。

GitHub 重新运行 Job（作业）不会承诺回到原 Runner（运行器）。给唯一一台 Self-hosted Runner（自托管运行器）配置唯一标签只能形成部署拓扑上的倾向，不是 Runner Affinity（运行器亲和性）契约。因此首版不应把“命中同一机器的本地磁盘”作为正确性前提。

推荐把跨 Run Session 恢复定义为 Compatible Executor（兼容执行器）的可选能力，而不是 Workflow（工作流）的基础正确性。首版应以 GitHub 中可恢复的 Git 状态和明确验收条件为事实源；恢复失败时能够安全退化为新的 Codex Session。

## 证据等级

- **官方明示**：OpenAI 或 GitHub 文档直接承诺的接口和行为。
- **官方源码**：当前快照源码可直接观察到的实现；不等同于所有已发布 CLI 版本的长期兼容承诺。
- **工程推断**：由官方接口、存储结构和 GitHub 调度语义推导出的设计约束。
- **未验证假设**：尚未通过真实 CLI 重启和 GitHub Runner 故障实验验证的部分。

## Codex 能否恢复指定 Session

**官方明示**：`codex exec resume [SESSION_ID]` 可以按 ID 恢复非交互 Session，也支持 `--last`、`--all` 和后续 Prompt（提示词）。交互式 CLI 同样提供 `codex resume SESSION_ID`。[Codex Developer commands：`codex exec`](https://learn.chatgpt.com/docs/developer-commands?surface=cli#codex-exec) [Codex Developer commands：`codex resume`](https://learn.chatgpt.com/docs/developer-commands?surface=cli#codex-resume)

**官方源码**：CLI 把 UUID 或 Session name（会话名称）解析为恢复标识，再调用 App Server（应用服务器）的 `thread/resume`。[Resume 参数定义](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/exec/src/cli.rs#L149-L255) [Exec 恢复实现](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/exec/src/lib.rs#L979-L1012)

**工程推断**：Session ID 只是定位符，不是远端托管状态。新的 Runner 还必须能读取原 Thread 的本地 rollout。Codex 测试辅助代码把 rollout 放在 `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-...-<thread-id>.jsonl`。[Rollout 路径构造](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/app-server/tests/common/rollout.rs#L23-L35) `--ephemeral` 明确不持久化 Session rollout，因此不能作为跨 Run 恢复的起点。[Codex Developer commands：`--ephemeral`](https://learn.chatgpt.com/docs/developer-commands?surface=cli#codex-exec)

## Active `/goal` 能否随 Session 继续

**官方明示**：`/goal <objective>` 把 Goal 附着在当前 Active Chat（活动对话）上，Codex 在工作继续期间保持该 Goal。[Codex Developer commands：`/goal`](https://learn.chatgpt.com/docs/developer-commands?surface=cli#slash-commands)

**官方源码**：

- Thread resume 生命周期调用 `restore_after_resume()`；[Goal extension resume hook](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/ext/goal/src/extension.rs#L161-L174)
- 恢复逻辑按 Thread ID 从 SQLite 读取 Goal，只有持久状态仍为 `Active` 时才恢复内存中的活动标记；[Goal restore](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/ext/goal/src/runtime.rs#L394-L416)
- 随后的 idle 生命周期调用 `continue_if_idle()`，再次检查 `Active` 状态并启动 `turn_trigger: goal` 的 continuation turn（续行轮次）；[Idle hook](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/ext/goal/src/extension.rs#L176-L188) [Goal continuation](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/ext/goal/src/runtime.rs#L418-L480)
- 官方测试验证：`paused` Goal 在 Thread resume 后仍为 `paused`，且不会启动新轮次。[Paused goal resume test](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/app-server/tests/suite/v2/thread_resume.rs#L2729-L2825)

Goal 状态位于 `goals_1.sqlite`，`thread_goals` 以 `thread_id` 为主键保存 Objective（目标描述）、状态与用量。[SQLite 文件定义](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/state/src/sqlite.rs#L25-L43) [Goal schema](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/state/migrations/0029_thread_goals.sql#L1-L11) [Goal read path](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/state/src/runtime/goals.rs#L35-L59)

因此，**源码支持的准确结论**是：同一持久化 Thread 中仍为 `active` 的 Goal 会在 resume 后恢复并可自动续行。不能扩大为“任何未完成 Goal 都会自动恢复”，也不能假设只保存 Session ID 就足够。

## `openai/codex-action@v1` 暴露了什么

**官方 Action 契约**：该版本只声明 `final-message` 一个 Output（输出），没有暴露 Session ID、Thread ID 或 Goal ID。[Action outputs](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/action.yml#L123-L126)

Action 固定组装 `codex exec`，写入 `--output-last-message`，再追加 `codex-args` 和 Prompt。它没有公开选择 `codex exec resume` 子命令的输入，也没有启用并解析 `--json` 中的 `thread.started.thread_id`。[命令组装源码](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/src/runCodexExec.ts#L256-L315) Codex CLI 自身可以用 `--json` 输出包含 `thread_id` 的 JSONL 事件，但 Action 没有把该信号提升为输出。[Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)

`codex-home` Input（输入）只是选择当前 Job 使用的目录；Action 没有跨 Runner 上传或恢复这个目录，也不会替用户提交、暂存或上传未提交工作区。[Action inputs](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/action.yml) OpenAI 的自动化示例把 Patch 的保存和 Artifact 上传明确写成 Action 之外的后续步骤，进一步说明工作区持久化由 Workflow 拥有。[Codex non-interactive automation](https://developers.openai.com/codex/noninteractive)

**结论**：若要支持跨 Run 恢复，需要在 Compatible Executor 中补充捕获 Thread ID、持久化状态和调用 resume 的适配。不能仅通过现有 `codex-args` 把固定的 `codex exec` 可靠改造成 `codex exec resume`。

## GitHub rerun 能否回到同一 Runner

**官方明示**：GitHub rerun 保留原触发者权限以及原 `GITHUB_SHA`、`GITHUB_REF`，但文档没有承诺再次调度到原 Runner。[Re-running workflows and jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)

Self-hosted Runner 调度按 Runner Group（运行器组）和 Label（标签）匹配：GitHub 把 Job 分配给任一在线且空闲的匹配 Runner；若 Runner 60 秒内未接单，Job 会重新排队供其他匹配 Runner 接受。[Self-hosted runner routing](https://docs.github.com/en/actions/reference/runners/self-hosted-runners) 多个 `runs-on` 标签只是累计匹配条件。[Using self-hosted runners in a workflow](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)

**工程推断**：若一个唯一标签始终只属于一台在线 Runner，调度结果通常会落到该机器；但可靠性来自当前部署拓扑，而不是 GitHub 提供的机器身份契约。Runner 离线、替换、重新注册、清理本地盘，或同标签被加到另一台机器时，该假设立即失效。GitHub 也明确指出更换 Runner 后需要重新分配自定义标签。[Managing custom labels](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/apply-labels)

GitHub-hosted Runner（GitHub 托管运行器）的每个 Job 使用新虚拟机，因此其本地 `$CODEX_HOME` 和未提交工作区天然丢失。[GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners)

## 状态持久化与安全边界

| 状态 | Fresh Runner 上是否天然保留 | 推荐事实源 |
|---|---|---|
| GitHub Issue、PR、评论、Run 元数据 | 是，位于 GitHub | GitHub API / Event payload |
| 已推送 Git commit、branch、tag | 是 | Git remote |
| Codex Thread ID | 否，除非显式记录 | 受控映射存储或 Workflow Artifact |
| Session rollout、Goal SQLite | 否，除非显式备份和恢复 | 隔离、加密、版本化的 Codex state bundle |
| 未提交工作区 | 否 | Git commit/branch 或 Patch Artifact |
| Runner 进程、内存、临时文件 | 否；持久机器上残留也不应依赖 | 不作为事实源 |

持久化整个 `$CODEX_HOME` 操作上最简单，但风险最高：其中可能包含认证信息、配置、Session transcript（会话记录）、Prompt、工具输出和项目内容。OpenAI 明确要求把 `~/.codex/auth.json` 当作密码，不得提交或分享，持久化认证必须使用安全存储。[Codex authentication for CI](https://developers.openai.com/codex/noninteractive)

持久 Self-hosted Runner 还缺少 GitHub-hosted Runner 的干净隔离保证，可能在 Job 间残留被修改的文件、进程或凭证；GitHub 警告其可能被持续攻陷，并建议自动扩缩场景使用 Ephemeral Runner（一次性运行器）。[Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use) [Self-hosted runners](https://docs.github.com/en/actions/reference/runners/self-hosted-runners) Codex Action 也提醒 Codex 可能留下进程、修改 Action 源码、配置或 Hook，因此应尽量让它作为最后一步运行；启用 `drop-sudo` 时产生的账户或 Socket 变更在复用 Runner 上还可能跨 Job 存在。[Codex Action security](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/docs/security.md) [Codex Action README](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/README.md)

因此即使做状态恢复，也应满足：按仓库和任务隔离、静态加密、最短保留期、最小文件权限、不跨信任域复用，以及恢复前校验仓库、Thread 和目标身份。工作区应从干净 checkout 加受审计的 Git/Patch 状态重建，不应直接复用历史脏目录。

## 可行方案与推荐约束

### 推荐基线

首版每个 GitHub Event（事件）重新 checkout 已持久化的 Git 状态，构造该 Event 可配置的 Prompt，并启动新的原生 `/goal`。以 Issue/Ticket 的验收条件、Git 分支和提交作为跨 Run 事实源。Session 恢复失败不得妨碍重新开始。

### 可选的跨 Run Resume 能力

若后续证明长任务确实需要连续上下文，可在 Codex Compatible Executor 中实现以下最小契约：

1. 用 Codex JSONL 输出捕获并返回 `thread_id`；
2. 以稳定 Operation Key（操作键）关联 GitHub 对象、目标版本和 Thread ID；
3. 在 Codex 进程退出后，以一致快照保存 Session rollout 和 Goal SQLite；
4. 新 Run 先恢复相同版本、相同信任域的状态，再调用 `codex exec resume <SESSION_ID>`；
5. 独立从 Git commit/branch 或 Patch Artifact 恢复工作区；
6. 用 GitHub `concurrency` 和幂等键避免同一 Goal 并发恢复；
7. 仅自动续行持久状态为 `active` 的 Goal，不自动解除 `paused`、`blocked` 或用量限制；
8. 状态缺失、损坏、版本不兼容或身份不匹配时，安全退化为新的 Session。

采用唯一标签的持久 Runner 只能作为受控试验：限定单仓库或单信任域、只有一个合格 Runner、并发为一、禁用不可信 Fork 代码，并接受机器替换即丢失恢复能力。它不能替代显式状态契约。

## 尚未验证

- 尚未用一个已发布且固定版本的 Codex CLI 做“创建 active Goal → 进程退出 → 新进程按 ID resume → 自动续行”的端到端实验；当前 Goal 连续性结论来自官方 `main` 源码和测试。
- 尚未验证对运行中 SQLite 直接打包的安全性；实现时必须在进程退出后生成一致快照，并验证 WAL 等数据库文件处理。
- 尚未做 Runner 离线、替换、重复投递和两个 Run 并发恢复同一 Thread 的故障实验。
- OpenAI 没有承诺 GitHub-hosted fresh Runner 仅凭 Session ID 即可远端恢复；现有源码显示它依赖本地 rollout 和 SQLite。

这些验证完成前，跨 Run resume 应保持为可选优化，不应成为 Workflow 完成任务的唯一正确路径。
