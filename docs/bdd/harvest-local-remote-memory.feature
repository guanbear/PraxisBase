# language: zh-CN
功能: Harvest Local And Remote Memory
  为了让个人和团队都能更简单地提炼 Codex、OpenClaw 和远端 OpenClaw 经验
  作为 PraxisBase 用户
  我需要一条高层 harvest 命令统一完成本地采集、远端获取、ingest、wiki 编译和站点生成

  背景:
    假如 当前工作目录是一个 PraxisBase workspace
    并且 系统使用 protocol_version "0.1"
    并且 M12 memory scan/ingest 已经可用
    并且 M12.1 memory fetch 已经可用
    并且 默认情况下 harvest 不直接修改 "kb/" 或 "skills/"
    并且 tokens、cookies、headers、raw logs、完整 transcript 和 private keys 不能写入 Git

  场景: 个人模式下本地 workspace 是知识库本体
    假如 用户没有启用 "--team"
    当 用户运行 "praxisbase harvest --codex <codex-source> --openclaw <openclaw-source> --build-site --json"
    那么 系统在本地 workspace 写入 memory evidence、harvest report 和 wiki proposal candidates
    并且 系统生成或更新本地 "dist/index.html"
    并且 输出 authority_mode 为 "personal-local"
    并且 系统不要求 GitHub、GitLab 或远端 Git 存在

  场景: 团队模式下 Git repo 是知识库本体
    假如 当前 workspace 是一个 Git checkout
    并且 用户启用 "--team"
    当 用户运行 "praxisbase harvest --remote openclaw-prod --team --branch harvest/openclaw-prod --commit --json"
    那么 系统在 "harvest/openclaw-prod" 分支写入 harvest 输出
    并且 系统创建 Git commit
    并且 输出 authority_mode 为 "team-git"
    并且 系统不直接修改 protected branch

  场景: 团队模式禁止在 protected branch 上直接提交
    假如 当前 Git branch 是 "main"
    并且 用户启用 "--team --commit"
    并且 用户没有提供 "--branch"
    当 用户运行 "praxisbase harvest --remote openclaw-prod --team --commit --json"
    那么 命令失败
    并且 错误 code 是 "HARVEST_BRANCH_REQUIRED"
    并且 系统不创建 commit

  场景: Git export repo 只是远端传输通道
    假如 用户注册 remote "openclaw-prod" 类型为 "git"
    并且 该 remote 指向一个私有 OpenClaw export repo
    当 用户运行 "praxisbase harvest --remote openclaw-prod --build-site --json"
    那么 系统从 export repo 拉取 redacted export JSON
    并且 系统将 export repo 内容写入 ".praxisbase/cache/remotes/openclaw-prod"
    并且 系统通过 memory fetch 和 memory ingest 导入安全摘要
    并且 系统不把 export repo 当作 stable knowledge 本体

  场景: SSH remote 自动获取远端 OpenClaw export
    假如 用户注册 remote "openclaw-ssh" 类型为 "ssh"
    并且 remote 配置包含 host 和 path
    当 用户运行 "praxisbase harvest --remote openclaw-ssh --json"
    那么 系统通过 SSH/SCP 获取 export JSON
    并且 系统把下载文件写入 ".praxisbase/staging/remote-imports"
    并且 系统不在 report 中写入 SSH 私钥、token 或命令原始输出

  场景: HTTP remote 自动下载 redacted export
    假如 用户注册 remote "openclaw-http" 类型为 "http"
    并且 一个本地 mock HTTP server 返回 OpenClaw export JSON
    当 用户运行 "praxisbase harvest --remote openclaw-http --json"
    那么 系统下载 export JSON
    并且 系统通过 exported-json provider 生成安全 staging envelope
    并且 输出 report 中 fetched 大于 0

  场景: OpenClaw API remote 复用 M12.1 provider
    假如 用户注册 remote "openclaw-api-prod" 类型为 "openclaw-api"
    并且 环境变量 "OPENCLAW_TOKEN" 已设置
    当 用户运行 "praxisbase harvest --remote openclaw-api-prod --json"
    那么 系统调用 M12.1 openclaw-api provider
    并且 写入 fetch report 和 harvest report
    并且 写入内容不包含 "OPENCLAW_TOKEN" 的值

  场景: harvest 默认不自动 promote
    假如 harvest 已经生成 wiki proposal candidates
    当 用户运行 "praxisbase harvest --all --build-site --json"
    那么 report 中 "changed_stable_knowledge" 是 false
    并且 "kb/" 和 "skills/" 不被直接修改

  场景: 自动 promote 必须显式开启 review
    当 用户运行 "praxisbase harvest --all --auto-promote --json"
    那么 命令失败
    并且 错误 code 是 "HARVEST_AUTO_REVIEW_REQUIRED"
    并且 系统不修改 stable knowledge

  场景: push 必须先 commit
    当 用户运行 "praxisbase harvest --remote openclaw-prod --team --push --json"
    那么 命令失败
    并且 错误 code 是 "HARVEST_COMMIT_REQUIRED"
    并且 系统不 push 到远端 Git
