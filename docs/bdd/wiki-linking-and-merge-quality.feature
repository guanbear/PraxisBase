# language: zh-CN
功能: Wiki linking and merge quality
  为了让 PraxisBase 生成真正可供 agent 使用的知识网络
  作为个人用户或团队知识库维护者
  我需要重复经验被合并成 canonical wiki，相关页面自动互链，孤岛页面被解释或阻断

  背景:
    假如 当前工作目录是一个 PraxisBase workspace
    并且 稳定知识只能通过 proposal、review 和 promote 修改
    并且 raw evidence 不是稳定知识
    并且 production wiki curation 默认需要 AI provider

  场景: 重复 ACK timing 经验不会生成一堆孤岛页面
    假如 6 条 evidence 都描述 OpenClaw ACK timing 修复
    并且 它们有不同 source_ref 但相同 canonical problem/action
    当 用户运行 "praxisbase wiki curate --review --json"
    那么 系统生成 1 个 canonical topic
    并且 page plan 不是 6 个 create
    并且 curation report 的 relationship_counts.orphan_risk_after_plan 小于 6

  场景: 重复 stdin-closed 经验合并成一个 canonical topic
    假如 6 条 Codex 或 OpenCode evidence 都描述 subprocess stdin closed 修复
    当 系统运行 relationship planning
    那么 系统生成 1 个 canonical topic
    并且 proposal 的 source_count 是 6
    并且 proposal 保留所有 source_refs 和 source_hashes

  场景: 已有稳定页面时创建计划改为 update
    假如 "kb/known-fixes/openclaw-ack-timing.md" 已经存在
    并且 新 topic 与该页面有相同 canonical topic key 或 source hash
    当 系统运行 page planning
    那么 page plan 的 action 是 "update"
    并且 系统不生成新的 "kb/known-fixes/openclaw-ack-timing-2.md"

  场景: 多个 canonical 稳定页面导致 merge review
    假如 一个 topic 同时匹配 2 个稳定页面
    并且 两个页面都不是明显的唯一目标
    当 系统运行 page planning
    那么 page plan 的 action 是 "merge"
    并且 proposal review_hint 包含 "ambiguous_merge_target"
    并且 系统不会自动 archive 任何稳定页面

  场景: 有相关页面时 AI 必须写 wikilink
    假如 page plan 找到 related stable page "openclaw-auth-expired"
    并且 该 related page 被标记为 required link
    当 AI curator synthesis 返回 body 包含 "[[openclaw-auth-expired|OpenClaw auth expired]]"
    那么 promotion quality gate 通过 missing_wikilinks 检查
    并且 proposal 记录 required_links

  场景: 有 required link 但正文没写链接时需要人工
    假如 page plan 找到 2 个 required links
    并且 AI 输出没有 wikilink 或 related metadata
    当 系统运行 promotion quality gate
    那么 proposal 进入 human-required
    并且 reason 包含 "missing_wikilinks"
    并且 不会 auto-promote

  场景: 没有相关页面时孤立页面允许进入 review
    假如 一个 high-signal personal topic 没有 canonical、strong 或 related stable page
    并且 proposal 通过 provenance、privacy、path 和 wiki-shape guards
    当 系统运行 promotion quality gate
    那么 proposal 不因为 orphan 被 hard-block
    并且 report 把它计入 isolated_topics_without_related_pages

  场景: 个人内容不会自动合并到团队 wiki
    假如 一个 personal topic 与 team stable page 有 entity overlap
    当 系统运行 relationship planning
    那么 系统不生成自动 team merge
    并且 relationship reason 包含 "cross_scope_merge"
    并且 team proposal 不包含 personal raw evidence

  场景: curation report 暴露链接和合并质量
    假如 wiki curate 完成
    当 用户读取 ".praxisbase/reports/wiki-curation/<report-id>.json"
    那么 report 包含 relationship_counts.required_links
    并且 report 包含 relationship_counts.suggested_links
    并且 report 包含 relationship_counts.merge_plans
    并且 report 包含 relationship_counts.orphan_risk_after_plan

  场景: Review 页面解释为什么要链接或合并
    假如 有一个 pending curated proposal 包含 required_links 和 merge_candidates
    当 用户打开 "dist/review.html"
    那么 candidate card 显示 required links
    并且 candidate card 显示 merge target
    并且 candidate card 显示 relationship reasons

  场景: 重新生成站点后 graph orphan 数下降
    假如 fixture 中有 10 条 ACK/stdin 相关 evidence
    并且 已有 2 个稳定页面可作为 related pages
    当 用户运行 "praxisbase wiki curate --review --json"
    并且 用户运行 "praxisbase review auto --promote-approved --json"
    并且 用户运行 "praxisbase wiki build-site --json"
    那么 输出中的 pages 小于 evidence 数量
    并且 输出中的 orphans 小于 pages
