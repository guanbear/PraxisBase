# language: zh-CN
功能: AI-first experience distill
  为了让 PraxisBase 真正把 agent 记录提炼成可复用 wiki 和 skill
  作为个人用户或团队知识库维护者
  我需要 AI distill 成为生产路径的核心能力，同时由确定性隐私和 review gate 保证安全

  背景:
    假如 当前工作目录是一个 PraxisBase workspace
    并且 稳定知识只能通过 proposal、review 和 promote 修改
    并且 raw transcripts、raw logs、tokens、cookies、auth headers、private keys 和 raw credentials 不能写入 Git
    并且 Skill+CLI 是默认 agent 接入方式
    并且 MCP 只是可选桥接层

  场景: 生产 daily run 没有 AI 配置时必须明确失败
    假如 ".praxisbase/ai/config.json" 不存在
    当 用户运行 "praxisbase daily run --mode personal --build-site --json"
    那么 命令失败
    并且 错误 code 是 "AI_DISTILL_NOT_CONFIGURED"
    并且 输出提示用户运行 "praxisbase ai init"
    并且 系统不假装生成 production-ready wiki

  场景: 用户显式启用 degraded mode 时允许离线粗摘要
    假如 AI provider 未配置
    当 用户运行 "praxisbase daily run --mode personal --degraded --build-site --json"
    那么 命令成功
    并且 daily report 的 ai_distill.configured 是 false
    并且 daily report 的 ai_distill.mode 是 "degraded"
    并且 daily report 的 ai_distill.production_ready 是 false
    并且 输出包含低置信度警告

  场景: AI provider 配置不保存密钥
    当 用户运行 "praxisbase ai init --provider openai-compatible --model configured-by-user --json"
    那么 系统写入 ".praxisbase/ai/config.json"
    并且 config 中包含 api_key_env
    并且 config 中包含 ai_timeout_ms
    并且 config 中不包含真实 API key、token、cookie 或 auth header

  场景: AI doctor 不打印密钥值
    假如 环境变量 "PRAXISBASE_LLM_API_KEY" 已设置
    当 用户运行 "praxisbase ai doctor --json"
    那么 输出包含 provider readiness
    并且 输出不包含 "PRAXISBASE_LLM_API_KEY" 的真实值

  场景: AI distill 生成结构化经验
    假如 一个 Codex session chunk 描述了问题、修改、测试和结果
    并且 AI provider 返回合法 DistilledExperience JSON
    当 用户运行 "praxisbase ai distill --source <codex-session> --agent codex --json"
    那么 输出包含 summary、actions、outcome、verification、reusable_lessons 和 suggested_wiki_kind
    并且 输出包含 source_ref、source_hash 和 chunk_hashes

  场景: AI 返回非法 JSON 时不能进入 wiki
    假如 AI provider 返回无法通过 schema 校验的内容
    当 daily run 执行 AI distill
    那么 系统在 ".praxisbase/reports/ai-distill/" 写入失败计数
    并且 该 item 不生成 experience envelope
    并且 该 item 不生成 wiki proposal

  场景: AI provider 超时不会卡住 daily run
    假如 AI provider 在 ai_timeout_ms 内没有返回
    当 daily run 执行 AI distill 或读取 provider response body
    那么 当前 AI item 失败并记录 timeout diagnostic
    并且 命令不会无限等待 provider 响应

  场景: 用户可以限制 daily run 的 uncached AI 调用总量并查看 chunk 级进度
    假如 AI provider 已配置
    当 用户运行 "praxisbase daily run --mode personal --max-ai-chunks 20 --ai-timeout-ms 30000 --ai-concurrency 2 --max-curation-proposals 5 --build-site --json"
    那么 系统最多向 AI distill provider 发送 20 个 uncached chunk
    并且 cache hit 不消耗 uncached AI 调用预算
    并且 daily report 暴露 uncached AI 调用预算和已使用数量
    并且 daily report 的 ai_distill.warnings 包含 "max_ai_chunks_reached:20"
    并且 系统写入 ".praxisbase/runs/live/<run-id>.json" 进度文件
    并且 进度文件包含 current_stage、current_source、current_chunk 和 uncached budget counters

  场景: 本地 Codex 全量历史不会在 source 解析阶段卡死
    假如 Codex session 目录包含长中文和英文混合 transcript
    当 daily run 执行 source chunking
    那么 系统按新文件优先和 AI chunk budget 限制候选读取
    并且 多字节文本按字节上线性切分
    并且 进度能进入 ai_distill 阶段

  场景: personal mode 对安全本地 transcript 不应大量 human-required
    假如 Codex 本地 session 不包含 token、cookie、auth header、private key 或 credential dump
    并且 AI provider 已配置
    当 用户运行 "praxisbase daily run --mode personal --build-site --json"
    那么 系统把 session 分块并执行 AI distill
    并且 安全 AI summary 可以进入 personal raw-vault ref
    并且 raw transcript 不写入 Git
    并且 human_required 不因为 transcript 形态本身增加

  场景: personal mode 遇到真实密钥仍然 human-required
    假如 Codex 本地 session chunk 包含 private key 或 token 模式
    当 daily run 执行 privacy precheck
    那么 该 chunk 不发送给 AI
    并且 系统写入 ".praxisbase/exceptions/human-required/<exception-id>.json"
    并且 raw secret 不写入 report、proposal、site 或 context

  场景: team mode 拒绝 personal scope
    假如 一个 source 的 scope_default 是 "personal"
    并且 daily run 的 mode 是 "team-git"
    当 系统准备 AI distill
    那么 该 source 在 team gate 被拒绝
    并且 不调用 AI provider
    并且 不生成 team proposal

  场景: AI 输出泄露隐私时被 postcheck 拦截
    假如 AI provider 返回的 summary 中包含 token 模式
    当 系统执行 privacy postcheck
    那么 该 summary 被丢弃
    并且 系统写入 human-required exception
    并且 该 summary 不进入 raw-vault、wiki、site 或 context

  场景: AI-distilled 经验生成更有用的 wiki proposal
    假如 DistilledExperience 包含 problem、actions、failed_attempts、outcome、verification 和 reusable_lessons
    当 wiki compile 运行 review mode
    那么 proposal body 包含问题、适用上下文、做法、失败路径、验证方式和来源引用
    并且 proposal 不直接写入 "kb/"

  场景: 重复成功经验可以生成 skill proposal
    假如 多条 DistilledExperience 有相同 trigger 和相似 procedure
    并且 outcome 都是 "success"
    当 skill synthesis 运行
    那么 系统生成 skill proposal candidate
    并且 proposal 仍需 review/promote 才能写入 "skills/"

  场景: daily 可以限制 skill synthesis 候选数量
    假如 distill cache 中有多个稳定 skill 信号 cluster
    当 用户运行 "praxisbase daily run --mode personal --skill-synthesis --max-skill-candidates 1 --json"
    那么 系统最多生成 1 个 skill candidate
    并且 该限制不改变 distill lane 的 "--max-ai-chunks" 语义

  场景: 首次使用 agent 能读懂 bootstrap skill
    当 用户运行 "praxisbase bootstrap personal --agent codex --install-skill --json"
    那么 系统生成 agent-readable Skill 或指令文件
    并且 文件包含 ai doctor、source discovery、daily run、HTML path、context get 和 human-required review 的步骤
    并且 文件提醒 agent 不要打印或提交 raw secrets
