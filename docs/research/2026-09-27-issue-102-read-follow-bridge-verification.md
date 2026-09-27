# Issue #102：read-and-follow bridge 可行性验证

日期：2026-09-27。验证对象是 [Issue #102 的方案评论](https://github.com/tutar/graph-engineering/issues/102#issuecomment-5748311767)：由 Action 解析受信任 Goal prompt 中的 `$skill-name`，用 `skills/list` 取得 enabled Skill 的 canonical path，再把“先完整读取并遵循该文件”写入 `thread/goal/set.objective`。

## 结论

**方案在 Codex CLI 0.156.1 上可运行，已证明一条真实成功路径；尚未证明它达到 Issue 中的“可靠”验收标准。** 它是读取并遵循客户发布文件的兼容桥接，仍不是 Codex 原生 structured Skill invocation。官方 App Server 文档将原生显式调用放在带 `{ type: "skill", name, path }` 的 `turn/start` 输入中，而 Goal set 只接受字符串 objective。[OpenAI App Server 文档](https://developers.openai.com/codex/app-server#skills)、[0.156.1 Goal 协议](https://github.com/openai/codex/blob/rust-v0.156.1/codex-rs/app-server-protocol/src/protocol/v2/thread.rs)

## 真实 App Server 验证

使用本机 `codex-cli 0.156.1`，在 `/tmp` 建立全新 fixture 工作目录和独立 `CODEX_HOME`；后者只复制现有登录凭据并设置模型，不带个人 Memory。fixture Skill 的 `agents/openai.yaml` 设置 `allow_implicit_invocation: false`，`SKILL.md` 中放入仅该文件含有的随机验证标记。测试结束已清理临时目录及凭据副本。

临时 Node harness 通过当前 Action 的 `AppServerClient` 依次执行：`thread/start` → `skills/list { cwds, forceReload: true }` → 确认唯一、enabled、canonical path → `thread/goal/set { status: "active", objective: "先读取并遵循 canonical SKILL.md …" }`。观察到：

```text
catalog_matches=1 enabled=true canonical=true
set_status=active
goal=complete
turn=completed types=reasoning,commandExecution,reasoning,reasoning,agentMessage
terminal=complete marker_seen=true final="ISSUE102-O92V6MPMSM"
```

随机标记只写在 fixture `SKILL.md`，未放进 Goal objective 或 catalog description。因此，最终回答精确包含该标记，连同完成的 `commandExecution`，直接支持模型读取并遵循了目标文件。此结果是一次真实成功运行，不是对重复运行可靠性的统计证明。

## 发现的集成边界

1. `thread/goal/updated` 的 `complete` 通知可以先于最后的 `turn/completed` 和 `agentMessage`。首次 harness 在 Goal 终态后立刻调用 `thread/read`，读到的仅是进行中的 Turn 和早期 commentary；等待 Turn 完成后才读到验证标记。接入现有 Action 时，最终消息读取必须与 Turn 完成同步，不能把 Goal 终态当成最终消息已持久化。
2. `skills/list` 只证明 catalog 发现和 enabled 状态。此次没有验证 missing、disabled、同名歧义、path 不一致时的 Action fail-closed 实现；现有 Action 还没有桥接逻辑。必须在 `thread/goal/set` 前做这些检查。
3. 本次没有验证多次运行、自动续轮、compaction、恢复或 Skill 依赖初始化。模型对 objective 指令的遵循仍是行为性保证，不能写成原生 Skill selection 的确定性保证。
4. 当前仓库 Coding Task Workflow 仍 pin `codex-version: 0.153.4`；本次真实验证只覆盖本机 `0.156.1`。在修改 Workflow pin 或声明当前交付链路已可用前，仍需对目标运行版本重跑。

验证未修改生产 Action、客户 Skill 或 Issue；未勾选 Issue 的验收条件。
