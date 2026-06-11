# language: zh-CN
功能: Wiki 编译内核重做
  为了让 PraxisBase 真正符合 LLM Wiki 的思想
  作为使用 Codex、OpenClaw、OpenCode 和团队 agent 的用户
  我需要系统把 raw evidence 编译成少量持续合并、可追溯、互相链接的 wiki 页面

  背景:
    假如 PraxisBase 已配置 AI curator
    并且 stable knowledge 只能通过 proposal、review 和 promote 写入

  场景: 重复 ACK timing 经验被合并成一个 canonical topic
    假如 有 6 条不同 evidence 都描述 OpenClaw ACK timing 修复经验
    当 用户运行 "praxisbase wiki curate --review --json"
    那么 系统生成 1 个 canonical topic
    并且 系统最多写入 1 个 wiki proposal
    并且 proposal 的 provenance 包含全部相关 source refs 或 source hashes

  场景: 重复 stdin closed 经验不会生成多页
    假如 有 6 条 evidence 都描述 delegation 后 stdin closed 的处理经验
    当 用户运行 "praxisbase wiki curate --review --json"
    那么 系统生成 1 个 canonical topic
    并且 不会生成 6 个相似的 stable page 候选

  场景: 已有稳定页面时生成 update plan
    假如 "kb/known-fixes/openclaw-ack-timing.md" 已存在
    并且 新 evidence 描述同一 OpenClaw ACK timing 问题
    当 用户运行 "praxisbase wiki curate --review --json"
    那么 page plan 的 action 是 "update"
    并且 proposal 不会使用新的 create target path

  场景: 相同 source hash 不能创建多个稳定页面
    假如 两个候选 topic 都引用同一个 source hash
    当 系统运行 promotion quality gate
    那么 至少一个候选被 hard block
    并且 block reason 包含 "duplicate_source_hash"

  场景: raw JSON 不能进入 stable wiki
    假如 AI 输出的 body_markdown 包含原始 JSON 对象
    当 系统运行 promotion quality gate
    那么 proposal 被 hard block
    并且 review auto 不会 auto-promote 该 proposal

  场景: 模板 fallback 文案不能进入 stable wiki
    假如 proposal 正文包含 "Re-run the failing workflow and confirm the original symptom is gone"
    当 系统运行 promotion quality gate
    那么 proposal 被 hard block
    并且 block reason 包含 "template_fallback"

  场景: session boot 和系统提示不能成为 wiki 页面
    假如 evidence 只包含 Codex base instructions、sandbox mode、approval policy 和 available skills
    当 系统抽取 observations
    那么 系统生成 0 条 observation
    并且 系统不会写入 wiki proposal

  场景: 官方文档只能作为 provenance 不能单独成页
    假如 evidence 只是一段官方 API reference
    并且 没有用户或 agent 的修复、偏好、决策或验证经验
    当 系统抽取 observations
    那么 系统生成 0 条 observation

  场景: 高信号个人单源经验可以自动晋升
    假如 一条 personal evidence 包含明确问题、修复动作、验证结果和可复用经验
    并且 没有重复 source hash
    并且 没有相关页面需要链接
    当 用户运行 review auto 并开启 personal low-risk auto-promote
    那么 proposal 可以被 auto-promote

  场景: 有相关页面时缺少链接需要人工确认
    假如 page plan 找到 2 个 related stable pages
    并且 AI 输出没有 wikilink 或 related metadata
    当 系统运行 promotion quality gate
    那么 proposal 进入 human-required
    并且 不会 auto-promote

  场景: curation report 解释编译结果
    假如 wiki curate 完成
    当 用户读取 ".praxisbase/reports/wiki-curation/<report-id>.json"
    那么 report 包含 evidence、observation、topic 和 page plan counts
    并且 report 包含 hard block 和 human-required counts
    并且 report 包含 duplicate source hash groups

  场景: HTML 站点以稳定 wiki 和质量状态为主
    假如 wiki build-site 完成
    当 用户打开 HTML 首页
    那么 页面主要展示稳定 wiki 页面、最近更新和质量状态
    并且 raw evidence 数量不会被展示为主要 human-required 数量

