---
status: superseded by ADR-0009
---

# 将会话恢复限定为 Agent Action 的本地执行能力

本项目需要 Codex 中断后的上下文延续，但不承担常驻任务服务、Runner 调度或跨机器状态迁移的生命周期。决定由维护版 Agent Action（智能体 Action）拥有 Task Invocation（任务调用）的本地会话映射与完成记录：新事件建立独立任务，同一 GitHub Run 的显式 rerun 可恢复原生会话；不增加统一入口 Workflow 或远端任务记录，接受本地材料不可取得时无法判断旧会话和完成状态的限制。

原会话不存在、损坏或无法加载时，先保存可取得的失败原因与现场，通过 GitHub Warning annotation 和 Job Summary 明确展示，再以 Session Replacement（会话替换）继续同一任务。网络、配额和普通执行失败保留原会话，等待显式重试；业务状态核对由 Harness（驾驭系统）负责，不把本地恢复成功视为业务验收通过。

这一取舍重新打开了此前恢复研究中的“条件不足则交接”建议，并将 Fresh Goal Run（全新目标运行）明确限定为新任务的执行方式；同任务重试可以恢复，独立任务仍不能共享会话。完整工作区与会话只在本地可用，不承诺换 Runner 后恢复到中断瞬间、取得旧 session ID 或避免重做；同一物理机器的多个 Runner 实例并行必须验证安装、权限及工作区隔离，不能从 Codex 支持多个会话推断兼容。

该决策保留 ADR-0002 的认证、不可变 Action revision 与 Consumer 重新验证要求。已确认规格见[同 Run 会话恢复、任务隔离与可见替换](https://github.com/tutar/graph-engineering/issues/61)；关联[原生 Goal 恢复研究](https://github.com/tutar/graph-engineering/issues/19)。它描述目标边界，不宣称当前历史 app-server Workflow 已完成迁移，也不改变既有 checkout 的事件订阅、标签或并发门禁。
