---
status: accepted
---

# 在本仓库维护 Development Action 的 CLI 选择

Development Task（研发任务）仍需要原有 Task Invocation（任务调用）与 Session Recovery（会话恢复）能力。锁定的 `tutar/codex-action@393ad456e354dc9da7be630c09be243cc1d212af` 每次执行都会新建目录并安装 Codex CLI，即使 runner 已有兼容版本；只把检测到的新版本传给它仍不能满足 Issue #103 的复用要求。该远端仓库当前也无法由本项目使用的账号读取。当前交付因此在 `workflow/.github/actions/development-codex/` 保存该提交的 Action bundle 与许可文件，仅替换运行时安装步骤：复用满足最低稳定版本的 runner CLI，缺失时安装最低版本；需要 API key proxy 时单独安装匹配版本的 proxy。

GitHub 的本地 Action 需要先 checkout，因此 Development Workflow 每次 attempt 都先 checkout，再执行原有 prepare/run 两阶段；持久 task state 位于 checkout 外，恢复时不覆盖既有 workspace 或 Session。这样保留恢复能力，但本仓库承担维护该 Action bundle 与跟踪上游修复的成本。历史发布版本保持原样。Coding Task 的 Codex Goal Action 仍是独立 Action，不被这个选择替换。
