# M30 团队版 · 飞书数据源接入（文档 + 聊天记录）设计

日期：2026-06-05
上游 anchor：`docs/superpowers/specs/2026-06-02-convergence-and-team-roadmap-design.md`
前置门：M28 团队修复自我进化全绿（M29 容器排查可并行或在后，不阻塞 M30 设计，但实现排在 M29 之后）。

## 1. 目标

让团队版除了 agent 记忆/修复日志之外，**同时支持两条飞书数据源接入路径**：

- **路径 A（OpenClaw 飞书插件 / 间接）**：飞书文档/聊天经 **OpenClaw 飞书插件**变成 OpenClaw 的 memory/export，PraxisBase 按既有 `agent=openclaw, channel=feishu` 摄入。**几乎不改 PraxisBase 核心**，复用现有 openclaw-api/export/ssh adapter。
- **路径 B（飞书 CLI / 飞书开放平台 API / 直连）**：飞书文档和聊天记录作为**一等数据源**，PraxisBase 通过飞书 CLI 或开放平台 API 直接拉取，新增 `feishu` source_type 与 `feishu-doc` / `feishu-chat` parser。

两条路径**共用**同一套下游：privacy triage → context reducer → lesson/wiki/skill 蒸馏 → review/promote。飞书内容**永远是 source，不是知识权威**；原文不进 Git，只进脱敏摘要 + source ref + hash。

**本次明确要同时支持 A 和 B**（用户决策）。A 先落地（成本低、复用现有），B 紧随（新增 adapter + 强隐私门）。

## 2. 为什么两条都要

| 维度 | 路径 A（OpenClaw 插件） | 路径 B（飞书 CLI/API 直连） |
| --- | --- | --- |
| 适用 | 已经把飞书接入 OpenClaw bot 的团队 | 没有 OpenClaw 飞书 bot，但要直接归档飞书知识库/群经验的团队 |
| PraxisBase 改动 | 极小（复用 openclaw 源） | 新增 source_type/parser/adapter |
| 数据形态 | OpenClaw 已结构化的 memory/export | 飞书原始文档/消息（更脏、更私密） |
| 隐私风险 | 中（OpenClaw 已做一层） | 高（私聊/PII 多，需最强 triage） |
| 上线速度 | 快 | 慢（需飞书鉴权 + 强隐私门） |

两者不是二选一：A 解决"已有 OpenClaw 飞书 bot 的经验"，B 解决"飞书里本来就有、但没经过 agent 的文档与群知识"。

## 3. 非目标

- 不把飞书原文（完整文档正文、完整聊天记录、token、cookie）写进 Git。
- 不把飞书当知识权威；飞书只是 source，权威仍是 review/promote 后的 `kb/`、`skills/`。
- 不做飞书双向写回（不往飞书发审核结果，除已有 `feishu/summary.ts` 的 incident 卡片推送）。
- 不在 PraxisBase 内存飞书凭据（只存 env 名 / OS keychain 引用）。
- 不绕过 team 模式 review-first 与隐私硬拦截。
- 不实现飞书审批 workflow（exception 仍走 PraxisBase 自己的 human-required 队列）。

## 4. 路径 A：OpenClaw 飞书插件（间接）

### 4.1 模型

```text
飞书文档/群消息
  -> OpenClaw 飞书插件（OpenClaw 侧，非 PraxisBase）
  -> OpenClaw memory / export / API
  -> PraxisBase source: agent=openclaw, channel=feishu, source_type ∈ {openclaw-api, ssh, http, file}
  -> 既有 adapter（resolveExperienceSource）
  -> privacy triage -> 蒸馏 -> review/promote
```

### 4.2 PraxisBase 侧改动（最小）

- **几乎无核心改动**：`channel=feishu` 已存在，openclaw-api/ssh/http/file adapter 已存在。
- 只需：
  - `source add` 文档化飞书 OpenClaw 源的标准写法；
  - 给 `channel=feishu` 的 OpenClaw 源在 privacy triage 里**默认 team review-first**（飞书来源不享受 `trusted_personal_remote` 快速通道）；
  - 报告/HTML 标注 `channel=feishu` 来源占比，便于审计。

### 4.3 OpenClaw 插件契约（PraxisBase 不实现，只约定）

OpenClaw 飞书插件导出的 memory/export 应包含：source_ref（飞书文档/消息可定位标识，**脱敏**）、内容摘要、scope hint、时间。PraxisBase 按既有 openclaw-export parser 消费。插件本身由 OpenClaw 侧实现（peer 边界，类比 sre-autopilot）。

## 5. 路径 B：飞书 CLI / 开放平台 API（直连，一等数据源）

### 5.1 新增 schema

```text
ExperienceSourceTypeSchema += "feishu"
ExperienceSourceParserSchema += "feishu-doc", "feishu-chat"
ExperienceSourceAgentSchema += "feishu"   # 飞书作为产源（文档/群非 agent，但需可标识来源）
# channel "feishu" 已存在，复用
```

source config 字段（复用现有，凭据只存 env 名）：
- `source_type: feishu`
- `parser: feishu-doc | feishu-chat`
- `feishu_app_id_env` / `feishu_app_secret_env`（只存 env 名，沿用 `assertNoConfigCredential`）
- `feishu_target`：文档 token / 知识库 wiki space id / 群 chat id（**非凭据**，但需在 doctor 校验可达）
- `feishu_cli_path`（可选，走飞书 CLI 时的可执行路径包装器，类比 gbrain executable wrapper）

### 5.2 两种接入方式（CLI 优先，API 兜底）

- **飞书 CLI 方式**：PraxisBase 调用用户配置的飞书 CLI 可执行（wrapper 注入 env），拉文档/消息为 JSON，再用 `feishu-doc`/`feishu-chat` parser 解析。类比 `gbrain-adapter` 调 gbrain executable 的模式。
- **开放平台 API 方式**：PraxisBase 直接调飞书 OpenAPI（鉴权用 env 名引用的 app id/secret 换 tenant_access_token）。非 HTTPS 拒绝（除 loopback）。

### 5.3 parser 行为

- `feishu-doc`：把飞书文档/知识库页转为 canonical Markdown chunk（复用 context-reducer 压缩），保留文档 title、最后编辑时间、文档 token 作 source_ref。
- `feishu-chat`：把群消息按"话题段"切块（不是逐条），保留 chat id + message id 范围作 source_ref，**默认丢弃**纯闲聊/系统消息。

### 5.4 强隐私门（B 的核心，比 A 更严）

飞书聊天含大量私聊/PII，必须在 AI 蒸馏前硬拦截：
- team 模式默认 **review-first**，飞书源**不可**用 `trusted_personal_remote` 快速通道。
- deterministic 硬拦截（在 envelope 创建前）：手机号、邮箱、身份证、银行卡、token/secret/cookie、@个人、私聊 1v1 内容、外部租户标识。
- 复用现有 `privacy-triage.ts` 的 `containsConcretePrivateValue` + `redactForTriage`，并扩展飞书专属规则（飞书 user_id / open_id / union_id / chat_id 原值视为私有标识，必须脱敏）。
- 不确定项 → `.praxisbase/exceptions/human-required`，HTML 只显示脱敏摘要 + 原因码，不显示原文。
- 1v1 私聊默认 **reject**（不进任何蒸馏）；群消息默认 review；公开知识库文档默认可走常规 triage。

### 5.5 doctor

`praxisbase source doctor <feishu-source>` 检查：
- CLI 可执行存在 / API base 可达且 HTTPS；
- env 名引用的凭据存在（不打印值）；
- target（文档/群 id）可读；
- 非 loopback 明文 HTTP 拒绝。

## 6. 数据流（A 与 B 汇合）

```text
路径A: 飞书 -> OpenClaw 飞书插件 -> OpenClaw export -> source(agent=openclaw,channel=feishu)
路径B: 飞书 -> 飞书 CLI/API -> source(source_type=feishu, parser=feishu-doc|feishu-chat)
                         |
                         v
        resolveExperienceSource -> ExperienceEnvelope（脱敏摘要+source_ref+hash）
                         |
                         v
        privacy triage（team review-first，飞书强规则，1v1 reject）
                         |
                         v
        context reducer -> lesson/wiki/skill 蒸馏 -> semantic review -> review/promote
                         |
                         v
        kb/ + skills/（权威，原文永不入 Git）
```

## 7. 验收门（并入 team release-audit）

```text
feishu_source_a_ga   # channel=feishu 的 OpenClaw 源可摄入，team review-first 生效
feishu_source_b_ga   # feishu source_type + feishu-doc/feishu-chat parser 可拉取并脱敏入 envelope
feishu_privacy_ga    # 1v1 私聊 reject；PII/凭据/飞书 id 硬拦截；原文不入 Git；HTML 只显示脱敏摘要
```

**domain-enabled 判定（沿用 M29 K8s 模式）**：未配置任何飞书源（A 或 B）时，三门返回 `not_run` + warning `feishu_domain_not_enabled`，**不拉黑 `team_ga`**（飞书是可选 domain，与 GBrain waived / K8s not_run 同一哲学）。一旦配置了飞书源，三门按真实证据严格判定，不放水。

真实验收命令（B 用 mock 飞书 API/CLI fixture，避免真实拉取私密数据）：
```bash
praxisbase source add feishu-team-docs --agent feishu --type feishu --parser feishu-doc --feishu-target <wiki-space> --scope team
praxisbase source add feishu-team-chat --agent feishu --type feishu --parser feishu-chat --feishu-target <chat-id> --scope team
praxisbase source doctor feishu-team-docs --json
praxisbase daily run --mode team-git --build-site --json
praxisbase team release-audit --json
```
记录在 `docs/status/m30-feishu-source-integration-<date>.md`。

## 8. 失败处理

| 失败 | 行为 |
| --- | --- |
| 飞书 CLI/API 不可达 | 源标 partial，warning，不阻断其它源 daily |
| 凭据 env 缺失 | doctor 报错，源跳过 |
| 命中 PII/1v1/凭据 | envelope 前硬拦截，进 human-required 或 reject |
| 飞书 id 原值泄漏 | 脱敏后入；leak scan 命中则阻断 promote |
| OpenClaw 飞书插件缺字段 | 按 openclaw-export 容错，缺失记 warning |

## 9. 实现复用地图

- 路径 A：`experience/source-adapters.ts`（openclaw-export/api 已有）、`experience/remote-sources.ts`、`privacy-triage.ts`（加 feishu review-first）。
- 路径 B：`protocol/schemas.ts`（加 feishu enum）、`experience/source-config.ts`（feishu 字段 + `assertNoConfigCredential` 复用）、新增 `experience/feishu-adapter.ts` + `experience/feishu-client.ts`（类比 gbrain-adapter/client）、`privacy-triage.ts`（飞书强规则）。
- 验收：新增 `feishu` gates 进 `experience/team-release-audit.ts`（M28 已建）。
- 出方向 `feishu/summary.ts` 保持不变（incident 卡片推送，与本 change 无关）。

## 10. 与历史文档的一致性

- `daily-agent-experience-loop` 曾把"飞书原文 ingestion / feedback adapter"列为 Non-Goal——本 change **正式把它从 Non-Goal 提升为 M30 范围**，并补齐当时缺的强隐私门。
- `knowledge-governance-phase2` 提过 `import feishu <path>`（冷启动导入飞书导出）——B 路径覆盖并取代它，统一为飞书 source adapter，不再单独做一次性 import 命令。
