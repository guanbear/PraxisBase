# language: zh-CN
功能: M28 团队版 OpenClaw 修复自我进化
  为了让团队多个 OpenClaw 修复 agent 共享并进化修复经验
  作为 PraxisBase 团队版主线
  我需要 repair-context 读真实知识、episode/propose 回流、风险分级 review/promote、引用追踪与成熟度治理、skill 自我进化，以及团队验收门

  背景:
    假如 当前工作目录是一个团队 PraxisBase 仓库（GitLab 权威层）
    并且 系统使用 protocol_version "0.1"
    并且 知识对象使用 scope、maturity、reference_count、last_referenced_at 字段

  场景: repair-context 按 signature 加载已晋升知识
    假如 "kb/known-fixes/openclaw-dispatch-routing-failures.md" 已晋升且 maturity 为 "verified"
    并且 该页面 frontmatter 声明了 signature（M28 需把该 signature 加入检测器）
    并且 日志文件匹配该 signature
    当 agent 运行 "praxisbase repair-context openclaw --logs dispatch.log --json"
    那么 JSON 响应字段 "known_fixes" 包含该页面路径
    并且 响应按 maturity 然后 reference_count 排序
    并且 超出字节预算时响应被标记 "truncated"

  场景: bundle 缺失时降级到缓存
    假如 最新 bundle 不可用
    当 请求 repair context
    那么 系统返回 last-known-good 缓存并附带 warning
    并且 修复流程不被阻断

  场景: 沙箱 agent 通过 outbox 幂等提交
    假如 一个无宽 Git 写权限的沙箱修复 agent
    当 它向 ".praxisbase/outbox/episodes" 提交 episode 并触发 sync
    那么 即使用相同 idempotency_key 重试，episode 也只被 ingest 一次

  场景: 低风险 known fix 自动合入
    假如 一个低风险 draft known_fix proposal，带 provenance 且 reviewer 置信度高于阈值
    当 用户运行 "praxisbase promote --auto"
    那么 该对象被晋升进 "kb/"

  场景: 高风险进人工异常队列
    假如 一个 proposal 要启用新的默认 skill
    当 用户运行 "praxisbase review --auto"
    那么 它被路由到 ".praxisbase/exceptions/human-required"
    并且 稳定知识保持不变

  场景: episode 引用提升被引对象的引用计数
    假如 一个 episode 的 "knowledge_references" 引用了某 known fix
    当 "praxisbase promote --auto" 或 "praxisbase build" 处理它
    那么 该 known fix 的 "reference_count" 自增且 "last_referenced_at" 被设置

  场景: 跨环境验证后 verified 晋升为 proven
    假如 一个 verified known fix 在两个不同 environment 中被成功引用
    当 成熟度生命周期运行
    那么 该 known fix 变为 "proven"

  场景: 长期未引用的 proven 衰减但可恢复
    假如 一个 proven 对象在配置的闲置窗口内未被引用
    当 衰减运行
    那么 它被降级并移出活跃索引，但内容不被删除
    并且 之后一次引用可恢复其成熟度

  场景: build 产出三级渐进索引
    当 用户运行 "praxisbase build"
    那么 系统产出 Layer A 全景目录、Layer B 分类清单、Layer C 完整对象

  场景: 团队 skill candidate 不自动晋升
    假如 一个团队 skill candidate 通过了 semantic review
    当 团队每日自动化完成
    那么 稳定 "skills/**" 保持不变
    并且 报告包含 Git/MR 的 next action

  场景: 已晋升团队 skill 进入 repair context
    假如 一个团队 skill 经人工 review 后被晋升
    当 匹配的 "repair-context openclaw" 运行
    那么 该已晋升 skill 路径被包含在响应中

  场景: 团队验收门
    当 用户运行 "praxisbase team release-audit --json"
    那么 JSON 响应包含 "team_repair_loop_ga"
    并且 JSON 响应包含 "skill_self_evolution_ga"
    并且 JSON 响应包含 "governance_ga"
    并且 JSON 响应包含 "privacy_boundary_ga"
    并且 仅当四门都 pass 时 "team_ga" 等于 "pass"

  场景: personal-only lesson 不进团队稳定知识
    假如 一个 personal-only lesson
    当 团队蒸馏运行
    那么 该 lesson 不进入团队稳定知识

  场景: 凭据被硬拦截
    假如 证据中包含原始凭据
    当 团队模式下运行 proposal 生成
    那么 该条目在生成 proposal 前被拦截并路由到 human-required
