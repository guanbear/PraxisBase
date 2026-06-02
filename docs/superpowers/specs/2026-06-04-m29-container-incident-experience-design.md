# M29 团队版 · 容器/K8s 排查经验积累 设计

日期：2026-06-04
上游 anchor：`docs/superpowers/specs/2026-06-02-convergence-and-team-roadmap-design.md`
前置门：M28 团队修复自我进化全绿。
契约前序：`docs/superpowers/specs/2026-05-18-sre-autopilot-k8s-incident-integration-design.md`（集成边界已定义）。

## 1. 目标

把**容器 / K8s 问题排查经验**作为同一套协议的**第二个 domain** 接入团队知识底座，复用 M28 已落地的对象模型、review/promote 流程和治理底座，对接独立的 `sre-autopilot`（K8s live incident 诊断系统）作为 peer client。

产品承诺：
> 容器排查 agent（sre-autopilot）诊断前能取到只读 incident bundle（历史排查经验 + 禁用操作 + 验证步骤），诊断后回流 incident episode / proposal；经 team review/promote 后，下一次排查带着更成熟的经验启动。

这是 anchor 的 A 线。它**复用而非新建**：与 OpenClaw 修复（B 线）共用 `IncidentEpisode` / `Proposal` / bundle / known_fix / skill，只是 domain = `k8s`、signature 命名空间 = `k8s:*`、运行时边界不同（生产**默认只读**）。

## 2. 非目标（边界，照搬集成契约）

- 不实现 sre-autopilot 的 Go analyzer、探针、MCP/HTTP handler、LLM agent loop（那是对方实现方的所有权）。
- 不接管 live incident 调度，不替代告警平台。
- 不给 sre-autopilot 任何 Kubernetes 写权限。
- bundle 只能建议动作，不能要求 consumer 自动执行生产变更。
- 不把完整日志 / describe 大文本 / 敏感字段写进 Git。
- live incident 主流程不依赖 PraxisBase 在线可用。

## 3. 角色（contract-first）

| 系统 | 角色 | 边界 |
| --- | --- | --- |
| sre-autopilot | live incident peer client / evidence producer / bundle consumer | 生产诊断主流程不依赖 PB 在线 |
| PraxisBase | durable knowledge substrate / static bundle publisher / episode receiver | 不调度 incident，不执行生产变更 |
| Feishu/SRE bot | presentation peer | 可读 bundle/episode summary，不绕过 review/promote |

双方只通过 bundle、episode、proposal、source refs、OpenSpec/BDD fixture 对齐。任一方加字段先改契约+fixture。

## 4. 设计

### 4.1 K8s seed pack

`init` / 专用 seed 提供 5–10 个常见 signature 的初始知识，让首次 `bundle fetch` 有用：
- `k8s:pod-oomkilled`、`k8s:pod-crashloop-imagepull`、`k8s:ingress-5xx-upstream-timeout`、`k8s:pvc-pending`、`k8s:node-notready`、`k8s:dns-resolution-failure` 等。
- 每个含：diagnosis_steps、verification_steps、**forbidden_operations（生产只读）**、source_refs、risk。
- baseline `skills/k8s/incident-triage/SKILL.md`。

### 4.2 只读 incident bundle

`praxisbase bundle fetch k8s-incident --signature k8s:pod-oomkilled --json`：
- 按 signature 过滤，compact：只含匹配的 known_fixes / procedures / skills / forbidden_operations / verification_steps / rollback/escalation / source_refs。
- manifest 含 protocol_version / bundle_id / generated_at / commit_sha / compatible_cli / per-entry checksum + risk（照搬集成契约的 manifest/entry 结构）。
- 校验失败 → last-known-good cache；无 cache → 空 bundle + warning。consumer 必须能在 bundle 缺失时用规则+实时证据继续诊断。
- 发布产物：`dist/repair-bundles/k8s-incident/manifest.json` 与 `<signature>.json`。

### 4.3 incident episode / proposal intake

复用 `adapter/sre-autopilot.ts` 的 `adaptDirectionResult`（已存在，产出 `IncidentEpisode` + 可选 `Proposal`）：
- episode：type `incident_episode`，result ∈ confirmed/ruled_out/inconclusive/data_gap，含 source_refs（Prometheus/K8s event/log/ticket）、evidence_summary（脱敏）、used_objects/used_skills。
- proposal：新增 K8s known_fix / patch runbook / 加 forbidden_operation / escalation / 从多次成功 episode 总结 skill draft。
- 进 `.praxisbase/outbox/{episodes,proposals}`（live 进程通常不能直接 push），sync → inbox → team review/promote（复用 M28 风险分级）。

### 4.4 风险与权限（K8s live profile）

| 内容 | 默认 |
| --- | --- |
| 读 bundle | allow |
| 提交 episode | allow（需 provenance/source refs） |
| 提交 proposal | allow（默认 draft/review） |
| 自动晋升 known_fix/procedure | 仅中低风险且 reviewer 通过 |
| 启用新默认 skill | 人工必需 |
| 生产写操作建议 | allowed as recommendation only |
| 生产写操作执行 | out of scope |

### 4.5 治理复用

M28 的引用追踪、成熟度晋升/衰减、查询预算、三级索引**自动适用于 k8s domain**，无需重写——这正是"复用而非新建"的价值。K8s 对象带 `scope: team` + domain 标识即可纳入同一治理。

## 5. 数据流

```text
PB Git authority (kb/known-fixes/k8s-*, skills/k8s/*, policies)
  -> praxisbase build (k8s-incident profile)
  -> dist/repair-bundles/k8s-incident/*
  -> sre-autopilot CP Direction Agent (rules + live evidence + optional bundle)
  -> DirectionResult + episode/proposal outbox
  -> sync -> team review/promote -> kb/skills 更新 -> 下次 bundle 更成熟
```

## 6. 失败处理（照搬集成契约）

| 失败 | 行为 |
| --- | --- |
| bundle fetch 失败 | last-known-good cache；无 cache 返回空 bundle |
| manifest checksum 不符 | 拒绝该 entry，记 warning |
| episode submit 失败 | 写 outbox / retry queue |
| proposal submit 失败 | 写 outbox |
| review/promote 失败 | 不影响 live incident；proposal 留队列 |

## 7. 验收门（team release-audit 增加 domain 维度）

```text
k8s_bundle_ga            # bundle fetch 按 signature 返回安全只读包；校验失败降级
incident_episode_intake_ga # sre-autopilot episode/proposal 进 review/promote
k8s_boundary_ga          # 生产只读、无写权限、forbidden_operations 齐全
```

真实验收命令：
```bash
praxisbase bundle fetch k8s-incident --signature k8s:pod-oomkilled --json
praxisbase episode submit incident-episode.json --json
praxisbase propose k8s-proposal.json --json
praxisbase review --auto --json
praxisbase promote --auto --json
praxisbase build --json
praxisbase team release-audit --json
```
记录在 `docs/status/m29-container-incident-experience-<date>.md`。

## 8. 实现复用

`adapter/sre-autopilot.ts`（intake，已有）· `bundles/fetch.ts`（k8s-incident profile）· `build/build.ts`（k8s bundle generator）· `repair/signature.ts`（k8s signature detector，新增）· `templates/seed.ts`（k8s seed pack）· M28 的 review/promote/治理/team-release-audit 全部复用。
