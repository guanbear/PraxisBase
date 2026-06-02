# language: zh-CN
功能: M29 团队版 容器/K8s 排查经验积累
  为了让容器排查经验在团队内复用并随诊断进化
  作为 PraxisBase 团队版第二个 domain
  我需要 K8s seed pack、只读 incident bundle、sre-autopilot episode/proposal intake、治理复用与生产边界守护

  背景:
    假如 当前工作目录是一个 M28 全绿的团队 PraxisBase 仓库
    并且 系统使用 protocol_version "0.1"
    并且 K8s 知识对象 scope 为 "team" 且 domain 为 "k8s"
    并且 PraxisBase 不持有任何 Kubernetes 写权限

  场景: incident episode 使用共享 schema
    假如 一个 sre-autopilot DirectionResult，signature 为 "k8s:pod-oomkilled"
    当 adapter 产出 episode
    那么 该 episode 校验为 "IncidentEpisode" 且 scope 为 "team"
    并且 不引入平行对象类型

  场景: bundle fetch 返回 compact 安全只读包
    假如 "kb/known-fixes/k8s-pod-oomkilled.md" 已晋升
    当 用户运行 "praxisbase bundle fetch k8s-incident --signature k8s:pod-oomkilled --json"
    那么 bundle 包含匹配的 known_fixes、skills、forbidden_operations、verification_steps、source_refs
    并且 bundle 不含完整原始日志或凭据

  场景: checksum 不符被拒绝并降级
    假如 一个 bundle entry 的 checksum 与 manifest 不符
    当 fetch bundle
    那么 该 entry 被拒绝并附 warning
    并且 consumer 仍可用规则和实时证据继续诊断

  场景: incident proposal 进入 review
    假如 一个 sre-autopilot incident proposal 写入 ".praxisbase/outbox/proposals"
    当 sync 运行且 "praxisbase review --auto" 处理它
    那么 该 proposal 进入团队 review/promote 流程
    并且 稳定知识仅通过 promotion 改变

  场景: K8s known fix 复用同一成熟度治理
    假如 incident episodes 在两个不同 environment 中引用某 k8s known fix
    当 成熟度生命周期运行
    那么 该 k8s known fix 用与修复对象相同的规则提升成熟度

  场景: bundle 中修复建议仅为推荐
    假如 一个 k8s known fix 含修复指引
    当 它被纳入 bundle
    那么 修复指引被标记为 recommendation，并含 verification 与 escalation
    并且 不请求任何自动生产执行

  场景: 新默认 k8s skill 需人工批准
    假如 一个 proposal 要启用新的默认 k8s triage skill
    当 review 运行
    那么 它被路由到 human-required

  场景: 团队验收门包含 K8s 三门
    当 用户在 M29 后运行 "praxisbase team release-audit --json"
    那么 JSON 响应包含 "k8s_bundle_ga"
    并且 JSON 响应包含 "incident_episode_intake_ga"
    并且 JSON 响应包含 "k8s_boundary_ga"
    并且 "team_ga" 要求这些门与 M28 各门一起 pass
