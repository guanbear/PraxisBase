# language: zh-CN
功能: Daily Agent Experience Loop
  为了让个人和团队每天自动沉淀 agent 经验
  作为同时使用 Codex、OpenClaw 和 Claude Code 的用户或团队
  我需要用 source 配置经验来源，用 daily 命令生成 wiki 化知识，并让人和 agent 使用同一批知识

  背景:
    假如 当前工作目录是一个 PraxisBase workspace
    并且 系统使用 protocol_version "0.1"
    并且 稳定知识只能通过 proposal、review 和 promote 修改
    并且 raw transcripts、raw logs、完整 chat body、tokens、cookies、headers 和 private keys 不能写入 Git
    并且 Skill+CLI 是默认 agent 接入方式
    并且 MCP 是可选桥接层
    并且 HTML 站点以 wiki 为主，不提供单独的 "experience.html"

  场景: 个人模式配置本地 Codex、本地 OpenClaw 和远端 OpenClaw
    当 用户运行 "praxisbase source add local-codex --agent codex --type local --path ~/.codex/archived_sessions --scope personal --json"
    并且 用户运行 "praxisbase source add local-openclaw --agent openclaw --type local --path ~/.openclaw/exports/latest.json --scope project --json"
    并且 用户运行 "praxisbase source add remote-openclaw --agent openclaw --type ssh --host user@example.com --path ~/.openclaw/exports/latest.json --scope project --json"
    那么 系统写入三个 ".praxisbase/sources/*.json" 配置
    并且 配置中不包含 token、cookie、auth header 或 private key

  场景: 个人模式 daily run 生成 wiki 和 agent context
    假如 已配置 local-codex、local-openclaw 和 remote-openclaw source
    当 用户运行 "praxisbase daily run --mode personal --build-site --context-query openclaw --json"
    那么 系统写入 ".praxisbase/reports/daily/<report-id>.json"
    并且 系统写入 experience envelopes
    并且 系统运行 wiki compile
    并且 系统生成或更新 "dist/index.html"
    并且 输出 authority_mode 是 "personal-local"
    并且 输出 changed_stable_knowledge 是 false

  场景: Feishu OpenClaw bot 被建模为 OpenClaw source
    当 用户运行 "praxisbase source add openclaw-bot --agent openclaw --channel feishu --type openclaw-api --remote bot-prod --scope team --json"
    那么 source config 的 agent 是 "openclaw"
    并且 source config 的 channel 是 "feishu"
    并且 source config 的 parser 是 "openclaw-export"
    并且 系统不把 "feishu" 当作 source agent

  场景: 团队模式从 OpenClaw bot memory 获取经验而不是抓飞书原始聊天
    假如 source "openclaw-bot" 的 agent 是 "openclaw"
    并且 channel 是 "feishu"
    当 用户运行 "praxisbase daily run --mode team-git --branch harvest/daily --commit --build-site --json"
    那么 系统通过 OpenClaw API 或 export transport 获取 redacted OpenClaw memory
    并且 experience envelope 的 source_ref 可以记录 Feishu channel provenance
    并且 Git 中不保存飞书 raw chat body

  场景: 团队模式导入 Claude Code 修复 OpenClaw 的经验
    假如 source "claude-repair-log" 指向一个日志系统导出的 Claude Code repair log
    当 用户运行 "praxisbase daily run --mode team-git --branch harvest/daily --commit --build-site --json"
    那么 系统生成 agent 为 "claude-code" 的 experience envelope
    并且 envelope 包含 redacted_summary、source_ref、source_hash 和 scope_hint
    并且 envelope 不包含完整 raw log

  场景: 团队模式拒绝 personal scope
    假如 一个 source 的 scope_default 是 "personal"
    当 用户运行 "praxisbase daily run --mode team-git --branch harvest/daily --commit --json"
    那么 系统拒绝该 source 产生的 team proposal
    并且 daily report 的 rejected 大于 0
    并且 系统不把 personal 内容写入 "kb/"、"skills/" 或 proposal body

  场景: 团队模式把隐私不确定内容送入人工异常
    假如 Claude Code repair log 中包含 token 或 private key 模式的内容
    当 用户运行 "praxisbase daily run --mode team-git --branch harvest/daily --commit --json"
    那么 系统写入 ".praxisbase/exceptions/human-required/<exception-id>.json"
    并且 daily report 的 human_required 大于 0
    并且 Git 中不保存 token 或 private key 的值

  场景: team Git 在 protected branch 上提交必须指定 harvest branch
    假如 当前 Git branch 是 "main"
    当 用户运行 "praxisbase daily run --mode team-git --commit --json"
    那么 命令失败
    并且 错误 code 是 "HARVEST_BRANCH_REQUIRED"
    并且 系统不创建 commit

  场景: team Git push 必须先 commit
    当 用户运行 "praxisbase daily run --mode team-git --branch harvest/daily --push --json"
    那么 命令失败
    并且 错误 code 是 "HARVEST_COMMIT_REQUIRED"
    并且 系统不 push 到远端 Git

  场景: GitLab scheduled daily harvest
    假如 知识仓库使用 "templates/gitlab/knowledge-repo.gitlab-ci.yml"
    当 GitLab scheduled pipeline 设置 "PRAXISBASE_TASK=daily-harvest"
    那么 pipeline 运行 "praxisbase daily run --mode team-git"
    并且 写任务使用 "resource_group: praxisbase-write"
    并且 daily harvest 在 review、promote 和 build 之前运行

  场景: HTML 首页展示每日知识更新而不是经验列表页
    假如 daily run 已经生成 daily report
    当 用户运行 "praxisbase wiki build-site --json"
    那么 "dist/index.html" 显示最近知识更新摘要
    并且 "dist/issues.html" 显示 privacy 或 human-required findings
    并且 系统不生成 "dist/experience.html"

  场景: agent 通过 Skill+CLI 获取最新已审核共享知识
    假如 daily run 已经生成 proposal candidate
    并且 review/promote 已经把安全 proposal 晋升为 wiki 知识
    当 OpenClaw 运行 "praxisbase context get --agent openclaw --stage repair --query openclaw --json"
    那么 输出包含匹配的 reviewed context item
    并且 输出不要求 OpenClaw 安装 MCP

  场景: MCP 作为可选桥接不能绕过隐私和 promote gate
    假如 MCP client 调用 daily 或 harvest 类工具
    当 请求没有显式启用 review/promote
    那么 输出 changed_stable_knowledge 是 false
    并且 team-git privacy policy 仍然生效
