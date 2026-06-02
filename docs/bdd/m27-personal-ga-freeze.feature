# language: zh-CN
功能: M27 个人版 GA 封顶
  为了用一条命令钉死个人版 GA 并停止漂移
  作为 PraxisBase 个人版的最终验收
  我需要 release-audit 四门判定、full queue 真实 drain、≥1 promoted skill、GBrain 可选化，以及稳定知识的来源与 slug 卫生

  背景:
    假如 当前工作目录是一个已配置个人来源的 PraxisBase 仓库
    并且 系统使用 protocol_version "0.1"
    并且 个人来源包含 本地 OpenClaw、Codex app、codex-cliproxyapi

  场景: release-audit 输出四门状态
    假如 存在最新的 daily、lesson、skill-synthesis、context 报告
    当 用户运行 "praxisbase personal release-audit --json"
    那么 JSON 响应包含字段 "wiki_context_ga"
    并且 JSON 响应包含字段 "skill_compiler_ga"
    并且 JSON 响应包含字段 "gbrain_runtime_ga"
    并且 JSON 响应包含字段 "personal_ga"
    并且 每个 blocker 都包含 "next_command"
    并且 运行过程没有触发付费 AI 抽取

  场景: bounded smoke 不能让 Gate 1 通过
    假如 最新 daily 运行的 "queue.run_kind" 等于 "bounded_smoke"
    并且 "remaining_high_priority_items" 大于 0
    并且 没有逐项显式 blocker
    当 用户运行 "praxisbase personal release-audit --json"
    那么 JSON 响应字段 "wiki_context_ga" 等于 "fail"
    并且 blockers 包含 reason "personal_queue_incomplete"

  场景: full run 真实 drain 高优先级来源
    当 用户运行 "praxisbase daily run --mode personal --full --json" 直到完成
    那么 "remaining_high_priority_items" 由 source chunks 与 source-item ledger 计算得出
    并且 仅当所有高优先级 chunk 都有当前 ledger 条目时 "queue.run_kind" 等于 "full_run"

  场景: 无 sidecar 时 context 返回 PB 权威条目
    当 agent 运行 "praxisbase context get --agent openclaw --stage diagnosis --mode personal --query \"openclaw dispatch\" --json"
    那么 JSON 响应返回 PB 稳定知识条目
    并且 不依赖 GBrain 或 AgentMemory sidecar

  场景: 晋升的 skill 可被注入
    假如 一个 personal skill candidate 通过了 validation 和 semantic review
    当 该 skill 被晋升并运行 "praxisbase skill inject-preview --query \"openclaw dispatch routing failure\" --json"
    那么 JSON 响应返回该已晋升 skill
    并且 promotion audit 记录 proposal id、candidate id、validation id、semantic review id、source hashes 和 reviewer/policy

  场景: GBrain 可被 waive 而个人 GA 仍可通过
    假如 GBrain 未配置或设置了 "--waive-gbrain"
    当 用户运行 "praxisbase personal release-audit --json"
    那么 JSON 响应字段 "gbrain_runtime_ga" 等于 "waived"
    并且 在 "wiki_context_ga" 与 "skill_compiler_ga" 均为 pass 时 "personal_ga" 等于 "pass"

  场景: dreaming 来源在晋升时被拒绝
    假如 一个 candidate 的 sources 包含 "memory/dreaming/light/2026-05-19.md#abc"
    当 系统评估晋升
    那么 系统拒绝该 candidate
    并且 "praxisbase kb audit --json" 报告该违规路径

  场景: kb prune 清理脏页并修复 wikilink
    假如 一个稳定 kb 页面未通过来源卫生检查
    当 用户运行 "praxisbase kb prune --yes"
    那么 该页面被删除
    并且 指向该页面的 "[[wikilink]]" 被解除链接

  场景: 长标题晋升后使用规范化 slug
    假如 一个 candidate 标题为 "Missing replay data compromises the ability to debug or verify past execution behaviors"
    当 它被晋升
    那么 文件名是不超过 80 字符的 kebab-case slug
    并且 完整标题保存在 frontmatter "title"

  场景: 最终个人 GA 全绿
    当 用户运行 "praxisbase personal release-audit --json"
    那么 JSON 响应字段 "wiki_context_ga" 等于 "pass"
    并且 JSON 响应字段 "skill_compiler_ga" 等于 "pass"
    并且 JSON 响应字段 "gbrain_runtime_ga" 属于 "pass" 或 "waived"
    并且 JSON 响应字段 "personal_ga" 等于 "pass"
