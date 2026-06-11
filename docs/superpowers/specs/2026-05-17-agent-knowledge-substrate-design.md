# PraxisBase 知行基座 Agent Knowledge Substrate 设计

日期：2026-05-17

## 目标

PraxisBase 不应该只是一个自更新 wiki，而应该成为一个 **agent-native shared knowledge substrate**：面向多 agent、临时 agent、持久 agent、机器人和自动化系统的共享知识与技能底座。

第一生产场景是 **OpenClaw 沙箱自动修复**：大量临时或持久 agent 需要在修复前获取最新修复知识和 skill，在沙箱内完成修复，并把新的经验回流到共享知识层。未来同一套协议还要支持 K8s 故障定位系统、飞书机器人、Hermes-like 持久 agent，以及其他临时 agent。

核心产品承诺：

> 任意 agent 进入一个工作区后，都能获取合适的知识和技能，完成任务，并留下结构化经验；这些经验会被审核、晋升、重新分发给下一个 agent。

## 设计原则

- **Agent 是平级节点。** 临时修复 agent、持久 OpenClaw 机器人、飞书机器人、Hermes runner、K8s 分析系统都使用同一套读写协议。
- **Agent 和沙箱是 cattle，不是 pets。** 临时 agent、持久 agent harness、OpenClaw 沙箱都应该可替换、可重启、可丢弃；不能把组织记忆绑在某个不可丢的容器或会话里。
- **持久的是经验，不是执行体。** Episode、proposal、review、known fix、procedure、skill 和 repair bundle 才是要长期保存和演进的资产。
- **Skill 是可进化资产。** 系统不只保存知识，还要能像 Hermes 一样从重复成功的 episode 中总结出可复用 `SKILL.md`，让后续 agent 直接加载。
- **人工只处理异常。** 常规审核和知识晋升由 AI reviewer agent 完成；人只看高风险、不确定或验证失败的项。
- **Git 是权威层，不是完整运行时。** Git 存稳定知识、审计历史、review 记录和发布产物；原始日志和高容量数据可以继续留在外部系统。
- **MVP 使用静态索引和 bundle。** 外部搜索服务、向量库、队列、daemon 都是后续扩展，不是第一版前置条件。
- **大日志不进 Git。** Git 里只保存摘要、source URI、hash、provenance；完整日志继续放现有日志平台或对象存储。
- **OpenClaw 修复是第一证明场景。** K8s 故障定位复用同一对象模型和接口。

## 与 Anthropic Managed Agents 思想的关系

Anthropic 在 Managed Agents 架构中强调把 agent 拆成可替换的接口：session 是持久事件日志，harness/brain 负责调用模型和组织上下文，sandbox/hands 负责执行动作。这样 harness 和 sandbox 都可以像 cattle 一样失败、重启或替换，而不会丢失 session。

PraxisBase 采用同一个分离思想，但切入点更偏组织级学习：

| Anthropic Managed Agents | PraxisBase |
| --- | --- |
| session log 持久化一次 agent run | episode/proposal/review 持久化很多 agent runs |
| harness/brain 可以重启 | 临时和持久 agent 都是可替换 peer clients |
| sandbox/hands 是 cattle | OpenClaw 沙箱和 repair agent 都是 cattle |
| brain 通过接口调用 hands | agent 通过 file/CLI/future MCP 调用知识底座 |
| 解决长任务 agent 的可靠性 | 解决多 agent 的共享学习和经验晋升 |

因此，PraxisBase 可以理解为 **cattle-not-pets agent 架构中的持久经验层**：执行体可以消失，但修复经验、技能和决策会留下来，经过 AI review 后进入下一批 agent 的上下文。

## 总体架构

PraxisBase 采用 **federated Git-backed architecture**：

```text
Sources and Events
  OpenClaw 沙箱日志、修复触发、飞书消息、工单、
  K8s events、文档、postmortem
        |
        v
Agent Peers
  临时修复 agent、持久 OpenClaw bot、飞书 bot、
  Hermes curator、K8s 故障系统
        |
        v
PraxisBase Protocol
  file protocol + CLI + future MCP wrapper
        |
        v
Git-backed Authority Layer
  notes、procedures、known fixes、skills、policies、reviews
        |
        v
Generated Retrieval Layer
  kb-index.json、search-index.json、repair bundles、HTML、llms.txt
```

这不是区块链设计。Git 已经提供这里真正需要的能力：版本历史、可选 signed commit、review trail、diff、rollback。因为这些 agent 主要运行在同一个组织或可信个人环境里，区块链会引入复杂度，却不能解决核心信任问题。

这也不是“中央大脑指挥小 agent”。Git repository 是权威知识与审计层，但所有 agent 仍然是 peer client。持久 OpenClaw bot 可能跑得更频繁，但它不拥有知识图谱，也不是临时 agent 的上级。

## 知识载体

不同生命周期的数据使用不同载体：

| 层 | 载体 | 内容 |
| --- | --- | --- |
| 权威层 | 团队用 GitLab，个人用 GitHub | 稳定 notes、procedures、known fixes、skills、decisions、policies、reviewed memories、AI reviews |
| 原始经验层 | 现有日志平台、对象存储、工单系统 | 完整 OpenClaw 日志、K8s 日志、大 trace、飞书消息导出 |
| 协议状态层 | `.praxisbase/` 下的文件 | inbox episodes、proposals、reviews、policies、schedules、生成索引 |
| 检索产物层 | 生成的 JSON 和 HTML | repair bundles、search indexes、HTML site、`llms.txt` |
| 边缘缓存层 | 本地 checkout 或下载的 bundle | 给临时修复 agent 的 compact context |

团队部署默认使用 GitLab self-managed，因为它适合 Scheduled Pipelines、Pages、Merge Requests 和内网访问控制。个人部署默认使用 GitHub Actions 和 GitHub Pages。

## 目录协议

仓库暴露一个稳定的 file protocol：

```text
.praxisbase/
  config.yaml
  schedules.yaml
  policies/
    autonomy.yaml
    risk-rules.yaml
  inbox/
    episodes/
    proposals/
    reviews/
  outbox/
    episodes/
    proposals/
  exceptions/
    human-required/
    conflicts/
    failed-checks/
  runs/
    review/
    promote/
    build/
  indexes/
    kb-index.json
    search-index.json
  bundles/
    openclaw-sandbox.json
    k8s-incident.json

kb/
  notes/
  procedures/
  known-fixes/
  decisions/
  memory/
  sources/

skills/
  openclaw/
    auth-repair/SKILL.md
    workspace-repair/SKILL.md
  k8s/
    incident-triage/SKILL.md

dist/
  index.html
  llms.txt
  kb-index.json
  repair-bundles/
```

`.praxisbase/` 是 agent 协议层。临时 agent 应该只理解这一层就能工作，不需要读完整 wiki。

`kb/` 是稳定知识层，存放审核后的 Markdown/YAML 对象。

`skills/` 是可执行知识层，保持 `SKILL.md` 风格兼容，方便 OpenClaw、Hermes、Codex 和其他 agent 消费。

`dist/` 是发布与观察层，给人和 agent 查看。

## 对象模型

### Episode

Episode 记录一次 agent 运行。OpenClaw repair 场景下，每次修复尝试都应该创建一个 episode。

```json
{
  "id": "episode_20260517_abc",
  "protocol_version": "0.1",
  "type": "repair_episode",
  "scope": "team",
  "agent_id": "openclaw-temp-xyz",
  "agent_type": "temporary_repair_agent",
  "environment_id": "sandbox-123",
  "run_id": "run-456",
  "problem_signature": "openclaw:claude-auth-expired",
  "result": "success",
  "knowledge_references": [
    {
      "id": "openclaw-auth-expired",
      "path": "kb/known-fixes/openclaw-auth-expired.md",
      "used_in_phase": "diagnosis",
      "effect": "helped_fix",
      "outcome": "success"
    },
    {
      "id": "openclaw-auth-repair",
      "path": "skills/openclaw/auth-repair/SKILL.md",
      "used_in_phase": "repair",
      "effect": "guided_action",
      "outcome": "success"
    }
  ],
  "source_refs": ["log://openclaw/sandbox-123/run-456"],
  "summary": "Refreshed Claude auth state and restarted the agent session.",
  "created_at": "2026-05-17T10:00:00Z"
}
```

Episode 是学习系统的 append-only 输入。它可以被总结或 supersede，但原始 episode 记录应该保留审计能力。

### 共享知识治理字段

稳定知识对象需要携带一组轻量治理字段。Phase 1 只要求 schema 和生成产物保留这些字段，不实现完整自动治理。

```yaml
knowledge_type: known_fix | procedure | skill | decision | policy | pitfall | guideline | model | note
maturity: draft | verified | proven
scope: personal | project | team | global
reference_count: 0
last_referenced_at: null
supersedes: []
superseded_by: null
```

语义：

- `scope` 表示知识适用范围，不等同于权限系统。Phase 1 默认写 team，但保留 personal/project/global。
- `maturity` 表示知识经过多少实践验证。`draft` 是单一来源或新提取，`verified` 至少被一次修复或一个环境验证，`proven` 需要跨多次或多环境验证。
- `knowledge_references` 是 episode 到知识对象的引用追踪，用于后续成熟度晋升、自动衰减和 lint。
- `reference_count` 和 `last_referenced_at` 是自动衰减的输入字段；Phase 1 记录和保留，Phase 2 才自动更新。
- `supersedes` 和 `superseded_by` 用于去重、合并 alias 和处理过时修复方案。

### Problem Signature

Problem signature 是标准化故障标签，用于检索和聚类：

```text
openclaw:claude-auth-expired
openclaw:workspace-lock-stuck
openclaw:node-runtime-missing
k8s:pod-crashloop-imagepull
k8s:ingress-5xx-upstream-timeout
```

第一次识别不需要完美。后续 curator 可以通过 proposal 合并、重命名或增加 alias。

### Known Fix

Known fix 是短小、稳定的修复单元：

```markdown
---
id: openclaw-auth-expired
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: published
maturity: draft
signatures:
  - openclaw:claude-auth-expired
skills:
  - skills/openclaw/auth-repair/SKILL.md
sources:
  - uri: log://openclaw/sandbox-123/run-456
    hash: sha256:example
confidence: 0.84
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T10:00:00Z
---

## Symptoms

Claude Code reports that authentication expired or the OpenClaw session cannot call the model.

## Diagnosis

Check the local auth state, recent OpenClaw logs, and whether the sandbox can reach the configured model gateway.

## Fix

Refresh auth state, restart the agent session, and retry a minimal model call.

## Verification

Run a minimal agent command and confirm it can complete without auth errors.

## Rollback

Restore the previous auth state snapshot if the refresh makes the session worse.
```

### Procedure

Procedure 是更长的诊断或修复流程，可以引用 known fixes 和 skills。

### Pitfall

Pitfall 是 agent-facing 的“不要这样做”知识，记录已知坑、失败路径、反模式和禁止操作。OpenClaw 自动修复尤其需要 pitfall，因为临时 agent 不只要知道如何修，还要避免重复执行危险或无效动作。

Pitfall 可以作为独立对象存入 `kb/pitfalls/`，也可以被 repair bundle 合并进 `forbidden_operations`、`escalation_conditions` 和 skill 的安全段落。

### Skill

Skill 是 agent-facing instruction document。它应该说明什么时候使用、需要什么上下文、可执行命令、验证方式和回滚方式。

Skill 不应该只靠人工手写。系统应支持从多次 episode 和 known fix 中自动提出 skill proposal：把重复的诊断步骤、修复命令、验证方式、回滚方式和禁用操作总结成 `SKILL.md`。这些 skill proposal 走同一套 review/promote 流程；只有通过 AI reviewer 和 risk policy 后，才进入 `skills/` 并出现在后续 repair bundle 中。

### Proposal

Proposal 是 agent 对稳定知识的更新建议。它可以 create、patch、archive 或 link 对象。

### Review

Review 记录独立 reviewer agent 的决策、置信度、风险分级和合入结果。

### Repair Bundle

Repair bundle 是给临时 agent 的生成型上下文包，不是 source of truth。它包含某个场景或 problem signature 相关的 procedures、skills、known fixes、forbidden operations、diagnostic commands、verification steps 和 source refs。

## OpenClaw 修复流程

1. 沙箱修复由 health check、monitor、飞书命令、人工按钮或 webhook 触发。
2. 一个 repair agent 在沙箱中启动。它可以是临时 agent，也可以是持久 agent。
3. agent 收集本地信号：日志片段、OpenClaw 状态、Claude Code 状态、最近命令、环境版本和错误栈。
4. agent 调用：

   ```bash
   praxisbase repair-context openclaw --logs /path/to/logs --json
   ```

5. PraxisBase 返回 compact repair bundle：可能的 problem signature、相关 known fixes、skills、procedures、diagnostic commands、verification steps 和 forbidden operations。
6. agent 在沙箱内修复并验证结果。
7. agent 提交 episode：

   ```bash
   praxisbase episode submit episode.json
   ```

8. 如果这次运行产生了可复用经验，agent 提交 proposal：

   ```bash
   praxisbase propose proposal.json
   ```

9. Reviewer agents 处理 proposals。常规更新自动合入；高风险或不确定项进入 human exception queue。
10. Build 重新生成 indexes、repair bundles、HTML 和 `llms.txt`。

关键性质：每次修复都是学习机会，但稳定共享知识只能通过 proposal 和 review 流程改变。

## K8s 故障流程

K8s 故障系统复用同一协议：

1. Scheduled ingest 定期拉取工单、飞书消息、文档、postmortem、告警和 K8s event 摘要。
2. 故障系统无论使用 Agent SDK 还是流程化 AI，都先通过 PraxisBase 获取 context。
3. 系统输出 root-cause hypothesis、evidence summary、suggested runbook，以及给飞书 bot 的回复文本。
4. 该次分析提交 episode。
5. 新 pattern 或 runbook 改进提交 proposal。
6. AI review 和 promotion 更新共享 K8s 知识与 bundles。

这个设计不强迫你在 Agent SDK 和流程化 AI 调用之间二选一。两者都是 PraxisBase 的 peer client。

## SRE-autopilot / K8s Live Incident 集成契约

OpenClaw repair 是沙箱内修复场景，agent 可以在 sandbox 权限内执行变更；SRE-autopilot 这类 K8s live incident 系统是生产诊断场景，默认必须只读。两者共用 episode、proposal、known fix、skill 和 repair bundle 对象模型，但运行时集成边界不同。

### 角色定位

| 系统 | PraxisBase 视角 | 边界 |
| --- | --- | --- |
| `sre-autopilot` | live incident peer client / evidence producer / bundle consumer | 生产诊断主流程不能依赖 PraxisBase 在线可用 |
| PraxisBase | durable knowledge substrate / static bundle publisher / episode receiver | 不接管 live incident 调度，不替代告警平台，不执行生产变更 |
| SRE bot / Feishu bot | presentation peer client | 可以读取 bundle 或 episode summary，但不绕过 review/promotion |

### 只读 bundle 输入

SRE-autopilot 在诊断开始前可以读取静态 K8s incident bundle：

```bash
praxisbase bundle fetch k8s-incident --signature k8s:pod-oomkilled --json
```

也可以直接读取发布产物：

```text
dist/repair-bundles/k8s-incident/manifest.json
dist/repair-bundles/k8s-incident/<signature>.json
```

约束：

- bundle 是可选增强，不是 live diagnosis 的必需依赖。
- bundle 缺失、过期或校验失败时，调用方必须继续使用规则和实时证据诊断。
- bundle 必须 compact：只包含匹配 problem signature、domain、risk policy 的 known fixes、procedures、skills、forbidden operations、verification steps、rollback/escalation guidance 和 source refs。
- bundle 不包含完整原始日志、未脱敏数据或可执行生产写操作。

### Episode / proposal 输出

SRE-autopilot 每次诊断结束后可以生成 PraxisBase-compatible episode：

```json
{
  "id": "episode_20260518_cp_abc",
  "protocol_version": "0.1",
  "type": "incident_episode",
  "scope": "team",
  "agent_id": "sre-autopilot-cp",
  "agent_type": "live_incident_analyzer",
  "environment_id": "prod",
  "run_id": "trace-123",
  "problem_signature": "k8s:pod-oomkilled",
  "result": "confirmed",
  "used_skills": ["skills/k8s/incident-triage/SKILL.md"],
  "used_objects": ["kb/known-fixes/k8s-pod-oomkilled.md"],
  "source_refs": [
    "prometheus://cluster-a/prod/order-api?query=kube_pod_container_status_last_terminated_reason",
    "k8s-event://cluster-a/prod/order-api-123/OOMKilling"
  ],
  "evidence_summary": "Pod order-api-123 was OOMKilled within the alert window; restart count increased from 1 to 5.",
  "created_at": "2026-05-18T10:00:00Z"
}
```

如果诊断发现新的稳定模式、runbook 改进或 skill 改进，应提交 proposal，而不是直接写 `kb/` 或 `skills/`：

```bash
praxisbase episode submit episode.json
praxisbase propose proposal.json
```

当 live incident 进程不能直接访问 authority repo 时，必须写 outbox 或通过受控 submission gateway：

```text
.praxisbase/outbox/episodes/*.json
.praxisbase/outbox/proposals/*.json
```

### 风险与权限

K8s live incident profile 默认风险策略：

| 内容 | 默认 |
| --- | --- |
| 读取 bundle | allow |
| 提交 episode | allow，需 provenance/source refs |
| 提交 proposal | allow，默认 draft/review |
| 自动晋升 known fix/procedure | 仅中低风险且 reviewer 通过 |
| 自动启用新默认 skill | manual required |
| 生产写操作建议 | allowed as recommendation only |
| 生产写操作执行 | out of scope |

Repair bundle 可包含 remediation guidance，但必须标记为建议、验证和升级条件。PraxisBase 不授予 sre-autopilot 新的 Kubernetes 权限。

### 与 OpenClaw MVP 的关系

K8s live incident 集成不进入 Phase 1 OpenClaw repair MVP 的执行范围。Phase 1 只需要确保 protocol、schemas、bundle manifest、outbox、evidence contract 足够支持该集成。具体 K8s signature detector、bundle generator、episode adapter 和 Feishu bot 流程放在 Phase 2。

## 接口

### File Protocol

任意 agent 都可以从仓库读取稳定知识和生成 bundle。临时修复 agent 默认只能写 inbox/outbox 对象：

```text
.praxisbase/inbox/episodes/*.json
.praxisbase/inbox/proposals/*.json
.praxisbase/outbox/episodes/*.json
.praxisbase/outbox/proposals/*.json
```

`kb/` 和 `skills/` 下的稳定对象只由 reviewer、promoter 或 curator 写入。

### CLI

CLI 是第一实现入口：

Phase 1 必做命令：

```bash
praxisbase init
praxisbase repair-context openclaw --logs /path/to/logs --json
praxisbase bundle fetch openclaw --signature openclaw:claude-auth-expired
praxisbase episode submit episode.json
praxisbase propose proposal.json
praxisbase review --auto
praxisbase promote --auto
praxisbase build
praxisbase check
```

Phase 2+ 命令：

```bash
praxisbase search "claude auth expired" --scope openclaw --json
praxisbase read known_fix openclaw-auth-expired
praxisbase run ingest --profile openclaw
praxisbase curate --profile openclaw
```

### MCP

MCP 是未来的 thin wrapper，复用同一 core，不重新实现逻辑：

- `search_knowledge`
- `read_object`
- `get_repair_context`
- `submit_episode`
- `propose_update`
- `review_proposals`
- `list_skills`
- `get_skill`

MCP 不进入 MVP 必做范围，但 file protocol 和 CLI 的设计必须让 MCP 可以自然封装。

### Agent Environment

Agent 启动时应该收到这些环境变量：

```text
PRAXISBASE_ROOT=/path/to/repo-or-bundle
PRAXISBASE_AGENT_ID=openclaw-temp-xyz
PRAXISBASE_MODE=episode_writer
PRAXISBASE_SCOPE=team
```

建议模式：

- `read_only`
- `episode_writer`
- `proposal_writer`
- `reviewer`
- `curator`

## 自治与审核

PraxisBase 使用 **D-lite autonomy**：简单规则做风险分级，独立 reviewer agent 检查 proposal，人工只处理异常。

默认模式：

```yaml
autonomy:
  mode: ai_automerge_with_human_exceptions
  reviewer:
    min_confidence: 0.75
    require_independent_context: true
  auto_merge:
    low: true
    medium: true
    high: false
  human_required_for:
    - delete
    - rewrite_policy
    - enable_new_default_skill
    - modify_permissions
    - reduce_safety_checks
```

低风险变更可以自动合入：

- episode summaries
- source reference additions
- typo、tag、link 修复
- personal memory
- 新 known fix，但保持 `draft` status
- 追加 evidence、knowledge reference 或 reference count

中风险变更在 AI reviewer 通过后自动合入：

- 新 team note
- known fix 晋升到 `published`
- procedure 小 patch
- skill 文档补充
- 给已有 fault signature 增加新的成功案例
- 将 draft 提升为 verified

高风险变更进入 human exception queue：

- 删除或重写 decision、procedure、skill
- 启用新的默认 repair skill
- 修改 security policy、permissions、runners、connectors
- 降低 verification 要求
- 触及凭据或生产变更规则
- reviewer confidence 低于阈值
- generator 与 reviewer 判断冲突
- `praxisbase check` 或 build 失败
- 将 verified 提升为 proven
- 标记或解除 `superseded_by`

自动合入需要满足：

1. 有 provenance：episode id、source URI、log hash、ticket id 或 document reference
2. 独立 reviewer approve
3. reviewer confidence 高于阈值
4. `praxisbase check` 成功
5. 没有命中 `manual_required` 规则
6. skill 或 procedure 变更必须包含 verification 和 rollback 段落

MR 和 commit 是审计单位，不是默认人工审批单位。中风险 MR 可以由 AI reviewer 评论、打分并自动 merge。人只看 exception queue：卡住原因、reviewer 判断、风险命中规则和推荐动作。

Exception queue 使用文件协议表达：

```text
.praxisbase/exceptions/
  human-required/
  conflicts/
  failed-checks/
```

Review、promote 和 build 每次运行都应留下 run record，便于失败恢复和 AI 审核：

```text
.praxisbase/runs/
  review/
  promote/
  build/
```

## 调度与触发

PraxisBase 区分 event-triggered repair 和 scheduled knowledge maintenance。

### 事件触发

OpenClaw 修复不应该等待 cron。触发源可以是：

- sandbox health check
- monitoring alert
- 飞书 bot command
- 人工 repair button
- webhook
- 如果暂时没有事件系统，可以用 polling repair launcher

事件启动 repair agent；agent 获取 context、修复、提交 episode，并按需提交 proposal。

### 定时任务

定时维护使用声明式配置：

```yaml
# .praxisbase/schedules.yaml
schedules:
  - id: ingest-openclaw-logs
    task: ingest
    profile: openclaw
    cron: "*/30 * * * *"
    runner: gitlab-ci

  - id: review-proposals
    task: review
    mode: auto
    cron: "*/15 * * * *"
    runner: gitlab-ci

  - id: promote-approved
    task: promote
    mode: auto
    cron: "*/15 * * * *"
    runner: gitlab-ci

  - id: curate-knowledge
    task: curate
    profile: openclaw
    cron: "0 3 * * *"
    runner: gitlab-ci

  - id: ingest-k8s-sources
    task: ingest
    profile: k8s
    cron: "0 */2 * * *"
    runner: gitlab-ci
```

Runner 执行 CLI 任务：

```bash
praxisbase run ingest --profile openclaw
praxisbase run review --auto
praxisbase run promote --auto
praxisbase run curate --profile openclaw
praxisbase build
```

团队 MVP 默认用 GitLab Scheduled Pipelines。Phase 1 只要求 GitLab template 覆盖 `review`、`promote` 和 `build`；`ingest`、`curate` 和 `praxisbase run ...` 是 Phase 2+ 调度形态。个人部署可用 GitHub Actions 或 local cron。后续可增加 Hermes runner 或 `praxisbase-daemon` 做持久调度。

为避免写冲突，写任务应使用单写锁，例如 GitLab `resource_group: praxisbase-write`。Episodes 和 proposals 是独立文件，所以多个 agent 可以并发提交，不需要编辑同一个稳定对象。

## 检索与索引

检索接口必须存在，但 MVP 物理实现用静态生成产物：

- `.praxisbase/indexes/kb-index.json`
- `.praxisbase/indexes/search-index.json`
- `.praxisbase/bundles/openclaw-sandbox.json`
- `dist/repair-bundles/openclaw-sandbox.json`
- `dist/repair-bundles/manifest.json`

以现在“一天几十次修复、沙箱数量增长但修复并发中等”的规模，静态索引和 bundle 足够。只有出现这些情况才需要外部检索服务：

- objects 或 episodes 规模很大
- 很多沙箱同时查询
- 写入后必须近实时可搜
- 需要跨多个 repo 统一搜索
- 需要语义检索或向量召回

Meilisearch、Typesense、SQLite service、ClickHouse、vector search 都应保留为 Phase 2+ 选项。

## Bundle 分发与缓存

Repair agent 在修复前需要稳定获取最新上下文：

```bash
praxisbase bundle fetch openclaw --signature openclaw:claude-auth-expired
```

MVP 可通过 GitLab Pages 或 CI artifacts 分发：

- `dist/repair-bundles/openclaw-sandbox.json`
- `dist/repair-bundles/openclaw/<signature>.json`
- `dist/repair-bundles/manifest.json`

Manifest 应包含：

- bundle version
- commit SHA
- generated time
- compatible CLI version
- checksum

Agent 应缓存 last-known-good bundle。如果最新 bundle 拉取失败，repair agent 可以 fallback 到本地缓存，不因为知识库短暂不可用而无法修复。

## 提交队列与重试

修复运行不应因为知识库暂时不可用而失败。MVP 支持本地 outbox：

```text
.praxisbase/outbox/
  episodes/
  proposals/
```

后续 sync step 再提交这些对象。每个对象需要 idempotency key，避免重试造成重复学习记录。

临时沙箱 agent 不应该默认拥有宽泛 Git 写权限。MVP 至少支持一种低摩擦提交通道：

- agent 在 checkout 内运行时，直接落本地文件
- 使用受限 bot token 提交 Git branch 或 MR
- 可选 HTTP webhook submission gateway

协议不能假设每个沙箱都能直接 push 到权威仓库。

## Evidence Contract

自动晋升依赖证据。缺少证据的 proposal 应被拒绝或保留为 draft。

最小 evidence 字段：

- source URI 或 log reference
- 被引用 source excerpt 或 raw object 的 hash
- 简短的证据摘录或总结
- repair result：success、failed、partial、unknown
- verification command 或 verification observation

出于隐私和合规，证据摘录进入 Git 前必须先脱敏。

## 成功指标

MVP 需要基础指标来判断自学习是否真的提升修复能力：

- repair success rate by problem signature
- 新 known fix 出现前后的重复失败次数
- average repair duration
- proposal approval rate
- reviewer auto-merge rate
- human exception rate
- stale or unverified skill count

这些指标可以生成 JSON，并渲染到 HTML inspection output。第一版不需要完整 dashboard。

## Cold Start Seed Pack

系统需要初始知识，否则第一次 `repair-context` 没法帮忙。MVP 应包含一个小 seed pack：

- 5 到 10 个常见 OpenClaw sandbox problem signatures
- baseline diagnostic procedure
- sandbox safety policy
- 1 到 2 个示例 repair skills
- 1 个示例 episode
- 1 个示例 proposal

这既让第一版立刻可用，也给后续 agent 示例化对象格式。

## 冲突处理

多个 proposal 可能修改同一个 known fix 或 skill。MVP 使用简单规则：

- episode 永远不冲突，因为它们是 append-only
- proposal 是独立文件
- promotion 通过 GitLab `resource_group` 锁住写入
- 如果两个已批准 proposal patch 同一对象，后提交者 patch 失败后回到 review queue，状态为 `conflict`

## Reviewer 配置

Reviewer 行为必须可配置：

- model provider 和 fallback
- confidence threshold
- max proposals per run
- allowed auto-merge risk levels
- required checks
- prompt template version

Review 结果应记录 reviewer model、prompt version、confidence、risk level 和 reason。

## Repair Agent 安全边界

PraxisBase 提供修复知识，但不应该默默扩大执行权限。每个 repair bundle 必须包含：

- allowed action class
- forbidden operations
- verification steps
- rollback steps
- escalation condition

对 OpenClaw 沙箱，MVP 可以允许 sandbox 内修复动作，但任何影响生产系统的动作都应标记为 high risk 或 out of scope。

## 兼容性与版本

File protocol 从一开始就需要版本字段：

```yaml
protocol_version: 0.1
```

Bundles、episodes、proposals、reviews、skills 都应记录其目标 protocol version，避免旧临时 agent 误读新 bundle 格式。

## Hermes 集成

Hermes 应该是 first-class peer client，而不是 PraxisBase core。

Hermes 可以作为：

- persistent curator：合并重复 proposal、发现 stale skills、提出 cleanup
- skill consumer：加载 `skills/**/*.md`
- memory peer：把 Hermes memory 变化导出为 PraxisBase episode 或 proposal
- skill synthesizer：把复杂任务或重复成功修复总结成本地 `SKILL.md`，再提交为 PraxisBase skill proposal
- runner：周期性触发 review、promote、curate、build

这样 PraxisBase 保持 agent-neutral，同时获得 Hermes-like 自学习能力。

边界要明确：

- Hermes 可以让第一版 skill synthesis 更快出现，因为它已有 agent-managed skills、persistent memory 和 curator。
- Hermes 生成或维护的 skill 不能直接绕过 PraxisBase 的 evidence/review/promote 流程进入团队共享层。
- PraxisBase 的 file protocol、CLI、future MCP wrapper 必须继续支持非 Hermes agent。
- 团队共享 skill registry 的 source of truth 仍然是 PraxisBase/Git，而不是某个 Hermes 本地目录。

## Skill 自总结与复用

除了沉淀 known fix 和 procedure，PraxisBase 还需要一条 **skill synthesis loop**：

```text
episodes -> pattern clustering -> skill draft proposal -> AI review -> promote to skills/ -> bundle includes skill -> next agent reuses it
```

触发条件可以是：

- 同一 problem signature 多次修复成功
- 多个 episode 重复出现相同诊断命令或验证步骤
- reviewer/curator 发现某个 known fix 已经足够稳定
- 持久 OpenClaw bot 或 Hermes curator 主动提出 skill draft

Skill proposal 必须包含：

- 使用条件
- 需要的上下文
- 操作步骤
- 禁用操作
- verification
- rollback
- evidence refs
- 适用范围和风险等级

Phase 1 只实现 skill 作为稳定对象和 proposal/promotion 目标；完整自动总结 skill 放在 Phase 2。这样 MVP 不跑偏，但协议从第一天就支持 Hermes-like skill evolution。

## MVP 范围

### 知识治理优先级

这版设计吸收 Harness 知识沉淀实践和 LLM Wiki v2 的核心思想，但按优先级落地：

- **P0：Phase 1 预留字段。** `maturity`、`knowledge_type`、`knowledge_references`、`scope`、`reference_count`、`last_referenced_at`、`supersedes`、`superseded_by`。
- **P1：Phase 1 轻量实现。** exception queue、review/promote/build run records、pitfall 类型、promotion 安全边界、compact bundle。
- **P2：Phase 2 治理闭环。** 自动成熟度晋升、自动衰减、`praxisbase lint`、cold-start import、duplicate/contradiction detection、query budget、stage-aware retrieval。
- **P3：平台化能力。** 多 repo federation、外部搜索、远程审批 UI、飞书 exception workflow、Hermes curator 深度集成。

MVP 必须包含：

- `.praxisbase/`、`kb/`、`skills/` file protocol
- episode、proposal、review、known fix、procedure、skill、policy、pitfall 核心 schema
- `maturity`、`knowledge_type`、`knowledge_references`、`reference_count`、`last_referenced_at`、`supersedes`、`superseded_by` 等轻量知识治理字段
- CLI：init、repair-context、bundle fetch、episode submit、propose、review、promote、build、check
- OpenClaw repair bundle generation
- D-lite AI review 和 automatic promotion
- static indexes 和 bundles
- GitLab scheduled pipeline template
- HTML inspection output
- agent identity、bundle distribution、outbox retry、exception queue、run records、evidence contract、metrics、seed pack、conflict handling、reviewer config、protocol versioning

MVP 不做：

- blockchain
- external search service
- mandatory vector database
- complex multi-tenant permissions
- full MCP server implementation
- full Hermes runner implementation
- search/read/curate/ingest command implementation
- automatic maturity promotion/decay implementation
- knowledge lint implementation
- cold-start import implementation
- 把所有 raw logs 存进 Git
- 在 repair agent 自身沙箱权限之外，自动执行生产变更

## 分阶段路线

### Phase 0：重定文档方向

把项目文档从 “self-updating wiki” 改成 “agent knowledge substrate”。保留 Markdown-to-HTML 作为发布层。

### Phase 1：OpenClaw 修复闭环

实现 file protocol、CLI、OpenClaw repair context retrieval、episode submission、proposal submission、AI review、promotion、generated bundles 和 HTML inspection。

### Phase 2：K8s 故障系统

增加 K8s ingest profiles、incident bundles、飞书 bot 响应流程和 runbook proposal flow。

同时加入知识治理闭环：`praxisbase lint`、cold-start import、自动成熟度晋升、自动衰减、duplicate/contradiction detection、query budget、stage-aware context retrieval，以及 Hermes-like skill synthesis。从重复成功的 OpenClaw/K8s episodes 中自动生成 `SKILL.md` proposal，经过 AI review 后进入 `skills/` 并被后续 agent 复用。

### Phase 3：Thin MCP Server 与 Hermes Runner

用 MCP tools 包装稳定 core，并加入 Hermes 作为 persistent curator 或 scheduler。

### Phase 4：Federation 与 Scaling

支持多 repository、外部搜索后端、更强访问策略、signed provenance 和跨团队同步。

## 实施计划输入

以下决策在 MVP 中固定：

- 团队权威层默认 GitLab，个人权威层默认 GitHub。
- 先用静态 search 和 bundle 产物，再引入外部索引。
- 使用 AI-reviewed auto-merge with human exceptions。
- OpenClaw 沙箱修复是第一生产场景。
- K8s 故障定位复用同一协议，不做独立知识系统。
- Hermes 是 peer client，不是 PraxisBase 内核。

实施计划需要进一步确定：

- 具体 schema 文件
- CLI package 边界
- reviewer prompt templates
- GitLab CI 模板
- seed pack 的第一批 OpenClaw problem signatures
