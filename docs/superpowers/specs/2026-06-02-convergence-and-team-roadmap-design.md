# PraxisBase 收敛与团队版路线总设计 (Convergence & Team Roadmap)

日期：2026-06-02
状态：**anchor 文档**。本文件是后续所有 milestone 文档的"宪法"。任何 spec / plan / openspec / bdd 与本文件冲突时，以本文件为准；如需改变方向，先改本文件并记录原因。

> 一句话目标：**agent 可丢弃，经验要持久。** 让个人和团队的多 agent（Codex / Claude Code / OpenClaw 修复 agent / 容器排查 agent）产生的经验、记忆、skill 自动沉淀、审核、晋升，并能被下一个 agent 复用与自我进化。

---

## 0. 为什么需要这份文档

项目已迭代到 M26，`docs/openspec/changes/` 下有 35 个 change、`specs/` 下 31 份设计。核心定位（agent-native knowledge substrate）没有错，但执行出现两个问题：

1. **迭代失控**：几乎每天一个 milestone，在没有"完整闭环验收"之前不断开新 surface。
2. **重心漂移**：从最初的 **"OpenClaw 修复闭环 + 团队经验共享"** 漂移到 **"个人每日 session 蒸馏 wiki 编译器"**。修复主线（`repair-context` 取经验 → 修复 → `episode` 回流 → skill 自我进化）被冷落，团队版至今零真实验证。

本路线的目的：**先封顶个人版（用硬验收逼停迭代），再用已被验证的对象模型把团队版的两个真实场景做出闭环。** 不新增产品面，只把已设计、字段已预留的能力真正落地。

### 0.1 反漂移纪律（对实现 AI 的硬约束）

实现任何下游 milestone 的 AI 必须遵守：

- **R1 不新增产品 surface**：在当前 milestone 的验收门未全绿之前，禁止引入新的 CLI 顶层命令族、新的检索后端、新的存储层。只允许补全本 milestone 定义的命令。
- **R2 复用既有对象模型**：episode / proposal / review / known_fix / skill / bundle 已在 `packages/core/src/protocol/{types,schemas}.ts` 定义。新场景（容器排查）必须复用 `IncidentEpisode` / `Proposal`，只新增 `problem_signature` 命名空间和 domain，不新建平行对象。
- **R3 Git 是权威层**：稳定知识只通过 proposal → review → promote 改变。任何 agent（含修复 agent、容器排查 agent）默认只能写 inbox/outbox。
- **R4 人工只处理异常**：中低风险 AI 自动合入，高风险进 `exceptions/human-required`。不得把所有 proposal 变成人工审批，也不得让高风险自动晋升。
- **R5 先契约后实现**：每个 milestone 先写 openspec spec delta + BDD fixture，再写实现。新增/修改字段先改契约和 fixture。
- **R6 真实验收**：每个 milestone 必须有一次 `docs/status/` 真实运行记录，不能用单测代替"闭环可用"证明。
- **R7 隐私与边界**：personal 不自动流入 team；容器排查场景生产默认只读；修复 agent 不超出沙箱权限执行生产变更。

---

## 1. 北极星与三条产品线

PraxisBase 是 **经验精炼厂 + 共享 skill registry + repair bundle 生成器**。运行时检索/brain 外包给 GBrain，session 召回外包给 AgentMemory。我们只负责"治理后发布"。

三条产品线（共用同一套 file protocol + CLI + 对象模型）：

| 线 | 名称 | 谁在用 | 状态 | 归属 milestone |
| --- | --- | --- | --- | --- |
| P | 个人经验沉淀（每日蒸馏 + 修复经验） | 单人多 agent | **4 门已绿，差 B1/B2 收尾** | **M27 封顶（收尾中）** |
| B | OpenClaw 修复 agent 自我进化 | 团队多修复 agent (Claude Code) | 个人侧验证过对象模型，团队侧零落地 | **M28** |
| A | 容器 / K8s 问题排查经验积累 | 团队 + sre-autopilot peer | 契约 ready，零实现 | **M29** |
| G | 知识治理底座（五层 scope + 成熟度晋升/衰减 + 查询预算 + 三级索引） | 支撑 P/B/A | schema 字段已预留，只存不更新 | **横切，M28 起逐步落地** |

**关键认识（修正上一轮）**：
- 团队版 = **B + A**，而且 **B 是主场景、A 是同协议第二 domain**。治理底座 G 不是独立目标，是支撑 B 和 A 的地基。
- B 优先于 A：B 的对象模型、bundle、skill synthesis 在个人侧已验证大半，迁到团队 GitLab review/promote 最快出闭环；A 依赖独立的 sre-autopilot 系统，我们只交付 bundle + episode intake。

### 1.1 团队版支持的数据源（截至 M30 规划）

| 数据源 | 接入方式 | 状态 | milestone |
| --- | --- | --- | --- |
| Codex / Claude Code / OpenClaw / OpenCode session、记忆、修复日志 | local/file/git/ssh/http/openclaw-api adapter | 已支持 | 现有 |
| 远程 OpenClaw（含 bot） | file/git/ssh/http/openclaw-api | 已支持 | 现有 |
| AgentMemory（session sidecar）、GBrain（检索/import） | agentmemory / gbrain source_type | 已支持（sidecar） | 现有 |
| 容器/K8s incident（sre-autopilot peer） | incident bundle + episode intake | 契约 ready | M29 |
| 飞书文档/聊天（经 OpenClaw 飞书插件） | `agent=openclaw, channel=feishu` | 标记位已存在，需 review-first 补强 | **M30 路径 A** |
| 飞书文档/聊天（飞书 CLI / 开放平台 API 直连） | 新 `feishu` source_type + `feishu-doc`/`feishu-chat` parser | 待实现 | **M30 路径 B** |

注：`channel=feishu` 当前只是 provenance 标签（飞书是 OpenClaw bot 的渠道，不是独立源）；M30 把飞书原文 ingestion 从历史 Non-Goal 正式提升为范围，并补齐强隐私门。

---

## 2. Milestone 序列与验收门

```text
M27 个人版封顶 (Personal GA Freeze)
   └─ [进度] 4 门已真实全绿(commit d424f8c)；但 B1/B2 质量收尾未完成 → 未正式封顶
   └─ 必须 B1/B2 收尾 + kb audit 真干净后才允许动 M28
M28 团队版 · OpenClaw 修复自我进化 (Team Repair Self-Evolution)  ← 团队版主线
   └─ 内含治理底座 G 的第一批落地（成熟度晋升 + 引用追踪 + 查询预算）
M29 团队版 · 容器/K8s 排查经验 (Container Incident Experience)
   └─ 复用 M28 的协议与治理，接 sre-autopilot peer
M30 团队版 · 飞书数据源接入 (Feishu Source Integration)
   └─ 同时支持 路径A(OpenClaw 飞书插件) + 路径B(飞书 CLI/API 直连)，最强隐私门
M31 治理底座收口 + 跨 domain 联邦（可选，按需）
```

每个 milestone 的"门"必须可被一条命令验证（沿用 M26 的 `release-audit` 模式）。门不全绿，不进下一个 milestone。

### M27 — 个人版封顶（先做，最高优先级）

**目标**：把 M26 已定义但未完成的 4 道门真正跑通，用 `personal release-audit` 逼停迭代。

**当前进度（2026-06-02，commit d424f8c）**：
- ✅ `personal release-audit` 四门**真实全绿**：`personal_ga / wiki_context_ga / skill_compiler_ga / gbrain_runtime_ga` 全 pass。
- ✅ Gate 1：full queue drained，`remaining_high_priority_items=0`；队列误算根因已修。
- ✅ Gate 2A：1 个 promoted skill，inject-preview 非空。
- ✅ Gate 2B：GBrain export + retrieval 有证据（pass）。
- ✅ 1367/1367 测试通过；站点 14 pages 干净。
- ❌ **B1 未修**：稳定知识仍带 `memory/dreaming/*` provenance（4+ 页面），且 `promotionTimeGuard` 无 dreaming 检查 → `kb audit` 假绿(13/13)。
- ❌ **B2 未修**：kb 文件名仍是整句，slug 未规范化。

**剩余范围（收尾，必须做完才进 M28）**：
- B1：给 `promotionTimeGuard` 加 dreaming/corpus/candidate provenance 检查（让 `kb audit` 真能报）；`kb prune` 或重新晋升清理已有脏页。
- B2：slug 规范化 util + 一次性迁移（短 slug 作文件名，长句进 `title`）。
- （可选增强）给 `gbrain_runtime_ga` 加 `waived` 状态 + `--waive-gbrain`，让无 GBrain 的离线用户也能达 GA。

**非目标**：团队模式、容器排查、任何新 CLI 命令族。

**门（release-audit 必须输出 + kb audit 真干净）**：
```text
wiki_context_ga: pass
skill_compiler_ga: pass
gbrain_runtime_ga: pass (或 waived，需在 audit 中显式标注 waived 原因)
personal_ga: pass
kb audit: 真实 0 dreaming/corpus provenance（非假绿）
```

**借鉴落地**：B1 的 kb 质量度量直接源码级移植 llmwiki(MIT) 的 `eval/`+`linter/`（见 5.1）；nashsu llm_wiki 的级联删除只能借思想自写(GPL 不可拷)。

### M28 — 团队版 · OpenClaw 修复自我进化（团队主线）

**目标**：让团队内多个 OpenClaw 修复 agent（Claude Code）在团队 GitLab 上形成完整自我进化闭环：
```text
修复前: repair-context openclaw → 取历史修复经验 + 已晋升 skill
修复中: Claude Code 在沙箱内修复
修复后: episode submit (成功/失败证据) + propose (新经验)
晋升:   review --auto → promote (中低风险) / human-exception (高风险)
进化:   重复成功 episode → skill synthesize → review → promote → 下个 agent 自动加载
治理:   被引用的知识 reference_count++ 自动晋升 maturity；长期未引用自动衰减
```

**范围**：
- 团队 GitLab 权威层：`daily run --mode team-git --commit --push`，`resource_group: praxisbase-write` 写锁，Scheduled Pipeline 跑 review/promote/build。
- 修复闭环主线接回：以 `repair-context` + `episode` + `propose` 为团队 demo 主场景（不是每日 session 蒸馏）。
- skill 自我进化闭环：复用 `synthesis/skill-*.ts`，团队 skill **必须人工/Git review**（不自动晋升，沿用 `agent-skill-synthesis-governance` 的 Team Skill Review Boundary）。
- **治理底座 G 第一批**：
  - 引用追踪闭环：episode 的 `knowledge_references` 在 promote/build 时回写 `reference_count` / `last_referenced_at`。
  - 自动成熟度晋升：被 N 个不同 environment/run 验证 → draft→verified→proven（阈值进 policy）。
  - 自动衰减：proven 12 月未引用→verified，verified 6 月未引用→draft，draft 持续未引用→archive（沿用腾讯实践的衰减规则，作为设计验证，不复刻其代码）。
  - 查询预算 + 三级渐进索引：`repair-context` / `context get` 限制注入字节，避免团队知识膨胀后上下文爆炸。
- 隐私边界：personal scope 不进 team 稳定知识；凭据/私有标识硬拦截。

**非目标**：容器/K8s（留给 M29）、多 repo 联邦、外部向量库。

**门（新增 `praxisbase team release-audit --json`）**：
```text
team_repair_loop_ga: pass    # repair-context→episode→propose→review→promote 真实闭环
skill_self_evolution_ga: pass # ≥1 团队 skill 经 review 晋升并被 repair-context 加载
governance_ga: pass          # 引用追踪+成熟度晋升+衰减+查询预算 真实生效
privacy_boundary_ga: pass    # personal 不入 team，凭据被拦截
team_ga: pass
```

**借鉴落地**：高德 SkillClaw 的 post-task skill 演化 / 跨 agent 去重合并思想落进 skill synthesize；腾讯五层+衰减作为治理设计验证。

### M29 — 团队版 · 容器/K8s 排查经验

**目标**：把容器排查作为同协议的第二个 domain 接入，复用 M28 的协议、治理、review/promote，对接独立的 sre-autopilot peer。

**范围**：
- K8s seed pack：5–10 个常见 signature（`k8s:pod-oomkilled`、`k8s:pod-crashloop-imagepull`、`k8s:ingress-5xx-upstream-timeout` 等）+ baseline triage skill + forbidden operations（生产只读）。
- `praxisbase bundle fetch k8s-incident --signature ...`：生成只读 incident bundle（按 signature 过滤，含风险/禁用操作/验证步骤/source refs）。
- K8s incident bundle generator（`build` 增加 k8s-incident profile）。
- episode intake：复用 `adapter/sre-autopilot.ts`（`adaptDirectionResult` 已存在），打通 outbox → review → promote。
- 边界守护：PB 不给 K8s 写权限；bundle 只能建议不能要求执行；新默认 skill 必须人工确认。

**非目标**：不实现 sre-autopilot 的 Go analyzer / 探针 / LLM loop（那是对方实现方的边界）；不做 live incident 调度。

**门（`team release-audit` 增加 domain）**：
```text
k8s_bundle_ga: pass          # bundle fetch 按 signature 返回安全只读包，校验失败降级
incident_episode_intake_ga: pass # sre-autopilot episode/proposal 进 review/promote
k8s_boundary_ga: pass        # 生产只读、无写权限、禁用操作齐全
```

### M30 — 团队版 · 飞书数据源接入（文档 + 聊天记录）

**目标**：让团队版除 agent 记忆/修复日志外，**同时支持两条飞书接入路径**：
- 路径 A（OpenClaw 飞书插件，间接）：飞书内容经 OpenClaw 插件变成 OpenClaw export，按 `agent=openclaw, channel=feishu` 摄入，几乎不改 PraxisBase 核心。
- 路径 B（飞书 CLI / 开放平台 API，直连）：飞书文档/聊天作为一等数据源，新增 `feishu` source_type + `feishu-doc`/`feishu-chat` parser + 新 adapter。

飞书永远是 source，不是知识权威；原文不进 Git，只进脱敏摘要+source_ref+hash。B 路径含最强隐私门（1v1 reject、PII/飞书 id 硬拦截、team review-first）。

**门（team release-audit 增加）**：`feishu_source_a_ga` / `feishu_source_b_ga` / `feishu_privacy_ga`。

详见 `docs/superpowers/specs/2026-06-05-m30-feishu-source-integration-design.md`。实现排在 M29 之后；A 先落地，B 紧随。

### M31 —（可选）治理收口 + 跨 domain 联邦

成熟度衰减 lint 全量化、duplicate/contradiction detection、多 repo federation、跨团队同步。仅在 M28/M29/M30 全绿且有真实需求时启动。

---

## 3. 文档策略：每类文档何时写、写什么

回答你的问题——**四类文档都要写，但不是每个 milestone 都四件套全写**。按下表执行：

| 文档类型 | 路径约定 | 作用 | 何时必须写 |
| --- | --- | --- | --- |
| **设计文档 (design)** | `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md` | 解释 why / 架构 / 边界 / 取舍 / 数据流 / 失败处理。给"理解"用 | **每个 milestone 必写**。这是防止跑偏的"为什么"层 |
| **OpenSpec change** | `docs/openspec/changes/<name>/{proposal,design,tasks}.md` + `specs/<cap>/spec.md` | proposal=范围与验收摘要；tasks=可勾选清单；spec.md=`ADDED/MODIFIED Requirements`+`Scenario`（契约）。给"实现与验收"用 | **每个 milestone 必写**。spec delta 是实现 AI 的契约源 |
| **BDD feature** | `docs/bdd/<name>.feature` | Gherkin（`# language: zh-CN`）。可执行验收。给"测试"用 | **每个 milestone 必写**。是 R6 真实验收的脚本基础 |
| **实施计划 (plan)** | `docs/superpowers/plans/YYYY-MM-DD-<name>-implementation-plan.md` | 拆解实现步骤、模块改动点、测试矩阵、风险。给"怎么做"用 | **跨多模块/高复杂度的 milestone 必写**（M28/M29 必写；M27 因主要是补全，可合并进 openspec tasks） |
| **traceability（可选）** | `docs/superpowers/plans/YYYY-MM-DD-<name>-traceability.md` | 需求↔实现↔测试映射 | 需要审计追溯时写（团队版 M28/M29 建议写） |
| **status（验收记录）** | `docs/status/<name>-<date>.md` | 真实运行证据 | 每个 milestone 收尾时写（R6） |

**优先级原则**：design + openspec(proposal/tasks/spec) + bdd 是**防漂移三件套**，缺一不可。plan 在复杂 milestone 加写。traceability/status 收尾补。

### 3.1 每个 milestone 的标准文档包

- **M27 个人版封顶**（补全为主，4 件）：
  - design：`2026-06-02-m27-personal-ga-freeze-design.md`
  - openspec：`changes/m27-personal-ga-freeze/{proposal,design,tasks}.md` + `specs/agent-knowledge-substrate/spec.md`
  - bdd：`bdd/m27-personal-ga-freeze.feature`
  - （plan 可省，tasks 已够细）
- **M28 团队修复自我进化**（5 件 + traceability）：
  - design：`2026-06-03-m28-team-repair-self-evolution-design.md`
  - plan：`plans/2026-06-03-m28-team-repair-self-evolution-implementation-plan.md`
  - openspec：`changes/m28-team-repair-self-evolution/{proposal,design,tasks}.md` + `specs/agent-knowledge-substrate/spec.md`
  - bdd：`bdd/m28-team-repair-self-evolution.feature`
  - traceability：`plans/2026-06-03-m28-...-traceability.md`
- **M29 容器排查**（5 件 + traceability）：同 M28 结构，name = `m29-container-incident-experience`。
- **G 治理底座**：不单独成 milestone，其契约写进 M28 的 spec delta（一个 `governance` capability section），实现随 M28 落地。

---

## 4. 对象模型与代码复用地图（防止重造轮子）

实现 AI 必须基于以下既有代码，禁止新建平行实现：

| 能力 | 既有文件 | M27/28/29 该做什么 |
| --- | --- | --- |
| 协议类型/校验 | `protocol/types.ts`, `protocol/schemas.ts` | 复用 `Scope`/`Maturity`/`KnowledgeType`/`IncidentEpisode`/`Proposal`。新增字段先改 schema+fixture |
| 修复上下文 | `repair/context.ts`, `repair/signature.ts` | M28 把 `SIGNATURE_CONTEXTS` 从硬编码改为读 `kb/`+`skills/`；接查询预算 |
| 容器排查 adapter | `adapter/sre-autopilot.ts` | M29 复用 `adaptDirectionResult`，打通 outbox→review→promote |
| review/promote | `review/{policy,reviewer,risk}.ts`, `promote/promote.ts` | M28 团队风险分级 + 引用回写 + 成熟度晋升 |
| skill 合成/审核/晋升 | `synthesis/skill-*.ts` | M28 团队 skill 走人工 review；复用 audit/validation |
| 知识维护 | `kb/maintenance.ts`, `lint/index.ts`, `wiki/lifecycle.ts` | M28 加成熟度衰减 + 引用追踪 + 三级索引 |
| 个人验收 | `experience/personal-release-audit.ts`, `personal-ga.ts` | M27 接 4 门；M28 仿此写 `team-release-audit` |
| GBrain/AgentMemory | `experience/gbrain-*.ts`, `experience/agentmemory-*.ts` | M27 Gbrain 收口；保持 sidecar 定位 |
| 团队 git | `experience/git-workflow.ts` | M28 团队 commit/push/写锁 |
| bundle | `bundles/fetch.ts`, `build/build.ts` | M29 增加 k8s-incident profile |

---

## 4.5 代码现状基线（实现前必读，防止重造）

实现 AI **必须先读真实代码再动手**。以下是 2026-06-02 实测的"已存在 vs 需新增"清单，避免把"补强"误做成"从零重写"：

**已存在且基本可用（复用/补强，不要重写）**：
- `praxisbase personal release-audit` 命令 + `experience/personal-release-audit.ts`：已产出 `personal_ga`/`wiki_context_ga`/`skill_compiler_ga`/`gbrain_runtime_ga`/`gates`/`blocking_reasons`/`ok`，已区分 `full_run`/`bounded_smoke`。
- `--mode team-git`：daily/skill/lesson/kb/privacy 命令均已支持。
- GitLab CI 模板 `templates/gitlab/knowledge-repo.gitlab-ci.yml`：已含 daily-harvest/review/promote/build。
- `skill inject-preview`、`kb audit`、`kb prune`：命令已存在。
- `adapter/sre-autopilot.ts::adaptDirectionResult`：已产出合法 `IncidentEpisode`(+可选 `Proposal`)。
- `kb/maintenance.ts`：已有 `auditKb`/`pruneKb` + 删除时 `removeLinksToDeletedPages` 级联清理 wikilink。
- 协议类型：`Scope`/`Maturity`/`KnowledgeType`/`IncidentEpisode`/`Proposal` 已定义（`protocol/types.ts`、`protocol/schemas.ts`）。

**需要新增/扩展（真正的工作量）**：
- `gbrain_runtime_ga` 的 `waived` 状态 + `--waive-gbrain`（M27）。
- `daily run --mode personal --full` 显式 full-queue 入口（M27，需确认是否已有等价 flag）。
- slug 规范化 util + 一次性迁移（M27）。
- `detectOpenClawProblemSignature` 目前只识别 3 个 signature（`claude-auth-expired`/`workspace-lock-stuck`/`node-runtime-missing`）；需改为由 kb frontmatter `signatures:` 驱动并补齐（M28）。
- `repair/context.ts` 的 `SIGNATURE_CONTEXTS` 硬编码 → 改为读真实 `kb/`+`skills/` + 查询预算（M28）。
- 引用追踪回写、自动成熟度晋升/衰减引擎、三级渐进索引（M28，schema 字段已预留但未更新）。
- `praxisbase team release-audit` 命令（M28，仿 personal 版）。
- K8s signature detector、`k8s-incident` bundle profile、k8s seed pack（M29）。

> 任何与本基线不符的下游措辞（如某文档说"实现 release-audit"），一律以"先读代码、已存在则补强"为准。

---

## 5. 借鉴项目的"用法裁决"（一次性说清，避免再纠结）

| 项目 | 裁决 | 具体借什么 |
| --- | --- | --- |
| Karpathy LLM Wiki（原始 + v2） | **守心智模型** | Ingest/Query/Lint + 复利 wiki + 三层架构。别让"修复闭环"和"wiki 编译器"两条线打架 |
| nashsu/llm_wiki（桌面版） | **只借机制零件** | 两步式 CoT ingest、级联删除清理、4 信号图谱打分。不借桌面壳/Clipper/多格式解析 |
| llm-wiki-compiler (llmwiki CLI) | **主对标 + 直接对照实现** | eval/health-score、claim 级 citation、lint。这是和我们同形态的实现，质量度量直接学 |
| 腾讯 Harness 文章 | **设计验证，不复刻**（无开源代码） | 五层 scope、三成熟度、自动衰减规则、三级渐进索引、查询预算、独立知识仓——用来确认我们方向对，字段我们已预留 |
| SkillClaw（高德 AMAP-ML） | **借思想，自己实现** | post-task skill 演化 loop、跨 agent 去重合并、PRM 质量打分。不引入其常驻 daemon/server |
| AgentMemory | **当 sidecar** | session 级召回，optional，挂了不阻塞 |
| GBrain | **当运行时/接入层** | 检索 + agent MCP 接入。不自建第二个 brain |
| OpenHuman | **借思想** | TokenJuice 压缩、canonicalize、本地可读 Markdown。不碰桌面/OAuth/Memory Tree |

### 5.1 源码级借鉴授权清单（本地有源码，按 license 区分能否拷贝）

本地 `.local-references/` 下有源码，但**能否源码级拷贝取决于 license**。PraxisBase 是 MIT，下表是硬约束：

| 项目 | License | 能否拷源码进本仓库 | 源码级可借的具体模块 | 必须做 |
| --- | --- | --- | --- | --- |
| llm-wiki-compiler (llmwiki) | **MIT** | ✅ 可以 | `src/eval/`（health-score/citation 度量）、`src/linter/`（broken link/orphan/contradiction lint）、`src/compiler/` 的 two-phase compile、`src/context/` 的 context-pack/三级检索 | 保留版权头 + 在 NOTICE/README 注明来源 |
| SkillClaw (高德 AMAP-ML) | **MIT** | ✅ 可以 | `skillclaw/skill_manager.py`、`skill_bundle.py`(skill 演化/合并/去重)、`prm_scorer.py`(PRM 质量打分)、`evolve_server/`(post-task 演化 loop 结构) | 保留版权头 + 注明来源；翻译成 TS 时保留出处注释 |
| nashsu/llm_wiki (桌面版) | **GPL-3.0** | ❌ **不可拷源码** | 仅可**重新实现思想**：两步式 CoT ingest、级联删除、4 信号图谱打分 | 禁止复制其代码片段；只参考行为，自行用 TS 实现 |
| Tencent/WeKnora (微信) | **MIT**（Go 实现） | ❌ 不做源码拷贝 | 思想级借鉴：交互式知识图谱（力导向、节点跳转、按 kind 着色）、Wiki 浏览器树形层级导航、多源连接器抽象（飞书/Notion/RSS 增量同步）、Langfuse 式全链路 trace span、内联 citation popover。其 Wiki Mode（v0.5.0 GA）目标与 PraxisBase kb/+graph 页高度重合 | 只参考行为/设计，自行用 TS 实现；不跨语言拷 Go 代码 |
| GoogleCloudPlatform/knowledge-catalog → **OKF (Open Knowledge Format)** | **Apache-2.0**（Python/TS 示例） | ❌ 不做源码拷贝 | 思想级借鉴：OKF v0.1 是厂商中立的"知识=markdown+YAML frontmatter"格式标准。PraxisBase 的 kb/ 已事实遵循其大部分理念（markdown+frontmatter、type 必填、目录树、git 版本控制、markdown 链接=关系）。已借鉴：① `description` frontmatter 字段（站点 graph tooltip / 稳定知识列表 / search-index 消费）② 渐进式披露理念（index.md / llms.txt）。不照搬其 log.md（git 历史已足够） | 只参考格式思想，自行用 TS 实现；不绑定为"OKF 合规"（标准尚 v0.1 Draft） |
| Karpathy LLM Wiki / v2 | gist（pattern 文档） | n/a（无可拷代码） | 心智模型 | — |
| 腾讯 Harness 文章 | 文章（无开源代码） | n/a | 五层/成熟度/衰减/三级索引设计 | 当设计验证 |
| AgentMemory / GBrain | 外部服务 | n/a（当外部能力调用，不内联） | REST/MCP 接口契约 | 按 adapter 调用，不拷其实现 |

**裁决规则**：
- **MIT 同语言项目（llmwiki、SkillClaw）**：优先源码级借鉴（移植 TS 时保留出处注释 + 更新本仓库 NOTICE）。这两个是和我们最同形态/同目标的，能省最多工。
- **MIT 跨语言项目（WeKnora，Go）**：license 允许拷贝，但语言不同，实质等同思想级借鉴——**只参考行为/设计，自行用 TS 实现**，不在 NOTICE 做源码级登记。WeKnora 与 PraxisBase 重合度最高的是 Wiki Mode（自动 markdown + 知识图谱），其交互式图谱、Wiki 浏览器树形导航、连接器抽象是后续 graph 页 / M30 飞书源 的最佳设计参考。
- **GPL 项目（nashsu）**：**只借思想，禁止拷代码**，避免 GPL 传染污染 MIT 仓库。
- 任何源码级移植必须在 commit message 和文件头注明 `borrowed from <repo> (MIT), see NOTICE`。
- 新建/更新仓库根 `NOTICE` 文件登记所有 MIT 源码级借鉴。

> 回答"是否已借鉴"：截至当前，这些是**思想级借鉴已落进设计**（context-economy 借了 TokenJuice、skill synthesis 借了 SkillClaw 思路、治理借了腾讯），但**尚未做 MIT 项目的源码级移植**。M28（skill 演化借 SkillClaw）和 M27 收尾（kb 质量度量借 llmwiki eval/lint）是源码级借鉴的最佳切入点。WeKnora 作为思想级参考，其交互式知识图谱设计已部分影响 graph 页（SVG 力导向布局），后续 Wiki 浏览器树形导航、连接器抽象可作为 graph 页进化和 M30 的设计输入。


---

## 6. 写作顺序（交给实现 AI 的执行序）

1. **先评审本文件**（anchor）。确认 milestone 序列与门。
2. **写 M27 文档包** → 实现 → `team`/`personal release-audit` 全绿 → 写 status。**M27 不绿不进 M28。**
3. **写 M28 文档包**（design→plan→openspec→bdd→traceability）→ 实现 → `team release-audit` 全绿 → status。
4. **写 M29 文档包** → 实现 → 门全绿 → status。
5. M30 按需。

每一步的契约（spec delta + bdd）必须先于实现存在（R5）。

---

## 7. 成功标准（整体）

整条路线完成的标志：

```text
个人版: personal release-audit 全绿，修复经验闭环可 demo
团队版B: 多 OpenClaw 修复 agent 在 GitLab 上自我进化，skill 被复用
团队版A: 容器排查经验经 sre-autopilot 回流并晋升，bundle 被消费
治理:   被引用知识自动晋升、长期未引用自动衰减、查询有预算、索引分级
借鉴:   GBrain/AgentMemory 各司其职，未重造；SkillClaw/腾讯/llmwiki 思想已落地
```

> 提醒实现 AI：本路线的成败不在"功能多"，而在"闭环真"。宁可少做一个 surface，也要让 P/B/A 三条线各自有一次真实、可复现、可验收的闭环。
