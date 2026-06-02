# M27 Personal GA Freeze — OpenSpec Design

See the full design rationale in `docs/superpowers/specs/2026-06-02-m27-personal-ga-freeze-design.md`. This file records the implementation-facing decisions for the change.

## Decisions

### D1. Release audit is read-only by default

`personal release-audit` reads the latest reports under `.praxisbase/reports/{daily,lessons,skill-synthesis,skill-validation,gbrain-export,context}` and stable files under `kb/` and `skills/`. It MUST NOT rerun AI distill or skill synthesis by default. A `--refresh` flag MAY rerun cheap deterministic checks (leak scan, kb audit, inject-preview) but never paid AI extraction.

### D2. Gate composition

```text
personal_ga = wiki_context_ga == pass
           AND skill_compiler_ga == pass
           AND gbrain_runtime_ga in { pass, waived }
```

`gbrain_runtime_ga`:
- `pass`: GBrain configured + doctor healthy + publish evidence + `context get --with-gbrain` retrieval evidence.
- `waived`: GBrain not configured, or `--waive-gbrain` set, or doctor unhealthy AND user waived. Audit records `gbrain_waived: true` + reason.
- `fail`: GBrain configured + not waived + publish/retrieval missing.

### D3. Full queue vs bounded smoke

`queue.run_kind` is `full_run` only when every high-priority chunk has a current source-item ledger entry and there are no high-priority `skipped`/unresolved `failed` entries. Otherwise `bounded_smoke`. `wiki_context_ga=pass` requires `run_kind=full_run` OR an explicit external blocker per remaining item.

### D4. remaining_high_priority_items source of truth

Computed from current source chunks joined with `source-item-ledger.ts` entries. Never derived from `--max-ai-chunks` alone.

### D5. Provenance leak guard (B1)

`promotionTimeGuard` (in `wiki/promotion-quality.ts`) rejects any stable object whose `sources[].uri` / `source_refs[]` match: `memory/dreaming/`, `.dreams`, `dream-diary`, `session-corpus`, or a body containing raw `Candidate:` transcript markers. `kb audit` surfaces violations; `kb prune --yes` removes offending pages and cleans `[[wikilinks]]` via existing `removeLinksToDeletedPages`.

### D6. Slug normalization (B2)

A single slug util produces kebab-case, length-capped (<= 80 chars) slugs from titles. All promotion paths (wiki promote, skill promote) call it. Full human title is stored in frontmatter `title`. A one-time migration renames existing over-long kb/skill filenames and updates inbound `[[wikilinks]]`.

## Affected Modules

- `experience/personal-release-audit.ts` (gate evaluation)
- `experience/personal-ga.ts` (run_kind, queue report)
- `experience/source-item-ledger.ts` (remaining computation)
- `synthesis/skill-*.ts` (promote >=1, audit)
- `wiki/promotion-quality.ts`, `kb/maintenance.ts` (B1)
- `protocol/slug.ts` (new, B2) + callers in `wiki/*` and `synthesis/skill.ts`
- `cli/src/commands/personal.ts`, `cli/src/commands/kb.ts` (wiring)

## Test Matrix

- audit gate classification: each gate pass/fail/waived + combined.
- full vs bounded queue classification.
- remaining-high-priority from ledger.
- skill promote + inject-preview non-empty.
- B1 guard rejects dreaming/corpus provenance.
- B2 slug normalization + migration + wikilink fix.
- leak scan over stable output.

## B1/B2 实现护栏（必须遵守，防止误删/断链）

实现 B1/B2 时容易踩的 3 个坑，先钉死：

### G1. 混合 provenance 的页面要"剥离脏来源"，不是整页删除

`pruneKb` 当前对任何 finding **整文件删除**。但部分脏页是**有价值 + 混合来源**：例如 `openclaw-dispatch-routing-failures.md` 同时含 `log://openclaw/...stability-report`（有效）和多条 `memory/dreaming/*`（脏）。

规则：
- 页面 provenance **全部**是 dreaming/corpus → 可 archive/删除。
- 页面 provenance **混合**（有 ≥1 个有效 log/raw-vault 来源）→ **只剥离 dreaming/corpus 条目**（frontmatter `sources`/`source_refs`/`source_hashes` + 正文 Provenance 段），保留页面与有效来源，必要时重新晋升刷新 `source_count`。
- 不得因为含 1 条 dreaming 就删掉整个有价值 known_fix/skill。
- `kb prune --yes` 的"整删"语义只用于全脏页；混合页用"strip + re-promote"路径。

### G2. B2 改名是"重指向 wikilink"，不是"解除链接"

`removeLinksToDeletedPages` 是**解除**链接（用于删除场景）。B2 是**重命名**,需要把旧 slug 的 `[[old-slug]]` / `[[old-slug|label]]` **重指向**到新 slug,而**不是**解除。

规则：
- B2 迁移必须新增/使用"repoint"逻辑（旧 slug → 新 slug 改写），禁止复用 `removeLinksToDeletedPages`（那会把链接变成纯文本，造成孤儿）。
- 同步更新：frontmatter `id`、`related_wiki_paths`、`dist/graph.json` 节点 id、GBrain export 的 `praxisbase_path`。改名后需重跑 build + GBrain export 验证无 broken links。

### G3. slug 碰撞处理

两个长标题规范化后可能撞同一个 ≤80 字符前缀。slug util 必须检测碰撞并加确定性后缀（如 `-2`、或短 hash），保证唯一且可复现。

### 收尾后的真实验收（B1/B2 都要过）

- `kb audit --json`：真实 0 dreaming/corpus provenance（含混合页已剥离）。
- `personal release-audit --json`：四门仍全绿。
- build + GBrain export：0 broken links / orphans / duplicates；改名页的 GBrain path 已更新。
- `pnpm check`：全过。
