# SRE-autopilot K8s Incident Integration Design

日期：2026-05-18

## 目标

定义 PraxisBase 与 sre-autopilot / K8s live incident 诊断系统的集成边界，避免把 PraxisBase 误实现成 live incident 的同步数据库、在线强依赖或生产执行引擎。

核心结论：

- PraxisBase 是 durable knowledge substrate，不是告警平台、RCA orchestrator 或生产执行器。
- sre-autopilot 是 peer client：读取静态 K8s repair bundle，输出 episode/proposal。
- PraxisBase 和 sre-autopilot 由不同实现方/不同 AI 独立推进；双方只通过 bundle、episode、proposal、source refs 和 OpenSpec 契约对齐。
- live incident 主流程必须在 PraxisBase 不可用时继续运行。
- 所有稳定知识更新仍然经过 proposal、review、promotion。

## 实现所有权

| Owner | 可以改 | 不应该改 |
| --- | --- | --- |
| PraxisBase 实现方 | `.praxisbase/` protocol、schemas、CLI、bundle build/fetch、episode/proposal intake、review/promote、K8s bundle profile | sre-autopilot 的 Go analyzer、MCP/HTTP handler、LLM agent loop、生产探针 |
| sre-autopilot 实现方 | Go 侧 CP analyzer、InvestigationScope、AI tool guardrails、DirectionResult、episode/proposal exporter、bundle consumer | PraxisBase 的 Git authority、review/promote 流程、bundle schema source of truth |

协作方式是 contract-first：先稳定 OpenSpec/BDD/JSON fixture，再各自实现。任一方需要新增字段时，先改契约和 fixture，再改本方代码。

## 集成模式

```text
PraxisBase Git authority
  kb/known-fixes, skills/, policies/
        |
        v
praxisbase build
        |
        v
dist/repair-bundles/k8s-incident/*
        |
        v
sre-autopilot CP Direction Agent
  rules + live evidence + optional repair bundle
        |
        v
DirectionResult + Praxis episode/proposal outbox
```

## Bundle Contract

K8s incident bundle 是只读上下文包，不是 source of truth。

最小 manifest：

```json
{
  "protocol_version": "0.1",
  "bundle_id": "k8s-incident",
  "generated_at": "2026-05-18T10:00:00Z",
  "commit_sha": "abc123",
  "compatible_cli": ">=0.1.0",
  "entries": [
    {
      "signature": "k8s:pod-oomkilled",
      "path": "k8s-incident/k8s-pod-oomkilled.json",
      "checksum": "sha256:example",
      "risk": "medium"
    }
  ]
}
```

最小 bundle entry：

```json
{
  "protocol_version": "0.1",
  "signature": "k8s:pod-oomkilled",
  "domain": "k8s",
  "status": "published",
  "risk": "medium",
  "known_fixes": [
    {
      "id": "k8s-pod-oomkilled",
      "summary": "Pod was killed because memory usage exceeded container limit.",
      "diagnosis_steps": [
        "Check last terminated reason and exit code.",
        "Compare memory usage with requests and limits.",
        "Inspect recent deploy or traffic changes."
      ],
      "verification_steps": [
        "Confirm restart count stops increasing.",
        "Confirm memory headroom after mitigation."
      ],
      "forbidden_operations": [
        "Do not delete production pods automatically.",
        "Do not change resource limits without owner approval."
      ],
      "source_refs": [
        "kb/known-fixes/k8s-pod-oomkilled.md"
      ]
    }
  ],
  "skills": [
    "skills/k8s/incident-triage/SKILL.md"
  ]
}
```

约束：

- bundle entry 必须按 signature 过滤，不允许把整个知识库塞进 prompt。
- bundle 必须包含风险、禁用操作、验证步骤、source refs。
- bundle 不包含完整原始日志和生产凭据。
- bundle 校验失败时，consumer 必须使用 last-known-good cache 或降级为空 bundle。

## Episode Contract

SRE-autopilot 输出 incident episode，用于复盘和后续知识晋升。

必填字段：

| 字段 | 说明 |
| --- | --- |
| `protocol_version` | 当前为 `"0.1"` |
| `type` | `incident_episode` |
| `agent_id` / `agent_type` | 例如 `sre-autopilot-cp` / `live_incident_analyzer` |
| `run_id` | trace id、job id 或 alert correlation id |
| `environment_id` | `prod`、`staging` 或集群环境 |
| `problem_signature` | 例如 `k8s:pod-oomkilled` |
| `result` | `confirmed` / `ruled_out` / `inconclusive` / `data_gap` |
| `source_refs` | Prometheus、K8s event、log platform、ticket 的引用 |
| `evidence_summary` | 脱敏证据摘要 |
| `used_objects` | 使用过的 known fix/procedure/bundle entry |
| `used_skills` | 使用过的 skill |
| `created_at` | ISO8601 |

禁止：

- 把完整日志、完整 describe 大文本或敏感字段直接写入 Git。
- 让 live incident 自动修改 `kb/` 或 `skills/`。
- 用缺少 provenance 的 episode 推动自动晋升。

## Proposal Contract

只有当 incident 产生可复用知识时才提交 proposal。常见 proposal：

- 新增 K8s known fix。
- 修补已有 runbook 的诊断步骤。
- 增加 forbidden operation 或 escalation condition。
- 从多次成功 episode 总结 skill draft。

Proposal 必须包含：

- evidence source refs 和 hash。
- 触发的 episode id。
- risk level。
- verification observation。
- rollback 或撤销方式。

## Failure Handling

| 失败 | 预期行为 |
| --- | --- |
| bundle fetch 失败 | 使用 last-known-good cache；没有 cache 时返回空 bundle |
| manifest checksum mismatch | 拒绝该 bundle entry，记录 warning |
| episode submit 失败 | 写 `.praxisbase/outbox/episodes` 或 submission retry queue |
| proposal submit 失败 | 写 `.praxisbase/outbox/proposals` |
| review/promote 失败 | 不影响 live incident；proposal 留在队列 |

## MVP vs Phase 2

Phase 1 OpenClaw MVP 只需要保证这些能力可以被后续实现：

- protocol schema 可表达 `incident_episode`。
- bundle manifest 支持多 bundle id 和 per-signature entry。
- outbox 支持 episode/proposal 重试。
- evidence contract 支持 source refs、hash 和脱敏摘要。

Phase 2 才实现：

- `praxisbase bundle fetch k8s-incident --signature ...`
- K8s known fix seed pack。
- K8s incident bundle generator。
- SRE-autopilot episode adapter 示例。
- Feishu bot summary/proposal flow。

## Guardrails

- PraxisBase 不为 sre-autopilot 提供生产 Kubernetes 写权限。
- Repair bundle 只能建议动作，不能要求 consumer 自动执行生产变更。
- 高风险 proposal 默认需要人工异常处理。
- 新默认 skill 的启用必须人工确认或显式 policy 允许。
