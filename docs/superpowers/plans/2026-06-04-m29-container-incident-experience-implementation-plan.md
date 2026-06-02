# M29 团队版 · 容器/K8s 排查经验 实施计划

日期：2026-06-04
设计：`docs/superpowers/specs/2026-06-04-m29-container-incident-experience-design.md`
集成契约：`docs/superpowers/specs/2026-05-18-sre-autopilot-k8s-incident-integration-design.md`
契约目录：`docs/openspec/changes/m29-container-incident-experience/`
BDD：`docs/bdd/m29-container-incident-experience.feature`

前置：M28 全绿。先冻结契约+fixture 再实现（anchor R5）。复用 M28 的治理/review/promote/team-release-audit。

## 阶段 0：契约冻结

- [ ] 与集成契约对齐 manifest/entry/episode/proposal JSON 形状，落 `tests/fixtures/k8s-incident/`。
- [ ] 确认不触碰 sre-autopilot 内部实现（边界）。

## 阶段 1：K8s signature + seed pack

模块：`repair/signature.ts`, `templates/seed.ts`
- [ ] 新增 k8s signature detector（从 event/describe/告警文本识别 `k8s:*`）。
- [ ] seed pack：5–10 个 known_fix（含 forbidden_operations 生产只读）+ `skills/k8s/incident-triage/SKILL.md`。
- [ ] 测试：signature 识别；seed 安全字段齐全。

## 阶段 2：只读 incident bundle

模块：`bundles/fetch.ts`, `build/build.ts`
- [ ] build 增加 `k8s-incident` profile，产出 `dist/repair-bundles/k8s-incident/manifest.json` + `<signature>.json`。
- [ ] `bundle fetch k8s-incident --signature ...`：按 signature 过滤 compact 包。
- [ ] manifest checksum + 校验失败降级 cache/空包。
- [ ] 测试：按 signature 过滤；checksum 不符拒绝；缺失降级。

## 阶段 3：episode/proposal intake

模块：`adapter/sre-autopilot.ts`（已有），`store/file-store.ts`
- [ ] 打通 `adaptDirectionResult` 输出 → outbox → sync → inbox。
- [ ] incident episode result 支持 confirmed/ruled_out/inconclusive/data_gap。
- [ ] 测试：adapter 产出合法 IncidentEpisode/Proposal；outbox 幂等。

## 阶段 4：team review/promote + 治理复用

模块：M28 的 `review/*`、`promote/*`、治理引擎、`experience/team-release-audit.ts`
- [ ] k8s domain 对象纳入 M28 风险分级、引用追踪、成熟度晋升/衰减、查询预算、三级索引。
- [ ] team-release-audit 增加 `k8s_bundle_ga`、`incident_episode_intake_ga`、`k8s_boundary_ga`。
- [ ] 边界守护：无 K8s 写权限；bundle 只建议；新默认 skill 人工必需。
- [ ] 测试：k8s 对象走同一治理；边界守护；门分类。

## 阶段 5：真实验收 + status

- [ ] 用 fixture 跑完整链路（bundle fetch→episode→propose→review→promote→build→audit）。
- [ ] team release-audit 中 k8s 三门 + team_ga 全绿。
- [ ] 写 `docs/status/m29-container-incident-experience-<date>.md`。
- [ ] `pnpm check` 通过。

## 测试矩阵

| 领域 | 单测 | 集成/BDD |
| --- | --- | --- |
| k8s signature/seed | ✓ | ✓ |
| 只读 bundle + 降级 | ✓ | ✓ |
| episode/proposal intake | ✓ | ✓ |
| 治理复用 + 边界 | ✓ | ✓ |
| k8s 验收门 | ✓ | ✓ |

## 风险

- 误把 sre-autopilot 内部逻辑塞进 PB → 严守边界，PB 只做 bundle+intake。
- bundle 泄漏敏感字段 → 进 Git 前脱敏 + 不含原始日志/凭据，单测守护。
- 生产被误执行 → forbidden_operations 必填 + 无写权限 + recommendation only。
