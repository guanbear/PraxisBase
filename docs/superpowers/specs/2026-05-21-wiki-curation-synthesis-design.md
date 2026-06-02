# Wiki Curation Synthesis Design

日期：2026-05-21

## 文档追踪

- 设计文档：`docs/superpowers/specs/2026-05-21-wiki-curation-synthesis-design.md`
- 实施文档：`docs/superpowers/plans/2026-05-21-wiki-curation-synthesis-implementation-plan.md`
- OpenSpec：`docs/openspec/changes/wiki-curation-synthesis/`
- BDD：`docs/bdd/wiki-curation-synthesis.feature`

本变更补的是 PraxisBase wiki 内核最关键的一层：**raw evidence 到 stable wiki 之间的 curation/synthesis 层**。它不是 UI 微调，也不是再多生成一些 proposal。它要保证系统按 llm-wiki 的原始目标工作：原始材料只是证据，AI 和编译器负责合成 wiki，人只审核少量高质量候选，promotion 后才进入稳定 `kb/` 和 `skills/`。

## 背景

当前已有模块能采集 Codex、OpenClaw、远端 OpenClaw 和团队日志，能执行 AI distill，能写 proposal candidate，也能生成 HTML。问题是 review 面向人的对象仍然太接近 raw backlog：

- 一条 capture、session、memory 或 summary 容易变成一条候选。
- 候选之间去重和聚类不足，重复经验会堆积成人工待办。
- session metadata、agent instruction、unknown source、空 promotion log 等运维噪声仍可能靠近 review 队列。
- 候选正文像摘要或日志剪影，不像稳定 wiki 页面。
- HTML 暴露的是队列健康和页面清单，但还没有稳定表达“这些是可复用经验”。

这会导致用户看到几十条 human required，却看不到几条真正值得 promote 的 wiki 页面。它不符合 LLM Wiki 的核心设定。

## 参考结论

### nashsu / Karpathy LLM Wiki

核心是 `raw sources -> wiki -> site`。raw 是材料，wiki 是持久化合成产物，site 是人读的发布层。PraxisBase 要保留 Git/review/promote 边界，但必须吸收“不要反复读 raw，应该持续编译 wiki”的原则。

### nvk llm-wiki P0/P1

关键规则：

- Raw is immutable。
- Articles are synthesized, not copied。
- Inventory/candidates 是运营跟踪对象，不是事实证据。
- P0 字段要支撑 lifecycle、confidence、scope、reference_count、supersession。
- P1 要有 exception queue、run records、pitfall、promotion 安全边界、compact bundle。

PraxisBase 的 correction 是：`.praxisbase/outbox`、`.praxisbase/reports`、`.praxisbase/raw-vault refs` 都属于 evidence/inventory；review 默认不能直接展示这些对象，而要展示合成后的 proposal。

### atomicstrata llm-wiki-compiler

可借鉴的工程点：

- source hash 增量检测；
- concept extraction 和 page generation 分阶段；
- review candidates 不直接改 wiki；
- candidates 带 provenance metadata；
- lint 和 resolver 是 deterministic；
- CLI 有 review/promote 子命令。

PraxisBase 要把这些机制接到现有 proposal lane，而不是新增另一套 wiki mutation 路径。

### Pratiyush llm-wiki

值得吸收的是静态站输出标准：source page、entity/concept page、overview/index/log、confidence/lifecycle、多种 agent-readable sibling。PraxisBase 的 HTML 应该默认呈现 curated wiki 页面、provenance、related pages 和 action queue，而不是 raw capture 列表。

### LLM Wiki v2 gist

必须吸收：

- lifecycle、confidence、supersession、forgetting；
- typed graph 和 hybrid retrieval；
- automation with human curation；
- privacy/governance；
- crystallization：重复经验沉淀为稳定页面或 skill。

## 定位

新增 `wiki curate` 作为 compile 和 review/promote 之间的核心步骤。

```text
raw evidence
  -> bounded chunk + privacy precheck
  -> AI distill
  -> evidence pool
  -> deterministic filter
  -> cluster / dedupe
  -> AI curator / page synthesis
  -> deterministic guards
  -> curated proposal queue
  -> review / promote
  -> kb / skills
  -> site / context / bundles
```

`wiki compile` 继续负责 collection、source analysis、state、low-level candidate/report 兼容。`wiki curate` 负责把 evidence pool 和 raw candidates 合成少量可审核 wiki proposals。

日常生产路径应变成：

```bash
praxisbase daily run --mode personal --build-site --json
```

内部执行：

```text
harvest -> ai distill -> wiki compile -> wiki curate -> build-site
```

如果 AI 未配置，生产路径必须失败或显式 degraded；不能假装 raw summary 就是高质量 wiki。

## 分层模型

### Evidence

Evidence 是输入，不是知识。

来源包括：

- `.praxisbase/outbox/captures/*.json`
- `.praxisbase/inbox/episodes/*.json`
- `.praxisbase/reports/memory/*.json`
- `.praxisbase/raw-vault/refs/*.json`
- AI `DistilledExperience`
- 外部日志摘要和远端 OpenClaw export refs

Evidence 可以用于 provenance，但不能直接作为默认 review 页面。

### Evidence Pool

Evidence pool 是可合成材料。它只包含安全摘要、结构化字段、source refs、hashes、scope、agent、timestamps 和提取出的 signatures。

噪声必须在这里被挡住：

- `session_meta`；
- base instructions / system prompt；
- `openclaw:unknown`；
- 空 promotion log；
- 没有 problem/action/outcome/reusable lesson 的 telemetry；
- secret、credential、auth header、cookie、token 相关内容；
- team mode 下的 personal/private material。

### Evidence Cluster

Cluster 是编译器认为“应该合成成同一页或同一组页面”的证据集合。

聚类信号：

- exact signature；
- normalized title；
- proposed target path；
- source overlap；
- distilled problem/action/outcome similarity；
- same agent/source family；
- existing stable page backlinks；
- explicit supersedes/superseded_by。

Cluster 不是最终页面。它是 AI curator 的输入。

### Curated Proposal

Curated proposal 是人 review 的默认对象。它必须像一篇 wiki draft，而不是一条日志。

它必须包含：

- target path，例如 `kb/known-fixes/openclaw-auth-expired.md`；
- page kind，例如 `known_fix`、`procedure`、`pitfall`、`decision`、`skill`；
- title、summary、body markdown；
- problem / context / applicability；
- actions / failed attempts / verification；
- risks / rollback；
- source_refs、source_hashes、source_count；
- confidence、maturity、scope；
- provenance section；
- why this proposal exists；
- deterministic guard verdict。

review/promote 的稳定写入路径不变。

## 数据模型

### `WikiEvidenceItem`

```ts
interface WikiEvidenceItem {
  id: string;
  kind: "capture" | "episode" | "native_memory" | "distilled_experience" | "proposal_candidate" | "external_ref";
  source_ref: string;
  source_hash: string;
  agent?: "codex" | "openclaw" | "claude-code" | "opencode" | "generic";
  scope: "personal" | "project" | "team" | "org" | "global";
  title: string;
  summary: string;
  problem?: string;
  context?: string;
  actions: string[];
  failed_attempts: string[];
  outcome?: "success" | "failed" | "partial" | "unknown";
  verification: string[];
  reusable_lessons: string[];
  signatures: string[];
  suggested_wiki_kind?: "known_fix" | "procedure" | "decision" | "pitfall" | "preference" | "incident" | "note" | "skill";
  privacy_verdict: "safe" | "personal_only" | "team_allowed" | "human_required" | "reject";
  created_at?: string;
}
```

### `WikiEvidenceCluster`

```ts
interface WikiEvidenceCluster {
  id: string;
  cluster_key: string;
  target_path_hint?: string;
  normalized_title: string;
  page_kind: "known_fix" | "procedure" | "decision" | "pitfall" | "preference" | "incident" | "note" | "skill";
  scope: "personal" | "project" | "team" | "org" | "global";
  evidence_ids: string[];
  source_refs: string[];
  source_hashes: string[];
  source_count: number;
  signatures: string[];
  confidence_hint: number;
  reasons: string[];
  conflicts: Array<{ field: string; values: string[]; evidence_ids: string[] }>;
}
```

### `CuratedWikiProposal`

```ts
interface CuratedWikiProposal {
  id: string;
  protocol_version: "0.1";
  type: "wiki_curated_proposal";
  target_path: string;
  action: "create" | "update" | "supersede" | "archive" | "skill_create" | "skill_update";
  page_kind: "known_fix" | "procedure" | "decision" | "pitfall" | "preference" | "incident" | "note" | "skill";
  scope: "personal" | "project" | "team" | "org" | "global";
  title: string;
  summary: string;
  body_markdown: string;
  source_refs: string[];
  source_hashes: string[];
  source_count: number;
  evidence_ids: string[];
  confidence: number;
  maturity: "draft" | "reviewed" | "proven" | "deprecated";
  provenance: Array<{ source_ref: string; source_hash: string; excerpt?: string }>;
  review_hint: {
    why_review: string;
    suggested_decision: "approve" | "edit" | "reject" | "split" | "merge";
    risk_notes: string[];
  };
  guards: Array<{ id: string; ok: boolean; message: string }>;
  created_at: string;
}
```

### `WikiCurationReport`

```ts
interface WikiCurationReport {
  id: string;
  protocol_version: "0.1";
  type: "wiki_curation_report";
  created_at: string;
  mode: "dry_run" | "review";
  ai: { configured: boolean; mode: "production" | "degraded"; model?: string };
  input_counts: {
    evidence_items: number;
    filtered_noise: number;
    human_required: number;
    rejected: number;
    clusters: number;
  };
  output_counts: {
    curated_proposals: number;
    written_proposals: number;
    conflicts: number;
  };
  proposals: Array<{ id: string; target_path: string; title: string; source_count: number; confidence: number }>;
  warnings: string[];
}
```

## CLI Contract

新增：

```bash
praxisbase wiki curate --dry-run --json
praxisbase wiki curate --review --json
praxisbase wiki curate --review --min-source-count 2 --json
praxisbase wiki curate --review --degraded --json
```

规则：

- `--dry-run` 只写 `.praxisbase/reports/wiki-curation/<report-id>.json`。
- `--review` 写 curated proposals 到 `.praxisbase/inbox/proposals/`。
- 默认 production curation 需要 AI 配置。
- `--degraded` 可以显式生成低置信度候选，但 report 必须写 warning。
- `--min-source-count` 用于只生成多来源支持的 curated proposals。
- 命令不得修改 `kb/`、`skills/` 或 `dist/`。

personal/team scope 不通过 `wiki curate` 的临时开关放行；它由 daily/harvest authority mode、privacy gate 和 review policy 统一控制，避免团队模式误收个人材料。

`praxisbase daily run --build-site` 在 AI configured 时默认执行 curate；`wiki build-site` 默认读取 stable pages 和 curated proposal queue 的摘要，不把 raw backlog 当主页面。

## Review And HTML

### Auto Review Policy

个人模式不能要求所有 proposal 都人工 review。PraxisBase 应把 review 分成两件事：

1. **review verdict**：系统用 deterministic guards + AI reviewer 判断 proposal 是否低风险、证据是否足够、是否需要人处理。
2. **promotion decision**：是否把 approved proposal 写进稳定 `kb/` 或 `skills/`。

推荐默认策略：

```json
{
  "mode": "personal",
  "auto_review": true,
  "auto_promote": "low_risk_personal_only",
  "require_human_for": [
    "secret_or_privacy_risk",
    "scope_escalation",
    "team_or_org_target",
    "updates_existing_stable_page",
    "low_confidence",
    "conflicting_evidence",
    "skill_or_policy_target",
    "destructive_or_archive_action"
  ],
  "min_confidence": 0.82,
  "min_source_count_for_auto_promote": 1
}
```

个人模式默认行为：

- safe personal/project `known_fix`、`procedure`、`pitfall`、`note` 可以自动 review，并可自动 promote；
- 第一次 bootstrap 可以用 `--no-auto-promote` 只生成 curated queue；
- 低置信度、隐私不确定、跨 scope、团队目标、修改已有稳定页、skill/policy proposal 进入 human-required；
- 自动 promote 后仍然写 review record 和 run record，页面 frontmatter 保留 provenance；
- 用户可以用配置关闭自动 promote，只保留自动 review。

团队模式默认行为：

- `auto_review` 可以开启，用于分类、打分、减少队列噪声；
- `auto_promote` 默认关闭；
- 只有团队显式配置允许，并且 CI/GitLab protected branch gate 通过时，才能自动 promote 低风险 team proposal；
- personal/private evidence 永远不能自动进入 team proposal。

配置位置：

```text
.praxisbase/review-policy.json
```

CLI：

```bash
praxisbase review auto --json
praxisbase review auto --promote-approved --json
praxisbase review policy init --mode personal --json
praxisbase review policy init --mode team --json
```

`daily run --mode personal` 在 AI configured 且 policy 允许时可以执行：

```text
curate -> review auto -> promote approved low-risk personal -> build-site
```

这条路径解决个人版“每天收集整理经验并共享给本机 agent”的目标；团队版仍然保留显式审批和 GitLab gate。

### Review 默认视角

Review UI 和 CLI 默认展示：

1. curated proposal queue；
2. conflicts；
3. human-required exceptions；
4. raw evidence pool stats；
5. raw candidates debug view。

人应该能直接看到“3 条需要确认的 wiki 候选”，而不是点进来变成几十条 raw source。

每个 curated proposal 页面需要展示：

- 建议 title 和 target path；
- wiki 正文预览；
- source count 和来源列表；
- evidence cluster reason；
- risk/guard findings；
- approve/edit/reject/split/merge 操作。

### Promote

Promote 后：

- `kb/**/*.md` 或 `skills/**/SKILL.md` 写入稳定对象；
- frontmatter 保留 source refs/hashes、maturity、knowledge_type、scope、reference_count；
- site/context/build 从 stable object 读取；
- raw evidence 不进入 stable body。

## Privacy

### Personal Mode

个人模式可以宽松，但不是无边界：

- raw transcript 可以留在本机 ignored `.praxisbase`；
- 安全 AI summary 可以作为 personal evidence；
- curated proposal 默认 target scope 是 personal/project；
- personal proposal 不会自动进入 team/org；
- secret、credential、cookie、token 仍然必须进入 human-required 或 reject。

### Team Mode

团队模式必须严格：

- personal scope、私聊、个人偏好、用户本机路径、个人 token 线索不能进入团队 proposal；
- GitLab/team repo 是 authority；
- Feishu/OpenClaw/Claude Code 日志只是 source adapters；
- AI 不能越过 team gate；
- curation report 必须记录 rejected personal counts。

## Acceptance

- 50 条重复/噪声 evidence 不能默认变成 50 条 human review items。
- session metadata、base instructions、`openclaw:unknown`、空 promotion log 不生成 curated proposal。
- 多条同类成功经验会合成少量 proposals，并保留多个 source refs/hashes。
- review 首页数字和点进去的 curated proposal 数量一致。
- promoted 页面能被 HTML、context get 和 agent Skill 读取。
- production daily 没有 AI 时不声称生成可用 wiki。
- team mode 不允许 personal material 进入 team curated proposal。
- raw evidence 可以被追溯，但不作为默认人审对象。

## Non-Goals

- 不做独立数据库、向量库或 daemon。
- 不让 AI 直接修改 `kb/` 或 `skills/`。
- 不取消现有 proposal/review/promote。
- 不把所有 raw logs 放进 Git。
- 不把 WeKnora、OpenHuman 或任意 llm-wiki 项目作为运行时依赖。
- 不在本变更实现完整 MCP；Skill+CLI 仍是默认 agent 接入方式。
