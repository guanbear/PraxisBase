# language: zh-CN
功能: GBrain-first experience governance
  为了避免 PraxisBase 重复建设 GBrain 已经成熟的 brain runtime
  作为使用 Codex、OpenClaw、远端 OpenClaw 和 GBrain 的用户
  我需要 agent 默认通过 GBrain MCP 使用长期知识，而 PraxisBase 专注经验提炼、隐私、审核和发布

  背景:
    假如 当前目录是 PraxisBase workspace
    并且 GBrain 是长期 brain runtime
    并且 PraxisBase stable knowledge 只能通过 review/promote 修改
    并且 raw evidence、pending proposals、rejected candidates 和 human-required material 不能发布到 GBrain

  场景: Agent 默认使用 GBrain MCP 做广义知识查询
    假如 用户运行 "praxisbase personal init --agent codex --json"
    当 系统生成 PraxisBase agent skill
    那么 skill 告诉 Codex 使用 GBrain MCP 查询长期知识
    并且 skill 告诉 Codex 使用 PraxisBase CLI 做 capture、privacy、review、promote 和 publish

  场景: GBrain 不能替代 PraxisBase 的隐私发布门禁
    假如 本地 Codex evidence 包含个人路径或私人内容
    并且 GBrain source "praxisbase" 允许写入
    当 用户运行 personal daily
    那么 PraxisBase 先把 evidence 放入 privacy triage
    并且 不会因为 GBrain 允许写入就发布该内容

  场景: 安全个人 evidence 可以自动释放为 synthesis input
    假如 本地 OpenClaw evidence 是 personal scope
    并且 内容不包含 token、cookie、secret、客户信息或团队范围
    当 用户运行 "praxisbase privacy triage --mode personal --auto-release --json"
    那么 系统可以把该 evidence 释放给后续 synthesis
    并且 report 记录 auto_release 决策和原因

  场景: 显式可信的个人远端 OpenClaw 可以减少人工隐私确认
    假如 一个 SSH OpenClaw source 的 scope_default 是 "personal"
    并且 source 配置了 privacy_trust "trusted_personal_remote"
    并且 evidence 能匹配该 source
    并且 AI 判断为高置信 safe_personal_experience
    当 用户运行 "praxisbase privacy triage --mode personal --auto-release --json"
    那么 系统不会因为 remote_source_requires_review 单独阻断该 evidence
    并且 如果 evidence 含有 token、secret 或团队范围内容仍然保持 human_required

  场景: 低质量 run report 不会变成稳定 wiki
    假如 一个候选页面只总结单次 stability smoke run
    当 semantic review 判断它缺少长期 agent value
    那么 PraxisBase 拒绝直接晋升
    并且 HTML 显示 quality rejection reason

  场景: 有用但重复的内容进入 merge/update 审核
    假如 一个候选页面和已有 OpenClaw stability 页面重叠
    并且 semantic review 返回 merge 和唯一目标页面
    当 curation 完成
    那么 PraxisBase 创建 merge/update 候选
    并且 不直接新建重复 wiki 页面

  场景: 稳定知识发布到 GBrain
    假如 一个 PB wiki page 已经晋升到 "kb/"
    并且 GBrain 已配置 source "praxisbase"
    当 用户运行 "praxisbase gbrain export --mode personal --write --json"
    那么 GBrain 收到包含 praxisbase_path 和 source_hashes 的页面
    并且 页面不包含 raw transcript body

  场景: HTML 是治理页面不是 GBrain 浏览器
    假如 用户运行 "praxisbase wiki build-site --json"
    那么 首页显示 privacy queue、review queue、quality rejection 和 GBrain publish status
    并且 首页不尝试展示 GBrain 全量 brain search 结果
