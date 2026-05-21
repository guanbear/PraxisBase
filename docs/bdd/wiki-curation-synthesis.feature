# language: zh-CN
功能: Wiki curation synthesis
  为了让 PraxisBase 真正把 agent 经验梳理成稳定 wiki
  作为个人用户或团队知识库维护者
  我需要 raw evidence 先经过 AI/compile 合成，再把少量有 provenance 的 wiki proposal 交给 review/promote

  背景:
    假如 当前工作目录是一个 PraxisBase workspace
    并且 稳定知识只能通过 proposal、review 和 promote 修改
    并且 raw evidence 不是稳定知识
    并且 raw transcripts、raw logs、tokens、cookies、auth headers、private keys 和 raw credentials 不能写入 Git
    并且 production curation 默认需要 AI provider

  场景: 多条 raw evidence 合成少量 curated proposals
    假如 50 条 Codex 和 OpenClaw evidence 都描述 "openclaw:auth-expired" 修复经验
    并且 它们都通过 privacy gate
    当 用户运行 "praxisbase wiki curate --review --json"
    那么 系统生成少量 "wiki_curated_proposal"
    并且 每个 proposal 包含 source_refs、source_hashes、source_count 和 evidence_ids
    并且 primary review count 等于 curated proposal 数量
    并且 系统不直接修改 "kb/" 或 "skills/"

  场景: 运维噪声不进入 review 队列
    假如 evidence 包含 session_meta JSON
    并且 evidence 包含 base_instructions JSON
    并且 evidence 内容是 "openclaw:unknown"
    并且 evidence 是 "Deep Sleep" 且 "Promoted 0 candidate(s)"
    并且 evidence 是 Codex 或 OpenClaw session boot/configuration metadata
    并且 evidence 是 OpenClaw reflection theme 或 memory promotion bookkeeping
    并且 evidence 是 official docs 或 API reference 且没有用户/agent 经验
    当 用户运行 "praxisbase wiki curate --review --degraded --json"
    那么 curation report 的 filtered_noise 是 7
    并且 系统不为这些 evidence 生成 curated proposal

  场景: 只有有用经验才能进入 curated proposal
    假如 evidence 是单来源
    并且 它包含一个明确的问题或用户偏好
    并且 它包含 agent 下次应该采取的行动或决策
    并且 它包含验证结果或可复用教训
    当 用户运行 "praxisbase wiki curate --review --json"
    那么 系统可以生成一个 "wiki_curated_proposal"
    并且 proposal 的 guards 包含 "experience_signal"、"actionability" 和 "verification_or_lesson"

  场景: 单来源弱证据不自动进入稳定 wiki
    假如 一个 personal curated proposal 只有 1 个 source_ref
    并且 它不是已验证修复、用户偏好、决策或明确 pitfall
    当 用户运行 "praxisbase review auto --promote-approved --json"
    那么 系统可以写入 review record
    但是 系统不自动修改 "kb/" 或 "skills/"
    并且 系统写入 human-required exception 说明 "weak_single_source"

  场景: 单来源高信号个人经验可以按个人策略自动进入稳定 wiki
    假如 一个 personal curated proposal 只有 1 个 source_ref
    并且 它通过 experience_signal、actionability、verification_or_lesson 和 not_reference_only guards
    并且 它是低风险 personal known_fix、procedure、pitfall 或 note
    当 用户运行 "praxisbase review auto --promote-approved --json"
    那么 系统可以自动写入 review record
    并且 系统可以按 personal policy 自动 promote 到 "kb/"

  场景: curated proposal 是 wiki 页面候选而不是日志摘要
    假如 一个 evidence cluster 包含 problem、actions、failed_attempts、outcome、verification 和 reusable_lessons
    当 AI curator synthesis 成功
    那么 proposal body 包含问题、适用上下文、修复步骤、失败路径、验证方式、风险和 provenance
    并且 proposal target_path 指向 "kb/" 或 "skills/" 下允许的路径
    并且 proposal 不包含 raw transcript 原文

  场景: dry-run 只写 curation report
    假如 evidence pool 中有安全的 OpenClaw auth 修复经验
    当 用户运行 "praxisbase wiki curate --dry-run --degraded --json"
    那么 系统写入 ".praxisbase/reports/wiki-curation/<report-id>.json"
    并且 系统不写入 ".praxisbase/inbox/proposals/"
    并且 系统不修改 "kb/"、"skills/" 或 "dist/"

  场景: production curation 没有 AI 配置时失败
    假如 ".praxisbase/ai/config.json" 不存在
    当 用户运行 "praxisbase wiki curate --review --json"
    那么 命令失败
    并且 错误 code 是 "AI_CURATOR_NOT_CONFIGURED"
    并且 系统不假装生成 production-ready wiki proposal

  场景: personal mode 默认可以自动处理低风险个人经验
    假如 用户已经运行 "praxisbase review policy init --mode personal --json"
    并且 有一个 personal scope 的 curated known_fix proposal
    并且 proposal guards 全部通过
    并且 proposal confidence 高于 policy 阈值
    当 用户运行 "praxisbase review auto --promote-approved --json"
    那么 系统写入 review record
    并且 系统通过现有 promote path 写入 "kb/known-fixes/"
    并且 stable page 保留 source_refs 和 source_hashes
    并且 raw transcript 不进入 stable page

  场景: personal mode 遇到高风险内容仍然需要人工
    假如 一个 personal proposal 包含 privacy risk
    或者 proposal 会提升到 team scope
    或者 proposal 是 skill 或 policy target
    或者 proposal 会修改已有稳定页面
    当 用户运行 "praxisbase review auto --promote-approved --json"
    那么 系统不自动 promote 该 proposal
    并且 系统写入 human-required exception

  场景: team mode 默认只自动 review 不自动 promote
    假如 用户已经运行 "praxisbase review policy init --mode team --json"
    并且 有一个 team scope 的 curated known_fix proposal
    并且 automated review 判断可以 approve
    当 用户运行 "praxisbase review auto --promote-approved --json"
    那么 系统写入 review record
    并且 系统不自动修改 "kb/" 或 "skills/"
    并且 输出说明 team auto-promotion disabled

  场景: team curation 拒绝 personal/private evidence
    假如 一个 source 的 scope 是 personal
    并且 daily run 的 mode 是 team-git
    当 系统运行 wiki curate
    那么 该 source 不进入 team evidence cluster
    并且 系统不为它生成 team proposal
    并且 report 记录 rejected personal count

  场景: review 页面数字和可点击列表一致
    假如 系统有 3 个 curated proposals
    并且 evidence pool 中有 57 条 raw evidence
    当 用户打开 "dist/index.html"
    那么 页面 primary pending count 是 3
    当 用户点击 pending count
    那么 页面显示 3 个 curated proposals
    并且 57 条 raw evidence 只作为 evidence/debug count 显示

  场景: promote 后 agent 可以获取新经验
    假如 一个 curated proposal 已经通过 review/promote 进入 "kb/known-fixes/openclaw-auth-expired.md"
    当 用户运行 "praxisbase context get --agent codex --stage repair --query openclaw:auth-expired --json"
    那么 context 返回该 known fix
    并且 返回内容包含 citation 或 source refs
