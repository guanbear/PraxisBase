# language: zh-CN
功能: GBrain backend interop and PraxisBase boundary contraction
  为了避免 PraxisBase 重复建设通用 brain runtime
  作为同时使用 Codex、OpenClaw、远端 OpenClaw、GBrain 和可选 AgentMemory 的用户
  我需要 PraxisBase 专注经验编译和治理，并把长期 brain、图谱检索、MCP 和团队访问交给 GBrain

  背景:
    假如 当前工作目录是一个 PraxisBase workspace
    并且 stable knowledge 只能通过 proposal、semantic review、privacy gate 和 promote 修改
    并且 GBrain sidecar 命中不能直接作为 promotion evidence
    并且 AgentMemory 是可选 session memory backend
    并且 raw evidence、rejected candidates、human-required material、tokens、cookies 和 secrets 不能发布到 GBrain

  场景: 个人 daily 发布稳定经验到本地 GBrain
    假如 本地 Codex evidence 包含一个已验证的 OpenClaw 修复经验
    并且 personal policy 允许低风险自动晋升
    并且 本地 GBrain 配置了 source "praxisbase"
    当 用户运行 "praxisbase daily run --mode personal --publish-gbrain --json"
    那么 系统先生成并晋升 stable PraxisBase wiki page
    并且 系统把晋升后的 wiki page 发布到 GBrain source "praxisbase"
    并且 发布内容包含 promotion_id、review_id、source_hashes 和 praxisbase_path
    并且 发布内容不包含 raw transcript body

  场景: GBrain 不可用不阻塞 PB 本地治理
    假如 本地 GBrain CLI 不存在
    并且 一个安全经验可以晋升为 stable wiki
    当 用户运行 "praxisbase daily run --mode personal --publish-gbrain --json"
    那么 系统仍然完成 PraxisBase distill、review 和 promote
    并且 输出 warnings 包含 "gbrain_unavailable"
    并且 publish count 是 0

  场景: context get 稳定 PB 结果优先于 GBrain sidecar
    假如 "kb/known-fixes/openclaw-ack-timing.md" 是 stable PraxisBase page
    并且 GBrain search 对同一 query 返回一个高分但未治理的 sidecar hit
    当 用户运行 "praxisbase context get --query 'openclaw ack timing' --with-gbrain --json"
    那么 第一个 context item 的 authority 是 "stable_praxisbase"
    并且 GBrain item 的 authority 是 "gbrain_sidecar"
    并且 输出明确标记 sidecar 不能作为 promotion evidence

  场景: GBrain sidecar 需要 ingest 才能成为 PB 证据
    假如 GBrain query 返回一条可能有用的经验页面
    当 用户只运行 "praxisbase context get --with-gbrain --json"
    那么 系统不会创建 wiki proposal
    当 用户运行 "praxisbase gbrain import --source praxisbase --query 'openclaw ack timing' --json"
    那么 系统创建带 source_ref 和 source_hash 的 PraxisBase evidence envelope
    并且 后续 wiki candidate 可以引用该 envelope

  场景: 团队模式不能仅靠 GBrain source scope 绕过隐私门禁
    假如 一个 personal Codex evidence 包含个人路径或私人偏好
    并且 team GBrain OAuth client 只允许写入 source "team-praxisbase"
    当 用户运行 "praxisbase daily run --mode team-git --publish-gbrain --json"
    那么 系统阻止该 evidence 进入 team wiki candidate
    并且 系统不会向 team GBrain 发布该内容
    并且 report 包含 privacy block reason

  场景: GitLab-reviewed PB repo 是团队权威本体
    假如 团队使用 GitLab merge request 审核 PraxisBase stable knowledge
    并且 GBrain team source 已配置
    当 一个 wiki proposal 未通过 GitLab/human promotion
    那么 系统不会发布该 proposal 到 team GBrain
    当 proposal 被 promote 到 "kb/"
    那么 系统可以发布对应 stable page 到 team GBrain

  场景: AgentMemory 和 GBrain 可以共存
    假如 AgentMemory backend 配置为 session sidecar
    并且 GBrain backend 配置为 long-term brain
    当 用户运行 "praxisbase context get --query 'repair openclaw' --with-backend gbrain --with-backend agentmemory --json"
    那么 输出可以包含 stable_praxisbase、gbrain_sidecar 和 agentmemory_sidecar
    并且 排序优先级是 stable_praxisbase 高于 gbrain_sidecar 高于 agentmemory_sidecar

  场景: 本地 embedding 由 GBrain 拥有而 PraxisBase 只连接后端
    假如 本机 GBrain 使用 PGLite 数据库
    并且 本机 embedding endpoint 通过 OpenAI-compatible API 提供 1024 维 embedding
    并且 用户用 wrapper 把 embedding endpoint 环境变量传给 GBrain CLI
    当 用户运行 "praxisbase gbrain init --executable .praxisbase/gbrain-local --source praxisbase --json"
    并且 用户运行 "praxisbase gbrain doctor --json"
    那么 PraxisBase 报告 GBrain doctor 的 embedding 和 source 状态
    并且 PraxisBase 不保存 embedding secret、模型名称或向量维度作为自己的权威配置
    当 用户运行 "praxisbase context get --query 'same lesson in different words' --with-gbrain --json"
    那么 语义召回由 GBrain 返回为 "gbrain_sidecar"
    并且 stable PraxisBase 页面仍然排在 sidecar 之前

  场景: PB HTML 聚焦经验治理而不是通用 brain 浏览
    假如 GBrain backend 已配置
    当 用户运行 "praxisbase wiki build-site --json"
    那么 HTML 首页显示 stable experience、review queue、privacy blocks 和 GBrain publish status
    并且 HTML 不把 GBrain 全量 brain search 作为主页面职责
