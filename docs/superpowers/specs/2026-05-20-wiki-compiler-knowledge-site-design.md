# PraxisBase Wiki Compiler And Knowledge Site Core Design

日期：2026-05-20

## 文档追踪

- 设计文档：`docs/superpowers/specs/2026-05-20-wiki-compiler-knowledge-site-design.md`
- 实施文档：`docs/superpowers/plans/2026-05-20-wiki-compiler-knowledge-site-implementation-plan.md`
- OpenSpec：`docs/openspec/changes/wiki-compiler-knowledge-site/`
- BDD：`docs/bdd/wiki-compiler-knowledge-site.feature`

这四份文档描述同一个 M7-M11 范围。设计文档回答为什么和怎么分层；实施文档回答按什么文件和测试顺序落地；OpenSpec 是稳定 contract；BDD 是用户可见验收。

## AI Handoff Brief

PraxisBase 已经有多 agent capture、native memory bridge、proposal/review/promote、repair bundle 和基础 build。接下来要补的是真正的 **wiki compiler core**：把 `.praxisbase/`、`kb/`、`skills/` 和 reviewed evidence 编译成可追溯、可检索、可浏览、可给 agent 复用的知识模型和静态站。

实施前先读：

1. 本设计文档。
2. `docs/superpowers/specs/2026-05-17-agent-knowledge-substrate-design.md`
3. `docs/superpowers/specs/2026-05-19-multi-agent-experience-layer-design.md`
4. `docs/openspec/changes/knowledge-governance-phase2/design.md`
5. 当前实现：`packages/core/src/build/`, `packages/core/src/experience/`, `packages/core/src/protocol/`, `packages/core/src/lint/`

硬性边界：

- 不把 raw logs、完整 transcripts、Feishu 原文、tokens、cookies 或密钥写入 Git。
- `wiki compile` 默认不直接写稳定 `kb/`、`skills/` 或 `dist/`；它写 proposal candidates、compile reports 和 compiler state。`wiki build-site` / `praxisbase build` 才写 `dist/`。
- LLM 只能用于 extraction、classification、merge proposal、page draft；确定性 resolver、index、graph、budget 和 lint 必须由代码完成。
- 不绕过现有 proposal/review/promote lane。
- 不自动把 `personal` 经验提升到 `team` 或 `org`。
- 不引入 GUI、向量库、外部数据库、daemon 或 MCP server 作为本阶段前置依赖。
- HTML 生成是静态文件输出，不要求服务端运行时。

## 背景

PraxisBase 的协议层已经跑通：agent 可以拿 context、提交 capture、导入 native memory、生成 proposal candidate，并通过 review/promote 进入稳定知识。现在的问题是：这些对象还没有被编译成一个稳定的 wiki 内核。

当前实现的几个浅层点：

- `buildStaticArtifacts` 主要生成 repair bundle、`kb-index.json`、`search-index.json`、`llms.txt` 和一个 inspection HTML。
- `context get` 只是扫描 `kb/`、`skills/`、`.praxisbase/indexes`、`.praxisbase/bundles`，用字符串包含做排序。
- `distill run` 只把 successful capture 转成 proposal candidate，没有 concept extraction、merge、provenance 或 wiki page draft。
- `dist/index.html` 是检查表，不是可日常阅读和运营的知识站。

用户目标是“内核做稳、做好、做漂亮”。这意味着 PraxisBase 不能只做 session summary，也不能只做 RAG。它需要一个 file-first compiler：稳定协议在 Git 中，LLM 在受控位置参与，产物可重建、可审计、可测试。

## 参考结论

### Karpathy LLM Wiki

采用核心三层：raw sources、wiki、site。关键思想是 stop re-deriving, start compiling。PraxisBase 应吸收“wiki 是 persistent compiled artifact”，但不能照搬“LLM 直接维护 wiki”，因为 PraxisBase 的稳定知识必须走 review/promote。

### LLM Wiki v2

吸收 lifecycle、confidence、supersession、forgetting、typed graph、hybrid retrieval、automation、privacy 和 governance。PraxisBase 已有 scope/maturity/proposal lane，缺的是把这些字段真正用于 compile、retrieval 和 site。

### atomicstrata/llm-wiki-compiler

这是 wiki compiler 内核最强参考：

- source hash 增量检测；
- 两阶段 compile：先 extract concepts，再 generate/merge pages；
- `--review` 生成 candidate，不直接改 wiki；
- deterministic wikilink resolver；
- provenance、citation、contradiction metadata；
- index/MOC 生成；
- markdown 渲染禁 raw HTML，并做 sanitizer allowlist。

PraxisBase 要吸收这些机制，但输出目标应是 `.praxisbase/inbox/proposals/` 和 `dist/`，而不是默认写 `wiki/`。

### Pratiyush/llm-wiki

这是静态站和 AI-readable exports 的主要参考：

- 多页静态 HTML；
- global search / Cmd+K；
- per-page `.txt` 和 `.json` siblings；
- `llms.txt`、`llms-full.txt`、`graph.jsonld`、`sitemap.xml`、`rss.xml`、`robots.txt`、`ai-readme.md`；
- activity、related pages、graph、reading progress；
- confidence、lifecycle、lint、health dashboard。

PraxisBase 第一阶段不需要全量产品化，但 `dist/` 应从 inspection table 升级成真正的 knowledge site。

### nashsu/llm_wiki

吸收这些工程点：

- `purpose.md` 作为知识库方向约束，不只是 schema；
- 两步 ingest：analysis 再 generation；
- CJK bigram + English tokenized search；
- graph expansion；
- source overlap / direct link / common neighbor / type affinity 相关性；
- merge guard：frontmatter locked fields、array union、body shrink threshold；
- LLM output parser 和 unsafe path guard。

PraxisBase 本阶段不引入桌面 app、LanceDB 或 local HTTP API。

### OpenHuman

吸收分层记忆思想：

- 高频 ephemeral 输入、可语义检索文档、graph facts、稳定 profile/materialized output 要分层。
- personal preference 不应自动进入 team wiki。
- profile/knowledge 输出应是 managed block 或 reviewed object，而不是无审核双向同步。

PraxisBase 不复制 OpenHuman 的 SQLite、桌面 UI 或 20 分钟 auto-fetch。

### html-anything

吸收 “Markdown is draft. HTML is what humans read.” 的产品标准：

- 静态 HTML 需要设计 shell 和模板，不是 markdown dump。
- 知识站适合 docs-page + dashboard 风格：左导航、正文、右侧 TOC/provenance rail、搜索、状态仪表板。
- 不做营销 hero；第一屏应该直接呈现知识健康和可操作入口。

## 设计选择

### 推荐方案：File-First Wiki Compiler

新增 `packages/core/src/wiki/` 深模块。它收集协议对象和稳定知识，生成编译候选、检索索引、关系图和静态站。compile 默认只写 proposal candidates、reports 和 compiler state；graph/site/build 命令写 indexes 和 `dist/`；任何路径都不直接改 `kb/` 或 `skills/`。

优势：

- 和现有 Git-backed protocol、proposal/review/promote 完全一致。
- 可测试：collection、hash、resolver、retrieval、render 都能用 fixtures 覆盖。
- 可逐步落地：先做 deterministic model 和 HTML，再加 LLM extraction。
- 不依赖外部服务，适合个人和团队部署。

### 备选方案：Product App First

直接做 web/desktop app、review queue、graph UI、live preview。优势是体验快，风险是会把内核、UI、队列和检索混在一起，提前引入运行时复杂度。本阶段不采用。

### 备选方案：External Compiler Wrapper

把 atomicstrata 风格 compiler 当外部工具包装。优势是快，风险是数据模型和 PraxisBase 的 proposal governance 不一致，后续迁移成本高。本阶段只参考实现，不作为依赖。

## 概念层

PraxisBase 后续应明确四层：

```text
Evidence Layer
  capture records, episodes, native memory summaries, raw-vault refs,
  external log refs, source hashes, redacted summaries

Authority Layer
  reviewed kb objects, skills, reviews, promoted proposals

Compiled Wiki Layer
  wiki sources, wiki pages, claims, citations, links,
  graph, retrieval index, lifecycle reports

Distribution Layer
  repair bundles, agent context bundles, static HTML,
  llms.txt, llms-full.txt, graph.jsonld, per-page txt/json
```

Evidence Layer 是输入，不等于稳定知识。Authority Layer 是 Git 中的真相。Compiled Wiki Layer 是可重建中间模型。Distribution Layer 是给人和 agent 消费的发布物。

## 核心模块

### `wiki/model.ts`

定义 wiki compiler 的内部对象。它不替代现有 protocol schema，而是把不同来源规范化成 compiler 可处理的形态。

关键类型：

```ts
type WikiSourceKind =
  | "stable_kb"
  | "skill"
  | "episode"
  | "capture"
  | "native_memory"
  | "proposal"
  | "review"
  | "external_ref";

interface WikiSource {
  id: string;
  kind: WikiSourceKind;
  path?: string;
  source_ref?: string;
  source_hash: string;
  title: string;
  summary: string;
  body?: string;
  scope: "personal" | "project" | "team" | "global" | "org";
  layer?: "preference" | "convention" | "technical" | "domain" | "project";
  knowledge_type?: string;
  maturity?: string;
  created_at?: string;
  updated_at?: string;
}
```

`body` 只允许来自稳定 `kb/`、`skills/`、safe source summaries 或 explicitly redacted summaries。raw transcript/log body 不进入 Git。

```ts
interface WikiClaim {
  id: string;
  text: string;
  source_ids: string[];
  citations: WikiCitation[];
  confidence: number;
  provenance_state: "extracted" | "merged" | "inferred" | "ambiguous";
}

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  page_kind: "overview" | "concept" | "entity" | "procedure" | "known_fix" | "skill" | "decision" | "pitfall" | "memory";
  scope: string;
  layer?: string;
  knowledge_type?: string;
  maturity: string;
  lifecycle: "draft" | "reviewed" | "verified" | "stale" | "archived";
  source_ids: string[];
  claims: WikiClaim[];
  outbound_links: string[];
  body_markdown: string;
}
```

### `wiki/collect.ts`

Collect 负责把现有文件协议读成 `WikiSource[]`。

输入：

- `kb/**/*.md`
- `skills/**/SKILL.md`
- `.praxisbase/inbox/episodes/*.json`
- `.praxisbase/outbox/captures/*.json`
- `.praxisbase/reports/memory/*.json`
- `.praxisbase/inbox/proposals/*.json`
- `.praxisbase/inbox/reviews/*.json`
- `.praxisbase/raw-vault/refs/*.json`

规则：

- 只读取 allowlisted 目录。
- 路径必须走 `safePath`。
- source hash 必须存在；稳定 Markdown 没有 hash 时，用文件内容 sha256 生成 compiler hash。
- `capture` 和 `native_memory` 默认只使用 `redacted_summary`。
- `personal` source 默认不进入 team/org 页面候选，只进入 personal/project context 和 local site section。

### `wiki/state.ts`

维护 `.praxisbase/wiki/state.json`：

```json
{
  "protocol_version": "0.1",
  "sources": {
    "source_id": {
      "source_hash": "sha256:...",
      "last_compiled_at": "2026-05-20T00:00:00.000Z",
      "candidate_ids": ["..."],
      "page_ids": ["..."]
    }
  }
}
```

状态只用于增量判断，不是权威知识。删除 state 后能全量重建。

### `wiki/compile.ts`

核心 pipeline：

```text
collect sources
  -> detect changed hashes
  -> classify / extract candidates
  -> merge with existing stable pages
  -> validate provenance and citations
  -> write proposal candidates
  -> write compile report
  -> update wiki state only for emitted candidates
```

第一版应支持 two modes：

- `--review` 默认：写 `.praxisbase/inbox/proposals/*.json`，不改 `kb/`、`skills/`。
- `--dry-run`：只写 `.praxisbase/reports/wiki-compile/*.json`。

后续可以加 `--materialize-reviewed`，但它也只能调用现有 promote path，不能绕过 review。

LLM 参与点：

- extraction：从 changed source 产出 structured concepts / claims / proposed page kind。
- page draft：为 proposal patch 生成 Markdown 内容。
- merge proposal：当目标页面已存在时，生成 patch draft。

确定性 guard：

- frontmatter locked fields：`id`、`type`、`knowledge_type`、`scope`、`created_at`。
- array union fields：`source_refs`、`source_hashes`、`signatures`、`skills`、`supersedes`、`tags`。
- body shrink threshold：LLM merge body 不得短于 old/new 较长正文的 70%，除非 action 是 explicit archive。
- unsafe path reject：proposal patch path 只能在 stable knowledge allowlist 内。
- raw content reject：复用 `appearsToBeRawLog`，并扩展 token/cookie/secret lint。

### `wiki/resolver.ts`

确定性解析：

- 从 compiled pages 和 stable kb title/frontmatter 建 title index。
- 支持 `[[slug]]`、`[[slug|label]]`、plain title mention 的 candidate link。
- 不在 code fence、inline code、citation marker 内插入或解析 link。
- 生成 backlinks、broken links、orphans、duplicate slugs。

Resolver 不调用 LLM。它产出 `WikiGraph` 和 lint findings。

### `wiki/retrieval.ts`

替换当前 `experience/context.ts` 的浅排序逻辑，但先保持 CLI response contract 不变。

检索信号：

1. exact signature / object id / path match；
2. English token + CJK bigram keyword match；
3. maturity：`proven > verified > draft > stale > archived`；
4. scope preference：默认 `project > team > global > personal`，personal 不自动外泄；
5. graph expansion：direct links、source overlap、common neighbor、type affinity；
6. recency/reference count；
7. stage bias：diagnosis 偏 known_fix/pitfall，repair 偏 skill/procedure，verification 偏 verification/rollback，proposal 偏 similar objects/reviews/evidence contract。

输出仍是：

- `items`
- `citations`
- `warnings`
- `truncated`
- `budget`

预算策略：

- 超预算先降级 body 为 summary；
- 再保留 citations；
- 最后保留 top paths 和 warning；
- 不因为 context 缺失阻断 agent 启动。

### `wiki/render-site.ts`

生成 `dist/` 下的静态知识站和 AI-readable exports。

最低产物：

```text
dist/
  index.html
  pages/<slug>.html
  pages/<slug>.txt
  pages/<slug>.json
  search-index.json
  graph.json
  graph.jsonld
  llms.txt
  llms-full.txt
  ai-readme.md
  sitemap.xml
  robots.txt
  style.css
  site.js
```

现有 repair bundle 仍保留：

```text
dist/repair-bundles/...
```

HTML shell：

- 首页是 Knowledge Health Dashboard：对象数、候选数、stale/duplicate/broken-link、recent sources、top signatures、bundle status。
- 页面视图是三栏：左侧知识树，中间正文，右侧 TOC + provenance + related pages。
- 全局搜索支持 `/` 和 Cmd/Ctrl+K。
- 每页显示 scope、layer、knowledge_type、maturity、confidence、sources、last updated。
- 相关页面来自 graph relevance。
- 移动端收敛为 top search + content + collapsible metadata。
- 不做营销 hero，不做装饰性视觉。

安全：

- Markdown 渲染禁 raw HTML，或者严格 sanitizer allowlist。
- 所有 HTML 字符串 escape。
- JSON 嵌入时转义 `</script`。
- 本阶段不生成 local editor deep links。

### `wiki/lint.ts`

现有 `lint` 继续负责 stable knowledge governance。新增 wiki lint 负责 compiled graph/site 健康：

- missing source hash；
- missing citation for high-confidence claim；
- broken wikilink；
- orphan active page；
- duplicate slug/title/id；
- stale page active in bundle；
- personal source included in team/org page candidate；
- unsafe patch path；
- body shrink violation；
- raw-log-like content in candidate。

Lint 输出到：

```text
.praxisbase/reports/wiki-lint/*.json
.praxisbase/exceptions/human-required/*.json
.praxisbase/exceptions/conflicts/*.json
```

## CLI 入口

本阶段新增命令建议：

```bash
praxisbase wiki compile --review --json
praxisbase wiki compile --dry-run --json
praxisbase wiki graph --json
praxisbase wiki build-site --json
```

并让现有：

```bash
praxisbase build
```

成为 umbrella build：

```text
repair bundles
  + kb/search indexes
  + wiki graph
  + knowledge site
  + llms exports
```

兼容要求：

- 现有 `praxisbase build` 测试继续通过。
- 现有 `dist/repair-bundles/*` 路径不变。
- 现有 `dist/kb-index.json` 和 `dist/search-index.json` 可扩展字段，但不删除 `protocol_version` 和基础结构。

## 数据流

### Capture 到 Wiki Candidate

```text
agent run
  -> capture finish / watch
  -> .praxisbase/outbox/captures/*.json
  -> wiki collect
  -> source hash diff
  -> extraction/page candidate
  -> .praxisbase/inbox/proposals/*.json
  -> review/promote
  -> kb/ or skills/
  -> build
  -> dist site/context/bundles
```

### Stable Knowledge 到 Site

```text
kb/ + skills/
  -> collect stable sources
  -> parse frontmatter/body
  -> compiled WikiPage
  -> resolver graph
  -> search index
  -> static HTML + AI siblings
```

### Context Retrieval

```text
context request
  -> compiled indexes if present
  -> fallback collect stable sources if index missing
  -> token search
  -> graph expansion
  -> stage-aware rank
  -> budgeted response with citations
```

## M7-M11 Implementation Shape

### M7: Wiki Object Model And Collector

Deliverables:

- `packages/core/src/wiki/model.ts`
- `packages/core/src/wiki/collect.ts`
- `.praxisbase/wiki/state.json` schema helpers
- tests for stable kb, skills, captures, memory reports, scope handling, raw summary only

Acceptance:

- Collector returns deterministic `WikiSource[]`.
- Personal capture does not become shared source.
- Unsafe paths and raw artifacts are rejected.
- No stable knowledge is mutated.

### M8: Compile Candidates

Deliverables:

- `wiki compile --review --json`
- source hash diff
- deterministic candidate writer
- merge guards
- compile reports

Acceptance:

- Changed captures create proposal candidates.
- Unchanged sources are skipped.
- Candidate patch path is stable allowlist only.
- Failed privacy/provenance checks create exceptions, not stable writes.

### M9: Graph And Retrieval

Deliverables:

- deterministic resolver
- graph JSON
- CJK + English tokenizer
- stage-aware retrieval replacing shallow scan in `context get`

Acceptance:

- Exact signature wins.
- CJK query can match Chinese titles/summaries.
- Graph-related objects appear after seed match.
- Budget truncation preserves citations.

### M10: Knowledge Site

Deliverables:

- multi-page `dist/` site
- polished dashboard + page shell
- `pages/*.html`, `.txt`, `.json`
- `llms-full.txt`, `graph.jsonld`, `ai-readme.md`, `sitemap.xml`, `robots.txt`
- search UI

Acceptance:

- `praxisbase build` produces current bundle outputs plus knowledge site.
- HTML is responsive and readable.
- Search works without a server.
- Page JSON and TXT siblings match the HTML source page.

### M11: Provenance, Lifecycle, And Health

Deliverables:

- wiki lint report
- confidence/lifecycle calculation from source count, maturity, recency, references, links
- stale/duplicate/broken-link health dashboard
- proposal candidates for maturity/stale changes when appropriate

Acceptance:

- Health dashboard exposes actionable issues.
- Lint blocks unsafe candidates.
- Lifecycle outputs are proposal-based.
- `pnpm check` passes.

## OpenCode / Parallel Work Split

When implementation starts, split work by disjoint write ownership:

- Codex main: architecture integration, CLI contracts, final review, tests, commits.
- OpenCode worker A: `packages/core/src/wiki/model.ts`, `collect.ts`, collector tests.
- OpenCode worker B: `wiki/resolver.ts`, graph JSON, retrieval tokenizer tests.
- OpenCode worker C: `wiki/render-site.ts`, `build/html.ts`, static assets and HTML tests.
- OpenCode worker D: CLI command wiring and BDD/README docs.

Workers must not revert each other's edits. Each worker owns its files and reports changed paths.

## Testing Strategy

Core tests:

- collector fixtures for `kb`, `skills`, captures, memory reports, proposals;
- source hash diff and state update;
- candidate path safety;
- merge guard shrink rejection;
- resolver ignores code fences and citations;
- CJK tokenizer and English tokenizer;
- graph expansion ordering;
- context budget truncation;
- HTML escaping and `</script` JSON escaping;
- AI export generation.

CLI tests:

- `praxisbase wiki compile --dry-run --json`
- `praxisbase wiki compile --review --json`
- `praxisbase wiki graph --json`
- `praxisbase build` compatibility

End-to-end fixture:

```text
init workspace
capture finish
wiki compile --review
review/promote a candidate
build
context get
verify dist site + llms exports + repair bundles
```

Verification before completion:

```bash
pnpm check
git diff --check
```

## Failure Modes

- Missing `.praxisbase/wiki/state.json`: full rebuild, no hard failure.
- Malformed source: skip source, report warning and compile report error.
- Privacy uncertainty: human-required exception.
- LLM output malformed: reject candidate, write report, do not update source compiled state.
- Candidate unsafe path: reject and write failed-check exception.
- Site render failure for one page: write report and continue other pages when possible; `build` exits failed only if core indexes/bundles cannot be written.
- Search index missing: `context get` falls back to stable source collection.

## Non-Goals

- No GUI or desktop app in this phase.
- No vector DB, LanceDB, SQLite, local HTTP API, daemon, or MCP server.
- No direct stable mutation from compile/distill/capture/memory.
- No raw transcript/log body committed to Git.
- No live bidirectional sync with OpenHuman/Hermes/native memories.
- No automatic personal-to-team promotion.

## Success Criteria

PraxisBase is on the right path when:

- a fresh agent can ask for context and receive ranked, cited, stage-aware knowledge;
- a completed agent run can become a reviewable wiki/skill proposal without touching stable knowledge;
- promoted knowledge appears in a polished static knowledge site and AI-readable exports;
- humans can inspect provenance, maturity, related pages, stale objects, and health issues from `dist/`;
- deleting `dist/` and `.praxisbase/wiki/state.json` allows deterministic regeneration from Git-backed inputs;
- all stable changes remain reviewable, auditable, and reversible through existing lanes.
