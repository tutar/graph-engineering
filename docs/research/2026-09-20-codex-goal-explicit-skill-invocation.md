# Codex Goal Action 显式 Skill 调用调研

日期：2026-09-20

范围：Codex CLI / App Server `0.153.4`（tag `rust-v0.153.4`，commit `3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`）与当前 Graph Engineering Codex Goal Action。
约束：不修改客户仓库的 `SKILL.md` 或 `agents/openai.yaml`，继续使用 Agent Runtime 原生 Goal。

## 结论

当前 Codex `0.153.4` 的 `thread/goal/set` 无法可靠显式调用指定 Skill（技能）。它只能接收字符串 `objective`、Goal 状态和 token budget，不能携带 `turn/start` 所支持的结构化 `{ type: "skill", name, path }` 输入。Goal Runtime（目标运行时）启动首轮和后续轮次时，又把 objective 渲染为内部 `ResponseItem`，而不是普通 `UserInput`；因此 objective 中的 `$implement` 不会经过显式 Skill 选择路径。

这不是 cwd 错误，也不应通过改客户 Skill 解决。长期正确方案是让 Codex 的 Goal 激活协议原生携带结构化初始输入或已选择 Skill。

对现有 `0.153.4`，源码中存在一条比“让模型调用 `create_goal`”更确定的兼容桥接：先用 `thread/goal/set` 创建 `paused` Goal，再用 `turn/start` 发送文本和结构化 Skill，收到启动响应后立即把同一 Goal 切换为 `active`。Runtime 会把正在运行的显式 Turn 绑定到 Goal，并从绑定点开始计费；Turn 结束后由原生 Goal 自动续轮。

该桥接仍有两个边界：极快的首轮可能在 active 请求到达前结束，导致首轮不计入 Goal、Runtime 另起 continuation；显式 Skill instruction 虽会进入历史，但 remote compaction 后可能丢失，因而不能替代 Goal-scoped Skill selection。

因此建议分两阶段：

1. 短期做一个有明确失败信号的兼容实验：Action 用 `skills/list` 解析 Skill，创建 paused Goal，使用结构化 `turn/start` 启动 bootstrap turn（引导轮次），随后立即激活同一 Goal；验证 active notification 与 Turn/Goal 关联，失败时不静默退化。
2. 正式方案推动上游协议补齐 Goal-scoped structured input（Goal 作用域结构化输入）；在此之前，不把短期路径声明为与 `thread/goal/set` 等价的确定性激活。

## 关键更正：`disable-model-invocation` 不是 Codex 0.153.4 的控制字段

此前把 `SKILL.md` 中的 `disable-model-invocation: true` 当作直接根因并不准确。

Codex `0.153.4` 的 Skill frontmatter parser 只读取 `name`、`description` 与兼容的 short description；未知字段由 serde 忽略。[官方源码：parser.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/skills/src/parser.rs#L6-L20) 同一版本自带的 plugin validator 反而拒绝 truthy `disable-model-invocation`，说明它不是 Codex Skill 的有效发布字段。[官方源码：validate_plugin.py](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/skills/src/assets/samples/plugin-creator/scripts/validate_plugin.py#L469-L475)

Codex 原生的“禁止隐式、允许显式”策略是 Skill 目录下 `agents/openai.yaml`：

```yaml
policy:
  allow_implicit_invocation: false
```

官方随附说明明确表示：该配置禁止默认注入，但用户仍可通过 `$skill-name` 显式调用。[官方源码：openai_yaml.md](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/skills/src/assets/samples/skill-creator/references/openai_yaml.md#L47-L49)

当前仓库的 `implement` 同时具有 Claude 风格的 `disable-model-invocation: true` 和 Codex 原生的 `allow_implicit_invocation: false`。对 Codex `0.153.4` 真正生效的是后者。保留它符合客户 Skill 的发布意图；Action 应完成“显式调用”，而不是要求客户开放隐式调用。

## 当前协议为何丢失显式调用语义

### `turn/start` 有结构化 Skill 输入

`TurnStartParams` 接受 `input: Vec<UserInput>`；`UserInput` 包含 `Skill { name, path }`，并被无损转换成 core `UserInput::Skill`。[官方源码：turn.rs 的请求参数](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L1609-L1617) [官方源码：Skill 输入](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server-protocol/src/protocol/v2/turn.rs#L2020-L2130)

Skill selection（技能选择）优先按结构化 Skill 的精确 path 在 enabled catalog 中选择，然后才解析文本中的 mention；它不要求该 Skill 允许隐式调用。[官方源码：selection.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/skills/src/selection.rs#L31-L104) 官方 App Server 文档也建议同时发送 `$name` 文本和 `type: "skill"`，让服务端直接注入 Skill 指令，不依赖模型解析名称。[官方 App Server 文档](https://developers.openai.com/docs/app-server#skills)

这就是普通 TUI 输入 `$implement` 能工作的路径：TUI 把已绑定 mention 转成结构化 Skill 输入，而不是只把 `$implement` 当字符串交给模型。[官方源码：input_submission.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/tui/src/chatwidget/input_submission.rs#L223-L255)

### `thread/goal/set` 没有结构化输入

`ThreadGoalSetParams` 只有：

- `thread_id`
- `objective: Option<String>`
- `status`
- `token_budget`

没有 `input`、`skills` 或“延迟首轮”字段。[官方源码：thread.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L3648-L3681)

Goal processor 把 objective 作为普通字符串写入 Goal Service，然后立即应用 Runtime effects（运行时效果）。[官方源码：thread_goal_processor.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server/src/request_processors/thread_goal_processor.rs#L1470-L1649) Goal Runtime 随后把 objective 渲染为内部 continuation context，并通过 `TurnInput::ResponseItem` 启动 idle turn，而不是通过 `TurnInput::UserInput(Vec<UserInput>)`。[官方源码：steering.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/steering.rs#L53-L93) [官方源码：runtime.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/runtime.rs#L443-L459)

所以，下面两者不等价：

```json
{
  "method": "turn/start",
  "params": {
    "input": [
      { "type": "text", "text": "$implement 完成 Issue #123" },
      { "type": "skill", "name": "implement", "path": "/repo/.agents/skills/implement/SKILL.md" }
    ]
  }
}
```

```json
{
  "method": "thread/goal/set",
  "params": {
    "objective": "使用 $implement 完成 Issue #123",
    "status": "active"
  }
}
```

后者只保存文本。它不会产生前者的 `UserInput::Skill`。

## 当前 Action 的具体缺口

当前开发源 [`workflow/.github/actions/codex-goal/lib/run.mjs`](../../workflow/.github/actions/codex-goal/lib/run.mjs) 在 `thread/start` 后直接调用：

```js
client.request("thread/goal/set", {
  threadId,
  objective,
  status: "active",
  tokenBudget
})
```

Action 没有调用 `skills/list`，没有把 `$implement` 解析成 name/path，也没有发送结构化 Skill input。因此其行为与 `0.153.4` 协议完全一致：cwd 决定 Skill catalog 在哪里发现，但 cwd 正确并不能把 objective 字符串升级成显式 Skill selection。

`skills/list` 适合做客户端解析：它返回发现到的 Skill 的 name、path 和 enabled 状态；但“能列出”不等于“已经为某个 Turn 选择”。Action 必须把解析结果用于结构化输入。`skills/list` 的公开 Skill metadata 也不暴露 invocation policy，Action 不应尝试重写或推断客户策略。[官方源码：plugin.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server-protocol/src/protocol/v2/plugin.rs#L464-L485) [官方源码：plugin.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server-protocol/src/protocol/v2/plugin.rs#L549-L553)

## 方案比较

| 方案 | 指定 Skill 是否可靠加载 | Goal 激活是否确定性 | 保留原生 Goal 自动续轮 | 是否改客户 Skill | 结论 |
|---|---:|---:|---:|---:|---|
| A. paused Goal → structured `turn/start` → active Goal | 首轮是；跨 compaction 否 | 是，除极快首轮归属竞态 | 是 | 否 | `0.153.4` 首选兼容实验 |
| B. 扩展 Goal API，Goal 激活携带 structured input / selected skills | 是 | 是 | 是 | 否 | 长期推荐，需要上游 Codex 变更 |
| C. `turn/start` 结构化 Skill，模型调用 `create_goal` | 是 | 否，模型中介 | 是 | 否 | 次选兼容方案 |
| D. Action 自己循环 `turn/start`，每轮控制继续 | 是 | 不使用 Goal | 否 | 否 | 破坏当前 Agent Runtime ownership，不推荐 |
| E. 伪造 `<skill>` 后通过 `thread/inject_items` 注入 | 内容可见，但不是正式 invocation | 是 | 是 | 否 | 绕过 catalog、依赖和审计，不推荐 |
| F. 激活 Goal 后再抢发 `turn/start` | 不可靠 | 有竞态 | 是 | 否 | active Goal 会立即启动 idle turn，不应使用 |
| G. 移除客户 invocation policy | 依赖模型解析 | 是 | 是 | 是 | 不在发布权限内，也破坏显式调用意图 |

### A. `0.153.4` paused-to-active 桥接

建议实验序列：

1. `thread/start` 创建持久 thread。
2. `skills/list` 在目标 cwd 强制刷新 catalog，按 Workflow 配置的 Skill name 要求唯一、enabled 的结果，并使用 App Server 返回的 path。
3. `thread/goal/set` 以预期 objective、预算和 `status: "paused"` 创建 Goal。Paused 状态不会启动自动 continuation。
4. `turn/start` 同时发送业务文本和 `{ type: "skill", name, path }`。
5. 一收到 `turn/start` 的 `inProgress` response，立即对同一 Goal 调用 `thread/goal/set { status: "active" }`，不重复发送 objective 或预算。
6. 验证 active Goal notification，随后继续使用现有 Goal 终态监听。

`turn/start` 先把 V2 input 转成 core `UserInput`，再调用 `start_or_steer_turn`，返回带 Turn id 的 `inProgress` response。[官方源码：turn_processor.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server/src/request_processors/turn_processor.rs#L3219-L3433) Goal lifecycle 的 `on_turn_start` 总会建立 `current_turn_id` 与 token baseline；只有数据库中的 Goal 已经是 `active` 或 `budgetLimited` 才会在此时绑定 Goal，paused Goal 不绑定。[官方源码：extension.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/extension.rs#L1772-L1860) [官方源码：accounting.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/accounting.rs#L79-L95)

随后外部 active transition 进入 `apply_external_goal_set`：存在 `current_turn_id` 时调用 `mark_current_turn_goal_active`，否则标记 idle Goal；然后调用 `continue_if_idle`。运行中的 Turn 会使 `start_turn_if_idle` 不再启动第二个 Turn。[官方源码：runtime.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/runtime.rs#L1803-L1897) `mark_current_turn_goal_active` 会把该 Turn 绑定到 Goal，并在 Goal 发生切换时把 baseline 重置到当前 token usage，所以只统计激活之后的 token，不追溯 paused 阶段已经消耗的 token。[官方源码：accounting.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/accounting.rs#L226-L249) [官方源码：accounting.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/accounting.rs#L2172-L2186)

这里有两种正常排序：

- Active mutation 发生在 `on_turn_start` 之后：`mark_current_turn_goal_active` 从激活点开始接管和计费。
- Active mutation 极早发生在 `on_turn_start` 之前：Runtime 先标记 idle Goal；`on_turn_start` 随后从数据库读到 active Goal，绑定整个 Turn。`continue_if_idle` 因 Turn 已占用而不会重复启动。

唯一未被协议原子性消除的竞态是：显式 Turn 极快地在 active mutation 被处理前结束。此时 `current_turn_id` 已清除，active mutation 会正常从 idle 启动新的 Goal continuation；结构化 Skill 的首轮已经执行并进入历史，但该首轮 token/time 不计入 Goal。应通过同一连接在收到 `turn/start` response 后立即发送 active mutation 压缩窗口，并在真实 App Server 测试中加入“零延迟完成”用例；不能声称窗口为零。

被 Goal 接管后，`on_turn_stop` 以 `ActiveOnly` 统计剩余进度并结束 Turn accounting；thread idle lifecycle 随后继续 active Goal。[官方源码：extension.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/extension.rs#L1866-L1971) [官方源码：runtime.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/runtime.rs#L2206-L2377)

显式 Skill 产生的 instruction fragment 会保存在 Turn 历史中，普通后续 continuation 因此可以看到它；但 selection 本身仍是首轮 Turn-scoped。Codex remote compaction 会丢弃这类非真实用户的 instruction wrapper，因此该桥接不能保证跨 compaction 继续保持 explicit-only Skill 的激活。[官方源码：compact_remote.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/core/src/compact_remote.rs#L357-L380) 长期方案仍必须把 selected Skill 绑定到 Goal，并在 continuation、resume 和 compaction 后重新注入。

### B. 上游 Goal API 扩展

建议的能力边界是让一次 Goal activation（目标激活）原子地包含：

```json
{
  "threadId": "thread-1",
  "objective": "完成并交付 Issue #123",
  "status": "active",
  "tokenBudget": 400000,
  "initialInput": [
    { "type": "text", "text": "$implement 完成并交付 Issue #123" },
    { "type": "skill", "name": "implement", "path": "/repo/.agents/skills/implement/SKILL.md" }
  ]
}
```

字段名称只是示意；关键契约是：Goal persisted state（持久状态）与首个 Turn 的显式 Skill selection 必须在同一 Runtime 操作中建立，避免客户端竞态。后续自动续轮应继续持有 Goal-scoped selection，不能只依赖首轮历史中的 Skill 指令；否则 compaction 或新 continuation 仍可能丢失激活语义。

Action 侧负责：

1. 从 Workflow 配置获得要显式调用的 Skill name，而不是从任意不可信 Issue 文本自动授权 Skill。
2. 调用 `skills/list`，在当前 thread cwd 下要求唯一的 enabled match。
3. 把 App Server 返回的规范 path 原样传回 Goal activation。
4. 找不到、重复或 disabled 时在启动任何业务工作前失败。

App Server / Runtime 负责：

1. 校验 path 属于当前 catalog 的 enabled entry。
2. 按正式 Skill selection 路径加载依赖与完整说明。
3. 把 selection 与 Goal Run 生命周期绑定，并在自动续轮、恢复及 compaction 后保持一致。

### C. 模型调用 `create_goal` 的次选路径

可验证的实验序列：

1. `thread/start` 创建持久 thread。
2. `skills/list` 使用该 thread 的 cwd，解析配置的 `implement`，要求唯一且 enabled。
3. `turn/start` 同时发送：
   - 文本：明确要求“在任何文件、Git 或 GitHub 操作前，先调用 `create_goal`，objective 和 token budget 如下；确认 tool result 后再执行”；
   - `{ type: "skill", name: "implement", path }`。
4. 监听 `thread/goal/updated`，只在观察到本 thread、预期 objective、`active` 状态后把运行认定为 Work Goal。
5. 首轮结束而 Goal 未建立，Action 直接失败；不要退回普通 Turn loop，也不要再用 `thread/goal/set` 静默补建，因为那会恢复原问题。
6. Goal 建立后由 Runtime 原生自动续轮；终态监听和 Handoff 行为再按现有 Action 约束处理。

这个方案之所以可用，是 `create_goal` 在当前 Turn 内建立 active Goal，并把当前 Turn 计入 Goal；轮次结束后 Runtime 可以继续 Goal。但它仍不是确定性控制面：模型可能未调用、延迟调用或先做业务副作用。既然 paused-to-active 桥接可由 App Server 控制面完成确定性 Goal 创建，本方案降为次选。

Handoff 也需要单独设计。现有 Handoff 用第二次 `thread/goal/set` 替换 objective；若 Handoff 需要另一个显式 Skill，应使用相同 bootstrap 模式，或等待上游 Goal API 支持结构化 selection。不能假定 Work 首轮选择会自动变成新 Goal objective 的显式选择。

### `thread/inject_items` 不能替代 Skill invocation

`thread/inject_items` 会把客户端给出的任意 JSON 反序列化为 raw Responses `ResponseItem`，校验后直接写入 thread history；它不经过 `UserInput::Skill` 或 Skill selection。[官方源码：turn_processor.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server/src/request_processors/turn_processor.rs#L3905-L3955)

正式 explicit Skill 路径会由 Runtime：

- 依据 catalog 的 enabled entry 解析 name/path；
- 从 authoritative `SKILL.md` 读取内容；
- 处理 plugin、MCP、App connector 与其他 dependencies；
- 发出 invocation telemetry 和读取 warning；
- 生成带内部 kind 的 typed `SkillInstructions` fragment。

这些步骤由 Turn 构建与 Skills extension（技能扩展）共同完成，而不是简单拼接文件内容。[官方源码：turn.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/core/src/session/turn.rs#L754-L866) [官方源码：fragments.rs](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/skills/src/fragments.rs#L61-L96)

客户端确实可以自行读取 `SKILL.md`，伪造类似 `<skill>...</skill>` 的 user `ResponseItem` 后注入。模型在“内容可见性”层面可能照做，但这绕过上述 authority、enabled/path 校验、依赖启动、资源访问、warning、telemetry 和读取一致性；它只是 prompt injection（提示注入），不是协议级 Skill invocation，而且同样可能在 compaction 时消失。因此不应作为 Action 的默认兼容方案，最多用于明确标注且 fail-closed 的诊断实验。

## 不应采用的绕行

- 不读取并拼接客户 `SKILL.md`，也不伪造 `<skill>` fragment 注入 history。Skill 可能引用相对资源、脚本、依赖和其他策略；文本拼接不是官方 invocation contract。
- 不把 `skills/list` 的 `enabled: true` 当作已选择。它只证明 catalog entry 可用。
- 不在 active Goal 自动首轮已经被安排后再调用 `turn/start`。这依赖时序竞争，并可能被“thread 非 idle”拒绝。
- 不要求客户删除 `allow_implicit_invocation: false`。这会扩大模型可自行加载的能力面，并且不属于 Action 的发布权。
- 不把 cwd 作为修复。cwd 只影响发现范围；本故障发生在发现之后、显式 selection 没有进入 Goal Turn 的协议边界。

## 建议的后续验证票据

在改实现前，建议把工作拆成两个可独立验收的票据：

1. **0.153.4 paused-to-active prototype**：Fake App Server 增加 paused `thread/goal/set`、`skills/list`、结构化 `turn/start`、active `thread/goal/set` 的顺序断言；真实 App Server 使用一个 `allow_implicit_invocation: false` 的可观测 fixture Skill，覆盖 active mutation 在 `on_turn_start` 前、后以及首轮零延迟完成三种时序，并验证 token accounting 与后续 continuation。另加入触发 compaction 的负向用例，明确当前兼容边界。
2. **上游 Goal structured-input proposal**：以 `ThreadGoalSetParams`、Goal Runtime `ResponseItem` 路径和 TUI `UserInput::Skill` 路径为证据，提出原子 Goal activation + selected skills 的协议；验收要求覆盖首轮、自动续轮、resume 与 compaction。

在 prototype 通过前，不应把 Coding Task 的 `$implement` 交付链路重新声明为可靠。

## 长期方案可行性：Goal-scoped `selectedSkills`

### 可行性结论

可行，但必须修改上游 Codex；不能只在 Graph Engineering Action 中完成。长期契约应是 Goal-scoped selected skills（Goal 作用域已选技能），而不是通用 `initialInput`。后者会把图片、mention 和任意用户文本等 Turn 输入一起提升为持久控制面，扩大协议与安全面，却仍没有定义哪些部分需要在每次 continuation 后重建。

固定基线 `rust-v0.153.4`（commit `3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`）与本次调研时的官方 `main`（commit `5c5308fc9a9ee789049d646ef11e5400384b9c6f`，2026-09-20）在这个边界上没有演进：`ThreadGoalSetParams` 仍只有 `thread_id`、`objective`、`status`、`token_budget`；持久化 `ThreadGoal` 与 `thread_goals` 表也仍只有 objective、状态、预算、用量和时间。[0.153.4 协议](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L784-L865) [当前协议](https://github.com/openai/codex/blob/5c5308fc9a9ee789049d646ef11e5400384b9c6f/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L730-L811) [当前持久模型](https://github.com/openai/codex/blob/5c5308fc9a9ee789049d646ef11e5400384b9c6f/codex-rs/state/src/model/thread_goal.rs) [当前 schema](https://github.com/openai/codex/blob/5c5308fc9a9ee789049d646ef11e5400384b9c6f/codex-rs/state/goals_migrations/0001_thread_goals.sql) 官方 App Server 文档当前也只公布同样四个 `thread/goal/set` 字段；因此不能把未来兼容性建立在未发布的隐式行为上。[官方 App Server 文档](https://developers.openai.com/docs/app-server#manage-thread-goals)

### 最小持久状态模型

每个 Goal（以 `goal_id` 为生命周期身份）至少持久化有序、不可重复的：

```text
GoalSelectedSkill {
  goal_id
  name
  canonical_path
  skill_md_sha256
}
```

`name + canonical_path` 是 selection identity；`skill_md_sha256` 是恢复时的变更检测，不是把客户 Skill 内容复制进数据库。仅保存 name 不足以消除同名 Skill；仅保存 path 会丢失客户端选择与 catalog entry 是否一致的校验；没有 digest 则恢复后的 Goal 可能静默执行不同发布物。实现可用 `thread_goal_selected_skills` 子表（`goal_id, ordinal` 唯一）或等价原子 JSON 字段，但 Goal replacement、状态写入和 selected skills 必须在同一数据库事务提交。

这组字段是“确定性恢复”的最小集。若 Codex 希望允许 Goal 运行期间热更新 Skill，则可省略 digest，但那应是另一项显式、可见的产品策略，不能作为默认行为。Skill 引用的脚本和资料仍按既有 Skill 规则在使用时读取；本方案保证的是所选 `SKILL.md` 身份和指令不静默漂移，不承诺冻结整个 workspace。

### 协议：新增原子 start，读取结果暴露 selection

推荐新增 `thread/goal/start`，而不是继续让含大量 `Option` 的 `thread/goal/set` 同时承担“新建/替换”和“局部更新”：

```json
{
  "threadId": "thr_123",
  "objective": "完成并交付 Issue #123",
  "tokenBudget": 400000,
  "selectedSkills": [
    {"name": "implement", "path": "/repo/.agents/skills/implement/SKILL.md"}
  ]
}
```

该方法只创建新 Goal，或在旧 Goal 已 terminal 时替换；它必须在成功响应前完成 catalog resolution、权限校验、Goal 与 selection 的原子持久化，并由同一个受 Goal state permit 保护的操作启动首轮。已有 `thread/goal/set` 保持状态/预算/objective 的兼容更新语义；不带 `selectedSkills` 的旧客户端继续得到无绑定 Skill 的 legacy Goal。若上游更倾向只扩展现有方法，则 `selectedSkills` 必须使用 double-option 更新语义（omitted=keep、null/[]=clear、array=replace），并限制为创建或显式替换 Goal；否则一次普通 status update 可能意外清除 selection。

`ThreadGoal`、`thread/goal/get`、`thread/goal/updated` 和 resume snapshot 应返回 resolved selection（至少 name/path/digest），使客户端和审计日志能看见 Runtime 实际绑定了什么。它不是秘密，但路径输出继续遵守现有本地路径暴露边界。

### catalog 校验与 Runtime 注入 seam

客户端可先用 `skills/list` 提供 name/path，但它不是 authority。App Server 必须在原子 start 内以 thread 的有效 cwd、plugin 配置和 enabled 状态重新加载 catalog，并沿现有 structured Skill selection 规则验证：name 与 canonical path 指向同一个 enabled entry、无重复、路径确实来自 catalog，而不是信任客户端提供的任意文件。[0.153.4 selection](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/skills/src/selection.rs#L31-L104) [当前 selection](https://github.com/openai/codex/blob/5c5308fc9a9ee789049d646ef11e5400384b9c6f/codex-rs/ext/skills/src/selection.rs)

Runtime 注入点应位于 Goal `start_turn_if_idle` 决定启动 continuation 之后、构造本轮 model context 之前：从持久 Goal 读取 selected skills，经 Skills extension 的正式 loader 生成 typed `SkillInstructions` fragments，并与 Goal continuation context 一起组成本轮输入。不要在数据库保存渲染后的 prompt，也不要只在首轮伪造 `UserInput::Skill`。现有普通 Turn 已有 catalog selection、instruction loading、dependency/warning/telemetry 的正式 seam，应抽出可复用的“resolve selected refs -> load fragments”能力，而不是在 Goal extension 重写 Skill loader。[0.153.4 Turn skill loader](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/core/src/session/turn.rs#L754-L866) [Skill fragments](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/skills/src/fragments.rs#L61-L96) [Goal continuation runtime](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/ext/goal/src/runtime.rs#L443-L459)

每个自动续轮都从 Goal state 重建 ephemeral（临时）Skill instruction，不把它反复追加成用户历史项。这样 compaction 只压缩会话历史，不会删除 Goal control state；下一轮仍由 Goal state 重新注入。预算 accounting 和终态逻辑无需改变：只有 catalog 校验与 instruction loading 成功、Turn 被 Goal 接纳后才开始/继续计费；加载失败不应产生未受 Goal 记账的业务 Turn。

### resume、fork、compaction 与错误语义

- **resume**：在 active Goal 被允许唤醒 continuation 之前重载 catalog，并校验 name/path/digest。成功后按每轮 seam 注入；不能依赖 rollout history 中旧的 Skill fragment。
- **fork**：当前实现会在 fork 前 flush Goal progress，并复制 Goal snapshot；selected skills 必须作为同一 snapshot 的组成部分复制到新 `goal_id`/thread 关联中，再针对 fork 的有效 cwd/catalog 校验，校验完成前不得自动运行。[Goal service fork flush](https://github.com/openai/codex/blob/5c5308fc9a9ee789049d646ef11e5400384b9c6f/codex-rs/ext/goal/src/api.rs#L111-L128) [Goal snapshot store](https://github.com/openai/codex/blob/5c5308fc9a9ee789049d646ef11e5400384b9c6f/codex-rs/state/src/runtime/goals.rs)
- **compaction**：不复制或依赖历史 instruction wrapper；compaction 后的下一 Turn 从 Goal selected skills 重建，因此 local/remote compaction 行为一致。
- **missing/disabled/ambiguous/path mismatch**：原子 start 直接返回 `invalid_request`，不创建 Goal、不启动 Turn。
- **resume/fork 时缺失、disabled 或 digest changed**：fail closed，把 Goal 转成新的可观察 stopped reason（建议 `blocked` + machine-readable `skill_unavailable` / `skill_changed` detail），发 `thread/goal/updated` 和 warning；不得静默降级为“无 Skill” continuation，也不得自动改绑同名其他路径。
- **读取失败或 dependency 初始化失败**：同样在模型调用前停止；错误应携带 goal id、skill name、非敏感 path 和 reason，不能包含 Skill 全文或凭据。
- **Goal objective 更新**：保留 selection；新 Goal replacement 才能原子替换 selection。清空 selection 必须是客户端显式动作。

### 安全与 authority

selected skills 是能力选择，不只是 prompt 文本。Action 只能从受信 Workflow 配置声明要选的 Skill；不得从 Issue、评论或模型输出中的任意 `$name` 自动提升为 Goal binding。App Server 是最终 authority：只接受当前 thread catalog 中 enabled 的精确 entry，执行 canonicalization 和 workspace/plugin source 校验，并继续服从 sandbox、approval、MCP/App connection 与 plugin policy。`allow_implicit_invocation: false` 不应阻止这种经过客户端明确请求且服务端校验的 explicit selection；它只阻止模型自行选择。

path 本身不能成为授权凭证。尤其不能允许客户端以 `/tmp/x/SKILL.md` 绕过 catalog，也不能在 resume 时因为同路径文件被替换就继续执行；这正是服务端 catalog match 与 digest 的作用。Goal status、预算和权限上下文仍由 Runtime 所有，selected skills 不扩大 Skill 内命令或外部服务的权限。

### 迁移与演进兼容

这是可做成 additive 的协议/schema 变更：旧 Goal 的 selection 为空；旧 `thread/goal/set` 客户端行为不变；新客户端通过 capability/方法可用性探测 `thread/goal/start.selectedSkills`。数据库 migration 为现存 Goal 建立空集合，不回填或猜测历史 `$name`。新服务端读取旧 rollout/state 时按 empty selection；旧服务端收到新方法会明确 method-not-found，Action 应 fail closed 并报告“固定 Codex 版本不支持 Goal-scoped skills”，不能退回纯文本 `$implement`。

当前 `main` 虽新增了 queue、thread settings、dynamic tool persistence 等能力，但 Goal 字段仍未改变；这说明 selected skills 可以借鉴“运行元数据被持久并在 resume 恢复”的模式，却不能假定已有 Goal 兼容层会代为保存它。[当前 App Server protocol](https://github.com/openai/codex/blob/5c5308fc9a9ee789049d646ef11e5400384b9c6f/codex-rs/app-server-protocol/src/protocol/v2/thread.rs) [官方 resume 文档](https://developers.openai.com/docs/app-server#threads)

### 必须覆盖的测试矩阵

| 维度 | 必须证明的结果 |
|---|---|
| 原子创建 | Goal+selection 持久成功后才启动首轮；任一校验/DB 写失败均无 Turn、无半成品 Goal |
| selection | enabled exact name/path 成功；missing、disabled、duplicate、ambiguous、path traversal/mismatch 均失败 |
| implicit policy | `allow_implicit_invocation: false` 的 Skill 可被显式 Goal selection 使用，且未选择时不出现在模型可用列表 |
| 自动续轮 | 至少两个 continuation 均获得 typed Skill instructions，历史不重复堆积 wrapper |
| resume/restart | App Server 进程重启后 active/paused/blocked Goal 保留 selection；仅 active 在校验成功后继续 |
| fork | fork snapshot 复制 selection 与 accounting；新 thread 校验失败时不运行，源 Goal 不受影响 |
| compaction | local 与 remote compaction 后下一轮仍注入同一 selection |
| 内容变化 | `SKILL.md` digest 改变、删除、禁用、同名路径替换均 fail closed 并给出 machine-readable reason |
| 生命周期 | pause/resume、blocked resume、complete、budgetLimited、usageLimited、clear、Goal replacement 均不串用旧 selection |
| accounting | 首轮和每次续轮全部计入同一 Goal；Skill 加载失败消耗为零且不启动模型 Turn |
| 权限 | selected Skill 不改变 sandbox/approval；非 catalog path 和不可信 objective 中的 `$name` 不能获得绑定 |
| 协议兼容 | 旧客户端/旧 Goal 仍工作；新客户端对旧 server 明确失败；get/update notifications 可完整 round-trip selection |

### 所有权判断

Graph Engineering Action 可以负责声明所需 Skill、用 `skills/list` 做预检、发送新协议字段、检查响应与在不支持时 fail closed；它不能独自保证首轮原子性、把 selection 写入 Codex Goal store、在 Runtime 自动续轮前重注入、参与 resume/fork snapshot，也不能在 compaction 后恢复被历史丢弃的 instructions。

因此长期方案的必要实现面是上游 Codex 的 app-server protocol、goal service/state migration、Goal Runtime 与 Skills extension seam；Graph Engineering 只能在上游能力发布后做消费适配。结论不是“Action 实现更麻烦”，而是 Action 根本不拥有完成这些语义所需的持久状态和续轮生命周期。
