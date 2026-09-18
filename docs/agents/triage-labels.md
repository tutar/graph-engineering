# Triage labels

| Matt Skill 中的角色 | GitHub 标签 | 含义 |
|---|---|---|
| `needs-triage` | `needs-triage` | 等待维护者判断 |
| `needs-info` | `needs-info` | 等待报告者补充信息 |
| `ready-for-agent` | `ready-for-agent` | 规格完整，可由 AFK Agent 处理 |
| `ready-for-human` | `ready-for-human` | 需要人类执行或实时参与 |
| `wontfix` | `wontfix` | 明确不处理 |

Matt Skills 提到某个 triage role 时，使用表中对应的 GitHub 标签。Triage state 之外只使用下述明确登记的运行态标签与任务触发标签，不把它们解释为新的 triage role。

## Operational label

`in-progress` 表示 Loop 已领取并正在处理该 Issue。它不是 Matt triage state role，可以与恰好一个 state role 共存；不得用它替代 `ready-for-agent`、`ready-for-human` 等 triage 状态。

## Task trigger labels

- `development-ticket` 启动 Development Task（研发实现任务）。
- `coding-ticket` 启动 Coding Task（编码任务）。

两者是互不替代的 Workflow 路由输入，不表达票据是否已完成、是否可由 Agent 处理或是否需要人工参与；这些状态仍由上表的 triage 标签表达。
