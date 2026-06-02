# language: zh-CN
功能: Agent Access And Wiki Hardening
  为了让 PraxisBase 真正成为 agent 可用的知识底座
  作为同时使用 Codex、OpenCode、OpenClaw 和远端 OpenClaw 的用户
  我需要默认用 Skill+CLI 简单接入，并且可选用 MCP，同时得到更稳的 wiki compiler 和更好看的静态 HTML 站点

  背景:
    假如 当前工作目录是一个 PraxisBase workspace
    并且 系统使用 protocol_version "0.1"
    并且 稳定知识只能通过 proposal、review 和 promote 修改
    并且 raw transcripts、raw logs、tokens、cookies、headers 和 private keys 不能写入 Git
    并且 CLI+Skill 是默认 agent 接入方式
    并且 MCP 是可选桥接层，不是核心依赖

  场景: 生成 agent 可读的 PraxisBase Skill
    当 用户运行 "praxisbase agent-tools generate --agent codex --json"
    那么 系统写入 ".praxisbase/agent-tools/manifest.json"
    并且 系统写入 ".praxisbase/agent-tools/skills/praxisbase/SKILL.md"
    并且 Skill 包含 context before repair、capture after repair、harvest、wiki build 和安全规则
    并且 Skill 明确说明 stable knowledge 只能通过 review/promote 修改

  场景: install dry-run 暴露 Skill 安装计划
    假如 已经生成 PraxisBase Skill
    当 用户运行 "praxisbase install codex --dry-run --json"
    那么 输出包含 PraxisBase Skill 的目标路径
    并且 输出不修改用户的 Codex 配置

  场景: MCP manifest 只是 CLI/core 的薄适配
    当 用户运行 "praxisbase mcp manifest --json"
    那么 输出包含 context、harvest、capture、wiki compile、wiki graph、wiki build-site 和 health 工具
    并且 每个工具都包含 mutates metadata
    并且 mutating 工具包含 dry-run 或 review 相关参数

  场景: MCP read-only context 工具返回和 CLI 同构的 JSON
    假如 "kb/known-fixes/openclaw-auth-expired.md" 存在
    当 MCP client 调用 "praxisbase_context_get" 查询 "openclaw auth expired"
    那么 返回包含 items、citations、warnings、truncated 和 budget
    并且 返回不修改 ".praxisbase/"、"kb/"、"skills/" 或 "dist/"

  场景: MCP 不能绕过 promote gate
    当 MCP client 调用 harvest 工具并且没有显式启用 auto review 和 auto promote
    那么 输出 "changed_stable_knowledge" 是 false
    并且 "kb/" 和 "skills/" 不被直接修改

  场景: wiki compile 生成 source analysis
    假如 capture summary 包含 "OpenClaw auth expired; refreshing login fixed the repair"
    当 用户运行 "praxisbase wiki compile --review --json"
    那么 compile report 包含 source_analysis
    并且 source_analysis 的 suggested_page_kind 是 "known_fix"
    并且 source_analysis 包含稳定 signature
    并且 proposal candidate 指向 allowlisted "kb/" 或 "skills/" 路径

  场景: personal scope 不会自动提升到团队知识
    假如 一个 Codex memory source 的 scope 是 "personal"
    当 用户运行 "praxisbase wiki compile --review --json"
    那么 source_analysis 保留 personal scope
    并且 系统不生成 team、org 或 global scope 的 stable candidate
    并且 如果用户请求提升 scope，系统写入 proposal 或 human-required exception

  场景: duplicate candidate path 进入 conflict exception
    假如 两个 source analysis 都建议同一个 candidate path
    并且 它们没有相同 signature 或明确 merge 关系
    当 用户运行 "praxisbase wiki compile --review --json"
    那么 系统写入 ".praxisbase/exceptions/conflicts/<exception-id>.json"
    并且 系统不写入互相覆盖的 proposal candidate

  场景: wiki quality report 暴露健康问题
    假如 wiki 中存在 broken link、duplicate signature 和 orphan active page
    当 用户运行 "praxisbase wiki build-site --json"
    那么 系统写入 ".praxisbase/reports/wiki-quality/<report-id>.json"
    并且 report 包含 broken link、duplicate signature 和 orphan finding
    并且 "dist/issues.html" 显示这些问题

  场景: graph overview 默认有上限
    假如 wiki 中有 500 个页面
    当 用户运行 "praxisbase wiki graph --mode overview --limit 80 --json"
    那么 输出最多包含 80 个 node
    并且 输出包含 total_nodes、returned_nodes 和 truncated
    并且 输出排序稳定

  场景: graph ego 模式可以展开邻居
    假如 页面 "openclaw-auth-expired" 有入链和出链
    当 用户运行 "praxisbase wiki graph --mode ego --center openclaw-auth-expired --depth 2 --json"
    那么 输出包含中心页面
    并且 输出包含 2 跳以内的相关页面
    并且 输出不包含无关孤立页面

  场景: 静态站生成更完整的 wiki browser
    当 用户运行 "praxisbase wiki build-site --json"
    那么 系统生成 "dist/index.html"
    并且 系统生成 "dist/graph.html"
    并且 系统生成 "dist/issues.html"
    并且 系统生成 "dist/search-index.json"
    并且 系统生成 "dist/graph-slices/overview.json"
    并且 每个页面都有 HTML、TXT 和 JSON sibling

  场景: 静态 HTML 可以直接用 file URL 打开
    假如 用户没有启动 HTTP server
    当 用户打开 "dist/index.html"
    那么 Dashboard、搜索框、页面导航、issues 链接和 graph 链接可见
    并且 页面不依赖远端 API 才能显示核心内容

  场景: HTML 输出防止 script 注入
    假如 wiki page body 包含 "<script>alert(1)</script>"
    并且 page JSON 中包含 "</script>"
    当 用户运行 "praxisbase wiki build-site --json"
    那么 输出 HTML 不执行 raw script
    并且 script-embedded JSON 不提前结束 script 标签

  场景: local individual flow 可以一条命令完成
    假如 本地 Codex source 中有一条安全的修复经验
    当 用户运行 "praxisbase harvest --codex <source> --build-site --context-query openclaw --json"
    那么 系统写入 harvest report
    并且 系统写入 wiki compile report
    并且 系统写入 wiki quality report
    并且 系统生成静态站
    并且 context_items 大于 0

  场景: team Git flow 不把远端 export repo 当成本体
    假如 remote "openclaw-prod" 是 git export transport
    当 用户运行 "praxisbase harvest --remote openclaw-prod --team --branch harvest/openclaw-prod --commit --build-site --json"
    那么 系统从 export repo 读取 redacted export
    并且 系统在 knowledge repo 的 harvest branch 生成报告和候选
    并且 changed_stable_knowledge 是 false
    并且 export repo 不被当作 stable knowledge authority
