# language: zh-CN
功能: Knowledge Governance Phase 2
  为了让 PraxisBase 的知识可以成长、过期、去重和按需消费
  作为维护多 agent 知识库的团队
  我需要 deterministic-first 的治理命令，并且所有稳定知识变更仍然经过 proposal/review/promote

  背景:
    假如 当前工作目录是一个已经初始化的 PraxisBase 知识仓库
    并且 系统使用 protocol_version "0.1"
    并且 治理命令不能直接修改 "kb/" 或 "skills/" 下的稳定对象
    并且 Phase 2 不使用向量数据库或外部搜索服务

  场景: P2-A lint 输出 error 和 warning
    假如 仓库中存在缺少 frontmatter 的知识文件
    并且 仓库中存在包含 raw log-like content 的 "kb/raw-log.md"
    并且 仓库中存在两个相同 signature 的 known fix
    当 用户运行 "praxisbase lint --json"
    那么 输出包含 severity 为 "error" 的 missing frontmatter finding
    并且 输出包含 severity 为 "error" 的 raw log finding
    并且 输出包含 severity 为 "warning" 的 duplicate signature finding
    并且 系统写入 ".praxisbase/reports/lint/<run-id>.json"

  场景: P2-A duplicate id 进入 conflict exception
    假如 仓库中存在两个 frontmatter id 相同的知识对象
    当 用户运行 "praxisbase lint --json"
    那么 输出包含 duplicate id error
    并且 系统写入 ".praxisbase/exceptions/conflicts/<exception-id>.json"
    并且 系统不修改原始知识对象

  场景: P2-A recommended action 与 forbidden action 矛盾
    假如 一个 known fix 在 signature "openclaw:workspace-lock-stuck" 下推荐 "force-kill openclaw process"
    并且 一个 pitfall 在相同 signature 下的 forbidden_actions 包含 "force-kill openclaw process"
    当 用户运行 "praxisbase lint --json"
    那么 输出包含 contradiction error
    并且 系统写入 ".praxisbase/exceptions/human-required/<exception-id>.json"
    并且 系统不修改原始知识对象

  场景: P2-B draft 知识生成 verified proposal
    假如 "kb/known-fixes/openclaw-auth-expired.md" 的 maturity 是 "draft"
    并且 inbox 中有 2 个 success episode 引用了该知识
    并且 没有更新的 failed 或 partial episode 引用该知识
    当 用户运行 "praxisbase govern maturity --json"
    那么 系统写入 ".praxisbase/inbox/proposals/<proposal-id>.json"
    并且 proposal 的 patch 将 maturity 改为 "verified"
    并且 系统不直接修改 "kb/known-fixes/openclaw-auth-expired.md"

  场景: P2-B verified 知识生成 proven proposal
    假如 一个 verified knowledge object 有 5 个 positive references
    并且 references 覆盖至少 2 个 environment_id
    并且 references 覆盖至少 2 个 agent_id
    并且 references 跨度至少 7 天
    并且 最近 30 天没有 unresolved negative reference
    当 用户运行 "praxisbase govern maturity --json"
    那么 系统生成 maturity proven proposal
    并且 proposal 需要走 review 和 promote

  场景: P2-B negative reference 阻止 maturity 晋升
    假如 一个 draft knowledge object 有 2 个 success references
    但是 存在一个更新的 failed reference
    当 用户运行 "praxisbase govern maturity --json"
    那么 系统不生成 verified proposal
    并且 输出说明 blocked_by_negative_reference

  场景: P2-C verified 知识过期生成 stale proposal
    假如 一个 verified knowledge object 180 天没有 positive reference
    当 用户运行 "praxisbase govern decay --json"
    那么 系统写入 decay report
    并且 系统生成 stale 或 downgrade proposal
    并且 系统不直接修改 stable knowledge

  场景: P2-C proven 知识出现负反馈进入人工异常
    假如 一个 proven knowledge object 收到 negative reference
    当 用户运行 "praxisbase govern decay --json"
    那么 系统写入 ".praxisbase/exceptions/human-required/<exception-id>.json"
    并且 系统不直接把 maturity 降级

  场景: P2-D Markdown 冷启动导入只生成 proposal
    假如 目录 "legacy-docs/" 包含 Markdown 知识文档
    当 用户运行 "praxisbase import markdown legacy-docs --json"
    那么 系统写入 ".praxisbase/runs/import/<run-id>.json"
    并且 系统写入 ".praxisbase/inbox/proposals/<proposal-id>.json"
    并且 proposal 包含 source_refs、source_hash 和 redacted_summary
    并且 proposal 的 maturity 是 "draft"
    并且 系统不直接写入 "kb/"

  场景: P2-D 飞书导入不会提交 raw chat logs
    假如 文件 "feishu-export.json" 包含飞书群消息导出
    当 用户运行 "praxisbase import feishu feishu-export.json --json"
    那么 系统生成 proposal 或 draft episode
    并且 Git 中只保存 source refs、hash 和 redacted_summary
    并且 Git 中不保存完整 raw chat logs

  场景: P2-E diagnosis context 遵守查询预算
    假如 同一个 signature 匹配很多 known fixes、pitfalls 和 procedures
    当 agent 请求 diagnosis stage context
    那么 输出大小默认不超过 16 KB
    并且 exact signature match 排在前面
    并且 proven 知识优先于 verified 和 draft
    并且 被预算裁掉的对象保留 citation

  场景: P2-E repair context 优先 skill 和 procedure
    假如 同一个 signature 匹配 skills、procedures、known fixes 和 pitfalls
    当 agent 请求 repair stage context
    那么 输出大小默认不超过 24 KB
    并且 skill 和 procedure 在 exact match 后优先
    并且 输出包含 forbidden operations

  场景: P2-E verification context 只保留验证相关内容
    假如 同一个 signature 匹配多个完整知识对象
    当 agent 请求 verification stage context
    那么 输出大小默认不超过 12 KB
    并且 输出优先包含 verification、rollback 和 escalation 内容
