# language: zh-CN
功能: OpenClaw Repair MVP agent knowledge substrate
  为了让临时和持久 OpenClaw 修复 agent 能共享经验
  作为 PraxisBase 的第一版实现
  我需要 file-first 和 CLI-first 的知识底座，支持 repair context、episode、proposal、AI review、promotion 和静态 bundle

  背景:
    假如 当前工作目录是一个空的 PraxisBase 测试仓库
    并且 系统使用 protocol_version "0.1"
    并且 没有外部搜索服务、向量数据库、MCP server 或 Hermes runner

  场景: 初始化 OpenClaw 修复知识底座
    当 用户运行 "praxisbase init"
    那么 系统创建 ".praxisbase/config.yaml"
    并且 系统创建 ".praxisbase/policies/autonomy.yaml"
    并且 系统创建 ".praxisbase/policies/risk-rules.yaml"
    并且 系统创建 ".praxisbase/inbox/episodes"
    并且 系统创建 ".praxisbase/inbox/proposals"
    并且 系统创建 ".praxisbase/outbox/episodes"
    并且 系统创建 "skills/openclaw/baseline-diagnostics/SKILL.md"
    并且 系统创建 "skills/openclaw/auth-repair/SKILL.md"
    并且 系统创建 "kb/known-fixes/openclaw-auth-expired.md"
    并且 ".praxisbase/config.yaml" 包含 "protocol_version: \"0.1\""

  场景: 临时修复 agent 从 auth expired 日志获取 repair context
    假如 文件 "auth-expired.log" 包含 "authentication expired"
    并且 文件 "auth-expired.log" 包含 "401 unauthorized"
    当 agent 运行 "praxisbase repair-context openclaw --logs auth-expired.log --json"
    那么 JSON 响应字段 "problem_signature" 等于 "openclaw:claude-auth-expired"
    并且 JSON 响应字段 "skills" 包含 "skills/openclaw/auth-repair/SKILL.md"
    并且 JSON 响应字段 "forbidden_operations" 包含 "modify production systems"
    并且 JSON 响应字段 "verification_steps" 非空
    并且 JSON 响应字段 "rollback_steps" 非空
    并且 JSON 响应字段 "escalation_conditions" 非空

  场景: 临时修复 agent 提交成功修复 episode
    假如 文件 "episode.json" 是一个有效 repair_episode
    并且 "episode.json" 包含 "agent_id"
    并且 "episode.json" 包含 "agent_type"
    并且 "episode.json" 包含 "environment_id"
    并且 "episode.json" 包含 "source_refs"
    并且 "episode.json" 包含 "idempotency_key"
    当 agent 运行 "praxisbase episode submit episode.json"
    那么 系统写入 ".praxisbase/inbox/episodes/<episode-id>.json"
    并且 写入文件保留原始 "source_refs"
    并且 写入文件保留原始 "problem_signature"

  场景: 缺少 provenance 的 episode 被拒绝
    假如 文件 "episode-without-source.json" 是一个 repair_episode
    并且 "episode-without-source.json" 的 "source_refs" 为空数组
    当 agent 运行 "praxisbase episode submit episode-without-source.json"
    那么 命令失败
    并且 错误输出包含 "source_refs"
    并且 系统不写入 inbox episode 文件

  场景: agent 提交带证据的 known fix proposal
    假如 文件 "known-fix-proposal.json" 是一个有效 knowledge_proposal
    并且 proposal 的 "target_type" 是 "known_fix"
    并且 proposal 的 "evidence.source_uri" 非空
    并且 proposal 的 "evidence.source_hash" 非空
    并且 proposal 的 "evidence.verification" 非空
    当 agent 运行 "praxisbase propose known-fix-proposal.json"
    那么 系统写入 ".praxisbase/inbox/proposals/<proposal-id>.json"
    并且 写入文件保留 evidence

  场景: 缺少 evidence hash 的 proposal 被拒绝
    假如 文件 "proposal-without-hash.json" 是一个 knowledge_proposal
    并且 proposal 的 "evidence.source_hash" 为空
    当 agent 运行 "praxisbase propose proposal-without-hash.json"
    那么 命令失败
    并且 错误输出包含 "source_hash"
    并且 系统不写入 inbox proposal 文件

  场景: 中风险 known fix proposal 由 AI reviewer 自动批准
    假如 inbox 中存在一个 target_type 为 "known_fix" 的 create proposal
    并且 proposal 包含 evidence source URI、hash 和 verification
    当 scheduled job 运行 "praxisbase review --auto"
    那么 系统写入 ".praxisbase/inbox/reviews/<review-id>.json"
    并且 review 的 "decision" 等于 "approve"
    并且 review 的 "risk" 等于 "medium"
    并且 review 的 "confidence" 大于或等于 0.75

  场景: 高风险 policy proposal 进入人工异常队列
    假如 inbox 中存在一个 target_type 为 "policy" 的 patch proposal
    当 scheduled job 运行 "praxisbase review --auto"
    那么 系统写入 review
    并且 review 的 "decision" 等于 "needs_human"
    并且 review 的 "risk" 等于 "high"
    当 scheduled job 运行 "praxisbase promote --auto"
    那么 系统不修改 "kb/"
    并且 系统不修改 "skills/"

  场景: approved known fix proposal 被自动晋升
    假如 inbox 中存在一个 approved review
    并且 review 的 "risk" 是 "medium"
    并且 review 的 "confidence" 大于或等于 0.75
    并且 对应 proposal 的 patch path 是 "kb/known-fixes/openclaw-auth-expired.md"
    当 scheduled job 运行 "praxisbase promote --auto"
    那么 系统写入 "kb/known-fixes/openclaw-auth-expired.md"
    并且 写入内容来自 proposal patch

  场景: unsafe patch path 不会被 promotion 写入
    假如 inbox 中存在一个 approved review
    并且 对应 proposal 的 patch path 是 "../outside.md"
    当 scheduled job 运行 "praxisbase promote --auto"
    那么 命令失败
    并且 系统不写入 "../outside.md"

  场景: 生成静态 repair bundle 和索引
    假如 工作区已经运行 "praxisbase init"
    当 用户运行 "praxisbase build"
    那么 系统创建 "dist/repair-bundles/openclaw-sandbox.json"
    并且 系统创建 "dist/repair-bundles/manifest.json"
    并且 系统创建 "dist/kb-index.json"
    并且 系统创建 "dist/search-index.json"
    并且 系统创建 "dist/llms.txt"
    并且 系统创建 "dist/index.html"
    并且 manifest 包含 bundle checksum
    并且 manifest 包含 compatible CLI version

  场景: 最新 bundle 不可用时 agent 使用 last-known-good
    假如 agent 已经缓存 last-known-good bundle
    并且 最新 bundle 下载失败
    当 agent 运行 "praxisbase bundle fetch openclaw --signature openclaw:claude-auth-expired"
    那么 命令返回 cached bundle
    并且 输出包含 cache warning
    并且 repair flow 可以继续

  场景: 知识仓库不可用时 agent 写入 outbox
    假如 agent 无法提交 episode 到 authority repo
    当 agent 运行 "praxisbase episode submit episode.json --offline-ok"
    那么 系统写入 ".praxisbase/outbox/episodes/<episode-id>.json"
    并且 写入文件包含 "idempotency_key"

  场景: GitLab scheduled pipeline 串行化写任务
    假如 仓库包含 "templates/gitlab/.gitlab-ci.yml"
    当 reviewer 检查 GitLab template
    那么 "praxisbase:review" job 包含 "resource_group: praxisbase-write"
    并且 "praxisbase:promote" job 包含 "resource_group: praxisbase-write"
    并且 build job artifacts 包含 "dist/"

  场景: MVP 不引入跑偏组件
    当 reviewer 检查本次实现 diff
    那么 diff 不包含 MCP server implementation
    并且 diff 不包含 Hermes runner implementation
    并且 diff 不包含 K8s runtime integration
    并且 diff 不新增 external search service dependency
    并且 diff 不新增 vector database dependency
    并且 diff 不包含 blockchain 或 distributed consensus implementation
