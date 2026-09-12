# Codex 跨 GitHub Workflow Run 恢复研究

> 研究快照：2026-09-11。`openai/codex-action@v1` 当前 annotated tag 指向 commit `86365089eb2b84e0a8fb0717b304f8bdcb13b20e`；Codex Goal 行为的源码证据固定到 `openai/codex@713caa89f389acd9cbcd77016edbb607273826af`。远端旧稿位于 `research/codex-cross-run-resume@6e95043bebd41fbfef3cf592ea9c1c6025752599`。本轮没有改 Workflow，也没有完成真实 GitHub rerun/recovery dispatch 实验。

## 决策摘要

跨 GitHub Workflow Run（工作流运行）继续同一个原生 Goal 在技术上可行，但当前 `openai/codex-action@v1` **没有原生提供所需接口**，Codex 原生状态也**不能独立证明** GitHub repository、Issue/PR、执行器兼容性或“中间无人侵入”。因此，当前不能把它作为正式 Workflow 的安全能力。

建议把 Resume（恢复）保留为 Compatible Executor（兼容执行器）的显式、默认关闭能力，并先开 Prototype/Tracer Bullet 验证。最小安全方案是：仅允许同一 Run 的 rerun 或显式绑定原 Application Object（应用对象）的人工 recovery dispatch；恢复前验证 GitHub 入口、不可变 Executor Profile（执行器配置档）、专用持久 runner 的本机租约、唯一 active Goal、干净且与权威 Git ref 一致的工作区；任一条件缺失、损坏、冲突或候选不唯一时，**明确失败并 handoff（交接），绝不静默启动 fresh Goal**。

这修正了远端旧稿中的一句错误建议。旧稿称恢复失败可退化为新 Session；这会把 recovery 意图偷换成新的执行，可能让旧 Goal 与新 Goal 同时产生外部效果，与本票据已确认的失败语义冲突。Fresh Goal 只能由普通新 GitHub Event 的正常入口显式创建，不能成为 resume 路径的 fallback。

## 证据边界

- **官方契约**：OpenAI 或 GitHub 文档明确承诺的公开行为。
- **官方源码**：固定 commit 上可观察的实现，不等于未来版本兼容承诺。
- **工程结论**：由官方契约和源码推导出的安全约束。
- **未验证**：尚无真实 GitHub Run 或故障注入证据；不得写成已支持。

## 支持矩阵

| 能力 | 当前判定 | 依据与边界 |
|---|---|---|
| Codex CLI 按 Thread/Session ID 恢复 | 原生支持 | `codex exec resume [SESSION_ID]` 与交互式 `codex resume` 是公开 CLI；`--ephemeral` 不保存 rollout，不能用于跨 Run 恢复。[Codex CLI：exec/resume](https://developers.openai.com/codex/cli/reference) |
| 同一 Thread 恢复持久化 active Goal | 源码支持，需版本固定 | resume hook 从 SQLite 按 Thread ID 恢复 Goal；只有持久状态 `Active` 会恢复，idle hook 才继续触发 Goal turn。[Goal restore](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/ext/goal/src/runtime.rs#L394-L416) [Goal continuation](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/ext/goal/src/runtime.rs#L418-L480) |
| `openai/codex-action@v1` 输出 Thread/Goal ID | 不支持 | Action 只有 `final-message` 输出。[action.yml](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/action.yml#L123-L126) |
| `openai/codex-action@v1` 调用 `codex exec resume` | 不支持 | Action 固定组装 `codex exec`，没有 resume 输入，也没有把 JSONL `thread_id` 提升为输出。[命令组装](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/src/runCodexExec.ts#L256-L315) |
| Workflow 不保存映射而由本地 Codex 状态找到唯一候选 | 有条件可扩展，但原生不足 | rollout 文件名和 Goal 表能把 Thread 与 Goal 相连，却不含可信 GitHub object identity；只能作为候选发现，不能作为授权证据。[rollout 路径](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/app-server/tests/common/rollout.rs#L23-L35) [Goal schema](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/state/migrations/0029_thread_goals.sql#L1-L11) |
| 同一台持久 self-hosted runner 上恢复 | 仅受控部署/实验可支持 | GitHub 只按 group/labels 把 Job 发给任一在线、空闲且匹配的 runner，不承诺物理机亲和性。[Self-hosted runner routing](https://docs.github.com/en/actions/reference/runners/self-hosted-runners) |
| GitHub-hosted runner 依赖本地状态恢复 | 不可支持 | 每个 Job 获得新的 VM，本地状态不连续。[GitHub-hosted runners](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners) |
| 跨机器迁移最小 Codex 状态 | 理论可扩展，当前不可安全声称支持 | 必须一致快照 rollout 与 Goal DB、排除认证、加密会话内容并做单写者 fencing；当前无官方 bundle/export 契约或实验。
| 恢复失败后自动 fresh Goal | 不可安全支持 | 会改变入口语义，并可能与仍运行的旧 Goal 重复外部效果；必须 fail closed 并 handoff。

## 七个研究问题

### 1. Action 能否原生 resume；如何扩展而不削弱边界

`openai/codex-action@v1` 不能原生完成安全 resume。它只输出最终消息，固定执行 `codex exec`，没有 Session/Thread/Goal 标识输出、resume 子命令输入或恢复状态接口。[Action outputs](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/action.yml#L123-L126) [执行命令实现](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/src/runCodexExec.ts#L256-L315)

`codex-home` 只指定当前 Job 使用的目录；Action 不负责跨 Run 上传、恢复或校验目录。[Action inputs](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/action.yml) Codex CLI 的 JSONL 模式会发出带 `thread_id` 的 `thread.started` 事件，但当前 Action 未暴露它。[Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)

安全扩展应进入同一个 Compatible Executor，而不是在 Action 后追加裸 `codex exec resume`：

1. 固定 Action 与 Codex revision，并把认证、代理、sandbox、权限、`codex-home`、工作目录和关键配置组成不可变 Executor Profile；
2. 由同一受信执行器捕获 JSONL Thread ID、检查本地 Goal DB、执行 resume，并保持 Action 的进程清理与降权边界；
3. 恢复前验证入口和本机租约，恢复后输出可审计 Result；
4. 任何配置不兼容或验证不可得都失败交接。

Action 官方安全说明指出 Codex 可能修改文件、配置、hook 或留下进程，并建议把它尽量放在 Job 末尾；`drop-sudo` 还会改变复用 runner 上的账户/socket 状态。这说明“Action 后裸跑 CLI”并非安全等价替换。[Codex Action security](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/docs/security.md) [Codex Action README](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/README.md)

### 2. Codex 原生状态能验证什么

Codex 原生状态可以确定：某 Thread 的 rollout 是否存在、某 Thread 是否有 Goal、Goal 的 objective/status/usage，以及 active 候选数量。Goal 位于 `goals_1.sqlite`，`thread_goals` 以 `thread_id` 为主键。[SQLite 定义](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/state/src/sqlite.rs#L25-L43) [Goal read path](https://github.com/openai/codex/blob/713caa89f389acd9cbcd77016edbb607273826af/codex-rs/state/src/runtime/goals.rs#L35-L59)

它不能作为可信证据确定：

- 当前 GitHub repository 与 Issue/PR 身份；会话文字里提到对象只是 agent 生成内容，不是 trusted binding（可信绑定）；
- 当前 checkout、branch/commit 是否等于应恢复的权威 Git 状态；
- Action 类型、版本、runtime、代理、权限、sandbox、配置是否兼容；
- 两个 Workflow Run 之间没有其他 Issue、其他 Action 或人工运行侵入同一目录/状态；
- 一个旧进程是否仍在产生外部效果。

因此“不让 Workflow 保存 Resume Record”并不等于“不保存任何恢复约束”。对象身份与授权来自当前 GitHub event/API；执行兼容性来自版本化 Executor Profile；本地连续性来自部署隔离和运行时租约。Codex 状态只负责验证“唯一可恢复 active Goal 候选”，不能单独授权恢复。

### 3. Runner 连续性：运行时检查与部署约束

可在运行时确定性检查：

- 当前 event 是允许的 rerun/recovery dispatch，且 repository、Application Object、原 run/attempt 关系匹配；GitHub rerun 保留原 `GITHUB_SHA`、`GITHUB_REF` 和原触发者权限，可通过 Actions API/event 元数据核验，但 GitHub 不承诺同一 runner。[Re-running workflows and jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
- 本地 machine/installation marker、workspace marker、Codex state marker 与不可变 Executor Profile digest 匹配；
- 工作区无意外脏改动，HEAD/remote ref 与恢复策略匹配；
- 进程锁和 lease epoch（租约世代）表明当前执行器是唯一 writer；
- rollout 可读、SQLite integrity check 通过，且恰好一个与当前 profile 匹配的 active Goal。

只能作为部署约束：

- `runs-on` label/group 实际只匹配一台任务专用、持久化 runner；GitHub 的调度契约只是任一匹配且空闲 runner。[Runner routing](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- runner 串行且不承载其他 repository、Issue、Agent Action 或人工 Goal Run；
- 本地磁盘不会被外部清理/回滚，机器 marker 不会被镜像复制；
- 不执行不可信 fork 代码，并按单一信任域隔离。GitHub 警告 self-hosted runner 可能被持久攻陷，并建议自动扩缩使用 ephemeral runner。[Secure use of GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use) [Self-hosted runners](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)

label、group、runner name 或“目录还在”都不能单独证明是原物理机和未受侵入的连续状态。

### 4. 取消、下线、重建与磁盘损坏的失败语义

恢复入口必须 fail closed（闭锁失败）：

| 故障 | 可观察信号 | 结果 |
|---|---|---|
| 原 Run 被取消但旧 Codex 进程仍存活 | lease 未释放、进程/heartbeat 尚在，或无法证明已终止 | 不恢复；标记 `RESUME_CONFLICT`，handoff |
| runner 下线或 Job 被调度到别处 | machine marker/本地状态缺失 | `RESUME_RUNNER_UNAVAILABLE`，handoff |
| runner 重建/磁盘清理 | installation epoch 改变、rollout/DB 缺失 | `RESUME_STATE_MISSING`，handoff |
| rollout 或 SQLite 损坏/不一致 | 解析失败、integrity check 失败、Thread 与 Goal 不匹配 | `RESUME_STATE_CORRUPT`，handoff；保留证据，禁止修复式猜测 |
| 版本或关键配置变化 | Executor Profile digest 不同 | `RESUME_INCOMPATIBLE`，handoff |
| 候选为零或多于一个 | 唯一性检查失败 | `RESUME_NOT_UNIQUE`，handoff |

失败 Result 应包含稳定 operation key、原 run/attempt、当前 run、失败码及可公开诊断，但不能上传 transcript、token 或认证文件。它不得调用 fresh Goal；由人明确选择新的普通事件/工作请求后，才走 fresh-run 路径。

### 5. 能否迁移最小恢复状态

概念上可迁移，但当前没有足够证据宣称安全支持。最小逻辑集合至少包括：

- 目标 Thread 的 session rollout；
- `goals_1.sqlite` 中与该 Thread 关联的 Goal 状态，且要用 SQLite 一致快照而不是运行中随意复制 DB/WAL；
- Thread ID、Codex revision、Executor Profile digest、machine-independent bundle manifest；
- 独立的权威工作区状态（已推送 commit/branch，或受控 Patch Artifact），不能把历史脏工作目录当恢复包。

必须排除 `auth.json`、API key、代理凭据和其他认证材料。OpenAI 明确要求把 `~/.codex/auth.json` 当作密码，不得分享或提交，并建议 CI 使用 secret 注入。[Codex authentication for CI](https://developers.openai.com/codex/noninteractive)

恢复包还包含 prompt、对话、工具输出和可能的仓库敏感内容，必须按 repository/对象/信任域隔离、加密、限制读取权限和保留期，并做完整性与防回滚校验。GitHub Artifact 本身不能解决一致性和并发：上传必须发生在 Codex 退出、Goal 状态稳定且 lease fencing 成功之后；恢复端必须以原子 claim 消费特定 generation，禁止两个 Run 同时恢复。由于当前没有官方最小 export/import 格式、兼容版本承诺或本票据实验，跨机器状态 bundle 判定为“需扩展且尚不可安全支持”。

### 6. 防止旧 Goal、新 Goal 并发和重复外部效果

GitHub `concurrency` 可限制同一 group 最多一个 running 与一个 pending Job，并可取消正在运行者，但取消是调度控制，不是外部效果的事务保证。[Workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

最小防线需要三层：

1. **GitHub 调度层**：按 repository + Application Object 使用稳定 concurrency group；recovery 与正常事件必须落入同一组。
2. **Executor fencing 层**：原子获得单写者 lease，带单调 epoch；每次 continuation 和有副作用的工具调用前检查租约仍有效。无法证明旧进程退出时不得恢复。
3. **Effect（外部效果）层**：每个操作使用稳定 operation key，并在权威系统查询既有 Result；GitHub comment、label、branch/PR 等写入应可查重或具幂等 precondition。Session transcript 和 agent 最终文本不能证明效果是否发生。

`cancel-in-progress` 只能缩短重叠窗口，不能替代 fencing 与幂等。尤其不能在 resume 验证失败后 fresh fallback；那会创建第二个 Goal，绕过唯一 Goal 约束。

### 7. 真实跨 Run 实验

**状态：未执行，不能作为支持证据。** 本轮只核对官方文档、固定源码与远端旧稿；没有可审计的两个 GitHub Workflow Run、runner 身份、Thread/Goal 状态变化和外部效果记录。

后续 Prototype/Tracer Bullet 应固定版本并至少覆盖：

1. 在任务专用持久 runner 上由 Run A 创建 Thread 和 active Goal，记录 JSONL `thread_id`、Goal DB 状态、HEAD、Executor Profile digest 和 machine epoch；让进程在可控 continuation 边界退出。
2. 对 Run A 做真实 rerun，证明 Run B 验证同一对象、同一机器/状态、唯一 active Goal 后执行 Session resume，并由 Goal continuation 继续；记录两个 Run URL 与完整 Result。
3. 分别注入：第二个匹配 runner、runner 重建、状态缺失、DB 损坏、profile 变化、多个 active 候选、旧进程仍运行、重复 recovery dispatch；每种必须得到确定失败码和 handoff，且不得出现 fresh Goal。
4. 用唯一 operation key 触发一个可查询的测试效果，验证 rerun/并发恢复不会重复写入。
5. 若研究跨机器 bundle，再单独验证一致快照、认证排除、加密、篡改/回滚拒绝和两个恢复者竞争。

在这些实验完成前，唯一诚实结论是：Codex 的底层恢复机制存在，项目级安全恢复契约尚未验证。

## 推荐的最小 Resume 配置

仅建议用于后续原型，不建议现在进入正式 Workflow：

- 默认 `resume: disabled`；普通 GitHub event 总是 fresh Goal。
- 允许入口只有同一 Workflow Run 的 rerun，或显式携带并由 GitHub API 验证原 Application Object/Run 的人工 recovery dispatch。
- 一个 repository/信任域专用的持久 self-hosted runner，唯一匹配 label，部署层保证并发一；不接受 fork/untrusted code。
- 固定不可变 Action/Codex revision；Executor Profile 覆盖 action 类型/revision、runtime、workdir、`CODEX_HOME`、权限、代理、sandbox、模型及影响恢复的配置。
- Workflow 不保存 Session/Goal mapping；Compatible Executor 从隔离本地状态发现候选，但必须结合可信 GitHub event 与本机 marker 验证，且候选恰好一个。
- GitHub concurrency + 本机 lease/fencing + effect operation key 三层并发控制。
- Git 工作区从权威 branch/commit 重建或验证；Session 状态不代替 GitHub/Git 事实。
- 失败只返回分类 Result 并 handoff；不猜测、不自动修复、不 fresh fallback。

## 最终建议

当前决策应是“**暂不在正式 Workflow 支持跨 Run resume；创建独立 Prototype/Tracer Bullet 票据验证同机恢复契约与故障语义**”。若同机实验通过，再决定是否值得研究跨机器最小状态 bundle。无论优化是否落地，GitHub Issue/PR、branch/commit、Check/Run 和稳定 operation result 仍是跨 Run 正确性的权威事实；Session resume 只减少上下文重建成本，不能成为正确性的唯一基础。
