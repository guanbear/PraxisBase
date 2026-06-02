# language: zh-CN
功能: Wiki Compiler Knowledge Site
  为了让 PraxisBase 真正把多 agent 经验梳理成可追溯、可检索、可浏览的 wiki
  作为维护个人和团队知识库的用户
  我需要 file-first 的 wiki compiler、proposal-based 的知识更新、确定性的图谱和检索、以及漂亮的静态知识站

  背景:
    假如 当前工作目录是一个已经初始化的 PraxisBase 知识仓库
    并且 系统使用 protocol_version "0.1"
    并且 raw transcripts、完整日志、飞书原文、tokens、cookies 和密钥不能写入 Git
    并且 "wiki compile" 默认不能直接修改 "kb/"、"skills/" 或 "dist/"
    并且 "wiki build-site" 和 "praxisbase build" 才能写入 "dist/"
    并且 稳定知识变更必须走 proposal、review 和 promote
    并且 第一版不依赖 GUI、向量数据库、外部搜索服务、外部数据库、daemon 或 MCP server

  场景: M7 collector 读取稳定 kb 和 skills
    假如 "kb/known-fixes/openclaw-auth-expired.md" 包含 frontmatter、title、sources、scope 和 maturity
    并且 "skills/openclaw/auth-repair/SKILL.md" 包含 skill frontmatter 和正文
    当 系统运行 wiki collector
    那么 输出包含 kind 为 "stable_kb" 的 WikiSource
    并且 输出包含 kind 为 "skill" 的 WikiSource
    并且 每个 WikiSource 都有 deterministic id 和 source_hash
    并且 输出按 source id 稳定排序

  场景: M7 collector 对 capture 只使用 redacted summary
    假如 ".praxisbase/outbox/captures/" 中有一个 success capture
    并且 capture artifact 包含 source_ref、source_hash 和 redacted_summary
    当 系统运行 wiki collector
    那么 输出包含 kind 为 "capture" 的 WikiSource
    并且 该 WikiSource 的 summary 来自 redacted_summary
    并且 该 WikiSource 不包含 raw transcript body
    并且 系统不读取或复制 raw transcript 原文

  场景: M7 personal scope 不会被静默提升
    假如 一个 capture 的 scope_hint 是 "personal"
    当 系统运行 wiki collector 和 wiki compile
    那么 该 source 保持 personal scope
    并且 系统不会自动生成 team 或 org scope 的候选
    并且 如果需要提升 scope，必须生成 proposal 或人工异常

  场景: M7 compiler state 可删除重建
    假如 ".praxisbase/wiki/state.json" 不存在
    当 系统读取 wiki compiler state
    那么 系统返回空 state
    当 系统写入 state 后再读取
    那么 source_hash、last_compiled_at、candidate_ids 和 page_ids 被保留
    并且 删除 state 后可以重新全量编译

  场景: M8 dry-run compile 只写 report
    假如 outbox 中有一个新的 success capture
    当 用户运行 "praxisbase wiki compile --dry-run --json"
    那么 系统写入 ".praxisbase/reports/wiki-compile/<report-id>.json"
    并且 输出包含 candidate ids
    并且 系统不写入 ".praxisbase/inbox/proposals/"
    并且 系统不修改 "kb/" 或 "skills/"
    并且 系统不写入 "dist/"

  场景: M8 review compile 写 proposal candidate 并跳过 unchanged source
    假如 outbox 中有一个新的 success capture
    当 用户第一次运行 "praxisbase wiki compile --review --json"
    那么 系统写入 ".praxisbase/inbox/proposals/<candidate-id>.json"
    并且 系统写入 ".praxisbase/wiki/state.json"
    并且 report 中 "changed_stable_knowledge" 是 false
    当 用户第二次运行 "praxisbase wiki compile --review --json"
    那么 unchanged source 被跳过
    并且 第二次 report 的 candidate count 是 0

  场景: M8 privacy uncertainty 进入人工异常
    假如 一个 capture 的 redacted_summary 包含 "token" 或 "cookie"
    当 用户运行 "praxisbase wiki compile --review --json"
    那么 系统写入 ".praxisbase/exceptions/human-required/<exception-id>.json"
    并且 系统不生成可自动 review 的 proposal candidate
    并且 系统不修改稳定知识

  场景: M8 unsafe patch path 被拒绝
    假如 wiki candidate 的 patch path 指向 "../outside.md" 或 ".praxisbase/raw-vault/session.json"
    当 系统验证 candidate guard
    那么 验证失败
    并且 系统写入 exception 或 lint finding
    并且 系统不写入该 proposal candidate

  场景: M8 merge body shrink guard 阻止危险合并
    假如 一个 patch proposal 会把已有正文缩短到原正文的 70% 以下
    并且 action 不是 explicit archive
    当 系统验证 merge guard
    那么 验证失败
    并且 系统写入 body_shrink_violation
    并且 系统不修改 stable page

  场景: M9 resolver 解析 wikilink 并忽略代码块
    假如 一个 WikiPage 正文包含 "[[auth-repair-skill|Auth Repair]]"
    并且 同一正文的 inline code 或 fenced code block 中包含 "[[ignored]]"
    当 系统运行 deterministic resolver
    那么 graph 中存在当前页面到 "auth-repair-skill" 的 link
    并且 graph 中不存在指向 "ignored" 的 link
    并且 resolver 不调用 LLM

  场景: M9 graph 输出 broken links、duplicates 和 backlinks
    假如 两个 WikiPage 使用相同 slug
    并且 一个 WikiPage 链接到不存在的 "[[missing-page]]"
    当 用户运行 "praxisbase wiki graph --json"
    那么 输出包含 duplicate slug finding
    并且 输出包含 broken link finding
    并且 输出包含 backlinks map
    并且 系统不修改 stable knowledge

  场景: M9 diagnosis context exact signature 优先
    假如 "kb/known-fixes/openclaw-auth-expired.md" 的 signatures 包含 "openclaw:auth-expired"
    并且 仓库中还有相关 skill "skills/openclaw/auth-repair/SKILL.md"
    当 用户运行 "praxisbase context get --agent codex --stage diagnosis --query openclaw:auth-expired --json"
    那么 exact signature match 的 known fix 排在第一
    并且 graph-related skill 出现在后续 items 中
    并且 输出包含 citations

  场景: M9 CJK query 可以匹配中文标题和摘要
    假如 一个 WikiPage 的 title 是 "认证失败"
    并且 summary 包含 "OpenClaw 认证失败 需要刷新登录"
    当 用户运行 "praxisbase context get --agent codex --stage diagnosis --query 认证失败 --json"
    那么 中文页面出现在 context items 中
    并且 输出包含对应 citation

  场景: M9 budget truncation 保留 citations
    假如 一个 matching knowledge object 的正文超过 context max bytes
    当 用户运行 "praxisbase context get --agent codex --stage diagnosis --query openclaw --max-bytes 900 --json"
    那么 输出大小不超过 900 bytes
    并且 truncated 是 true
    并且 full body 可以被移除
    但是 citation 仍然保留

  场景: M10 build 生成知识站和现有 repair bundles
    当 用户运行 "praxisbase build"
    那么 系统生成 "dist/repair-bundles/manifest.json"
    并且 系统生成 "dist/kb-index.json"
    并且 系统生成 "dist/search-index.json"
    并且 系统生成 "dist/index.html"
    并且 系统生成 "dist/graph.json"
    并且 系统生成 "dist/graph.jsonld"
    并且 系统生成 "dist/llms-full.txt"
    并且 系统生成 "dist/ai-readme.md"
    并且 系统生成 "dist/style.css" 和 "dist/site.js"

  场景: M10 每个页面有 HTML、TXT 和 JSON sibling
    假如 stable knowledge 中存在页面 "openclaw-auth-expired"
    当 用户运行 "praxisbase wiki build-site --json"
    那么 系统生成 "dist/pages/openclaw-auth-expired.html"
    并且 系统生成 "dist/pages/openclaw-auth-expired.txt"
    并且 系统生成 "dist/pages/openclaw-auth-expired.json"
    并且 TXT 和 JSON sibling 与 HTML 页面引用同一个 source page

  场景: M10 知识站是可日常阅读的三栏页面
    当 用户打开 "dist/index.html"
    那么 第一屏显示 Knowledge Health Dashboard
    并且 页面包含全局搜索入口
    当 用户打开任意 "dist/pages/<slug>.html"
    那么 页面包含左侧知识导航
    并且 页面包含中间正文
    并且 页面包含右侧 TOC、provenance 和 related pages

  场景: M10 search 不需要服务器
    假如 "dist/search-index.json" 存在
    当 用户在静态页面按 "/" 或 Cmd/Ctrl+K
    那么 搜索输入框获得焦点
    并且 搜索结果来自本地 search-index
    并且 不需要启动 HTTP server

  场景: M10 HTML 输出转义 raw HTML 和 script-breaking JSON
    假如 Markdown 正文包含 "<script>alert('x')</script>"
    并且 页面 JSON 中包含 "</script>"
    当 系统生成静态 HTML
    那么 输出不会包含可执行的 raw script
    并且 JSON 嵌入不会提前终止 script 标签

  场景: M11 wiki lint 写入健康报告
    假如 graph 中存在 broken wikilink、duplicate slug 和 orphan active page
    当 系统运行 wiki lint
    那么 系统写入 ".praxisbase/reports/wiki-lint/<report-id>.json"
    并且 report 包含 errors 和 warnings summary
    并且 duplicate 被路由到 conflict exception
    并且 broken wikilink 被标记为 actionable finding

  场景: M11 dashboard 暴露 actionable health issues
    假如 wiki lint report 包含 stale、duplicate、broken-link 和 orphan findings
    当 用户打开 "dist/index.html"
    那么 Dashboard 显示 stale count
    并且 Dashboard 显示 duplicate count
    并且 Dashboard 显示 broken-link count
    并且 Dashboard 显示 orphan count

  场景: M11 lifecycle 和 confidence 是 deterministic
    假如 一个 WikiPage 的 maturity 是 "proven"
    并且 该页面有多个 source refs 和 positive references
    当 系统计算 lifecycle 和 confidence
    那么 lifecycle 是 "verified"
    并且 confidence 在 0 到 1 之间
    并且 相同输入重复计算得到相同结果

  场景: M11 stale/lifecycle 变化只生成 proposal
    假如 一个 verified page 超过 stale threshold 且没有 positive references
    当 系统运行 wiki health governance
    那么 系统可以生成 stale 或 maturity proposal
    并且 系统不直接修改 "kb/" 或 "skills/"
    并且 proposal 需要 review 和 promote

  场景: M11 smoke flow 可证明 wiki 闭环
    当 用户依次运行 init、capture finish、wiki compile dry-run、wiki compile review、wiki graph、build、context get
    那么 每个命令都返回 machine-readable JSON 或明确成功输出
    并且 dry-run compile 只写 report
    并且 review compile 写 proposal candidate 和 state
    并且 build 写 repair bundles 和 knowledge site
    并且 context get 返回 citations
    并且 wiki compile、graph 和 lint 不直接修改稳定知识
