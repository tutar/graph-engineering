# Legacy Development Quick Start

本文仅适用于已发布并验证的 `github-development-ticket/v0.1.2` Legacy Frozen Definition（旧版冻结定义）。它从历史 Git tag [`0.1.2`](https://github.com/tutar/loop-engineering/tree/0.1.2/workflow-definitions/github-development-ticket/v0.1.2) 取得，不属于 `v0.3.0` 的默认安装路径，也不会自动迁移 Thread Record、runner 工作区或项目配置。

## 1. 准备项目

目标仓库需要 GitHub Actions，以及一台能够运行 Codex、GitHub CLI（`gh`）和 Node.js 22+ 的持久化 self-hosted runner。Actions 服务用户必须已经登录 Codex 并可使用 `/goal`；仓库需要允许 Actions 写入 contents、issues 和 pull requests，并允许 Actions 创建 Pull Request。

该版本只验证过同一台持久化 runner 上的恢复。GitHub-hosted runner、ephemeral runner、多个不共享 Codex Thread 存储的 runner、Claude Managed Agents 及其他 Agent Runtime 不在其支持承诺内。

## 2. 安装 Matt Skills

在目标项目根目录执行：

```bash
npx skills add https://github.com/mattpocock/skills
```

安装结果至少需要包含 `implement`、`tdd` 和 `code-review`。Workflow 直接使用 `$implement`，用户不需要分别调用这些 Skill。

## 3. 复制冻结 Definition

从 tag `0.1.2` 的 `workflow-definitions/github-development-ticket/v0.1.2/files/.github/` 复制以下内容到目标仓库：

```text
.github/
├── loop-engineering/
│   ├── github-development-ticket.mjs
│   ├── development-worktree.sh
│   ├── stop-hook-drain.mjs
│   └── thread-record.mjs
└── workflows/
    └── github-development-ticket.yml
```

复制后形成由目标项目自行拥有的 Workflow Instance（工作流实例）。不要用当前主分支文件替换冻结版本后继续声称它仍是 `v0.1.2`。

## 4. 完成项目配置

1. 创建 `ready-for-agent`、`development-ticket` 和 `in-progress` 标签。
2. 按项目实际情况修改 runner labels、默认分支、Git identity、超时和 token budget。
3. 在 Goal 启动前安装项目依赖，并把必要的可执行文件、缓存目录和域名加入最小 sandbox 权限。
4. 检查仓库 Actions 设置已允许创建 Pull Request。

## 5. 触发 Ticket

创建包含业务目标与可勾选 Acceptance Criteria（验收条件）的 open Issue。先添加 `ready-for-agent`；确认它是可以直接实现的 Development Ticket 后，再添加 `development-ticket`。

新增 `development-ticket` 会触发 Workflow。也可以在 Actions 页面手动运行 `github-development-ticket` 并输入 Issue number。第一次运行创建 Codex Thread；同一 Issue 的后续手动运行恢复该 Thread。

该版本只交付到 Draft PR，不自动 approve、merge 或 deploy。当前 Graph Engineering 安装方式及显式迁移入口见[根 README](../README.md)。
