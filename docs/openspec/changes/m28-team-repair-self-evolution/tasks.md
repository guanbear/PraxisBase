# M28 Team Repair Self-Evolution Tasks

## 0. 实现前必读（硬约束，违反即停）

> 这些约束在 anchor、design、`agent-skill-synthesis-governance` 里已定义。即使聊天上下文丢失，开工前也必须遵守。

1. **顺序（R5）**：每个阶段**先冻结契约**（spec delta + bdd fixture，episode/proposal JSON 样例进 `tests/fixtures/`）**再写实现**。阶段 1 先把 `detectOpenClawProblemSignature` 改为由 kb frontmatter `signatures:` 驱动，禁止继续硬编码。
2. **治理底座安全边界（别做过头）**：
   - 引用追踪 / 成熟度晋升 / 衰减的阈值**必须进 `policies/` 可配置**，禁止硬编码。
   - 衰减**只移出活跃索引、不删内容**；一次引用即恢复成熟度。
   - 团队 skill **禁止自动晋升**，必须人工 / Git review。
   - 查询预算截断按 maturity（proven>verified>draft）+ `reference_count` 排序，**proven 优先保留**。
3. **隐私边界 + 源码级借鉴授权**：
   - `personal` scope 不入 `team` 稳定知识；凭据 / 私有 host/account/chat 在 proposal 生成前硬拦截。
   - 阶段 5 skill 去重合并若**源码级借鉴 SkillClaw（MIT）**，必须保留出处注释 + 更新仓库 `NOTICE`；**GPL 的 nashsu/llm_wiki 只能借思想，禁止拷代码**。
4. **真实验收（不许用 mock 糊弄五门）**：五门全绿必须建立在**一次真实跑通的完整闭环**上：`repair-context → episode submit → propose → review --auto → promote --auto → skill synthesize → build → team release-audit`。写 `docs/status/m28-team-repair-self-evolution-<date>.md`，`pnpm check` 全过。
5. **不漂移（R1）**：M28 五门未全绿前，不开 M29/M30，不加计划外的新 surface；只允许补全本文件列出的能力。复用既有代码（`repair/context.ts`、`review/*`、`promote/*`、`synthesis/skill-*`、`git-workflow.ts`、GitLab 模板），`team release-audit` 仿 `personal-release-audit.ts` 新增。

## 1. repair-context Real Knowledge + Budget

- [ ] Extend `detectOpenClawProblemSignature` / `OPENCLAW_SIGNATURES` (currently only 3 signatures) and drive signature↔known-fix mapping from kb frontmatter `signatures:` instead of hardcoding.
- [ ] Replace hardcoded `SIGNATURE_CONTEXTS` with signature-based lookup over `kb/known-fixes|procedures|pitfalls` and `skills/openclaw`.
- [ ] Add query budget (byte cap in `policies/`); order by maturity (proven>verified>draft) then `reference_count` desc; mark `truncated` when capped.
- [ ] Fall back to last-known-good cache on missing/invalid bundle.
- [ ] Tests: signature hit returns real objects; budget truncation; cache fallback.

## 2. Team Episode/Proposal Channel

- [ ] Write `.praxisbase/outbox/{episodes,proposals}` with idempotency dedupe + sync to inbox.
- [ ] Restricted bot token / submission gateway path for sandbox agents.
- [ ] Tests: outbox retry idempotency; inbox validation preserves source_refs/knowledge_references.

## 3. Team Review/Promote Risk Tiers

- [ ] Low/medium auto-merge with provenance + confidence + check + verification/rollback gates.
- [ ] High risk routes to `exceptions/human-required` (GitLab MR).
- [ ] Conflict: later patch on same object returns to queue as `conflict`.
- [ ] Tests: risk routing; auto-merge preconditions; conflict.

## 4. Governance Batch 1

- [ ] Reference tracking: promote/build writes `reference_count` + `last_referenced_at` from episode `knowledge_references`.
- [ ] Maturity promotion: draft→verified (>=N validations); verified→proven (>=2 environments); thresholds in `policies/`.
- [ ] Decay: proven 12mo / verified 6mo / draft idle+lint → downgrade/archive (out of active index, content retained).
- [ ] Reference restores maturity after decay.
- [ ] Three-tier index in build: Layer A catalog, Layer B category lists, Layer C objects.
- [ ] Tests: reference write; promotion thresholds; decay+restore; three-tier index.

## 5. Skill Self-Evolution (team)

- [ ] `skill synthesize --mode team --review` writes team candidates only.
- [ ] Cross-agent dedupe: prefer patching existing umbrella skill.
- [ ] Team skills require human/Git review before promotion; one auto structural repair.
- [ ] Promoted team skill is loaded by repair-context (closes loop).
- [ ] Tests: no auto-promote; dedupe/merge; promote→inject.

## 6. Team Release Audit + Privacy

- [ ] Add `praxisbase team release-audit --json` with `team_repair_loop_ga`, `skill_self_evolution_ga`, `governance_ga`, `privacy_boundary_ga`, `team_ga`.
- [ ] Personal scope and personal-only lessons excluded from team stable knowledge.
- [ ] Credentials/private host/account/chat hard-blocked before proposal.
- [ ] Tests: gate classification; privacy isolation; credential block.

## 7. Team-Git Pipeline + Real Validation

- [ ] GitLab scheduled pipeline template: review/promote/build with `resource_group: praxisbase-write`.
- [ ] Run full real loop: repair-context→episode→propose→review→promote→synthesize→build→audit.
- [ ] `team release-audit` all green.
- [ ] Write `docs/status/m28-team-repair-self-evolution-<date>.md`.
- [ ] `pnpm check` passes.
