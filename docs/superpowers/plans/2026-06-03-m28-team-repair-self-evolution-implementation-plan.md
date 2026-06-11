# M28 团队版 · OpenClaw 修复自我进化 实施计划

日期：2026-06-03
设计：`docs/superpowers/specs/2026-06-03-m28-team-repair-self-evolution-design.md`
契约：`docs/openspec/changes/m28-team-repair-self-evolution/`
BDD：`docs/bdd/m28-team-repair-self-evolution.feature`

前置：M27 个人版 GA 全绿。先写契约（spec delta + bdd）再实现（anchor R5）。

## 阶段 0：契约冻结

- [ ] 评审 anchor + design，确认门定义。
- [ ] 冻结 spec delta 与 bdd fixture（episode/proposal/bundle JSON 样例进 `tests/fixtures/`）。
- [ ] 确认不新增产品 surface（R1）。

## 阶段 1：repair-context 接真实知识 + 查询预算

模块：`repair/context.ts`, `repair/signature.ts`, `wiki/retrieval.ts`, `wiki/catalog.ts`
- [ ] 把 `SIGNATURE_CONTEXTS` 硬编码改为按 signature 从 `kb/known-fixes|procedures|pitfalls` 和 `skills/openclaw` 检索。
- [ ] 实现查询预算：注入字节上限（进 policy），排序 = maturity(proven>verified>draft) 然后 reference_count desc，超限截断并标记 `truncated`。
- [ ] bundle 缺失/校验失败 → last-known-good cache（复用 `bundles/fetch.ts`）。
- [ ] 测试：signature 命中返回真实对象；预算截断；缓存降级。

## 阶段 2：episode / propose 团队写入通道

模块：`store/file-store.ts`, `experience/git-workflow.ts`, cli `episode.ts`/`propose.ts`
- [ ] outbox 写入 + sync + idempotency 去重。
- [ ] 受限 bot token / submission gateway 路径（沙箱无宽写权限）。
- [ ] 测试：outbox 重试幂等；inbox 校验保留 source_refs/knowledge_references。

## 阶段 3：团队 review / promote 风险分级

模块：`review/{policy,risk,reviewer}.ts`, `promote/promote.ts`, `policies/`
- [ ] 团队风险规则：中低风险自动；高风险进 human-required。
- [ ] 自动合入前置校验（provenance/confidence/check/verification+rollback）。
- [ ] 冲突处理：后提交 patch 失败回 queue 标 conflict。
- [ ] 测试：风险分级路由；冲突；自动合入前置。

## 阶段 4：治理底座 G 第一批

模块：新增 reference-tracker；`wiki/lifecycle.ts`, `kb/maintenance.ts`, `lint/index.ts`
- [ ] 引用追踪：promote/build 读 episode.knowledge_references 回写 reference_count/last_referenced_at。
- [ ] 成熟度晋升：draft→verified（≥N 验证）、verified→proven（≥2 environment），阈值进 policy。
- [ ] 自动衰减：proven 12m / verified 6m / draft 持续未引用 → 降级/归档，移出活跃索引。
- [ ] 三级渐进索引：build 产出 Layer A 全景目录 + Layer B 分类清单 + Layer C 对象。
- [ ] 测试：引用回写；晋升阈值；衰减恢复；索引三级。

## 阶段 5：Skill 自我进化（团队 review）

模块：`synthesis/skill-*.ts`
- [ ] `skill synthesize --mode team --review` 写 team candidate（不动 skills/**）。
- [ ] 跨 agent 去重合并：优先 patch 现有 umbrella（Skill Decision Ladder）。
- [ ] 团队 skill 必须人工/Git review 才 promote；结构缺陷自动修复一次。
- [ ] promote 后被 repair-context 加载（闭环）。
- [ ] 测试：team candidate 不自动晋升；去重合并；promote→inject。

## 阶段 6：团队验收 + 隐私边界

模块：新增 `experience/team-release-audit.ts`；`experience/privacy-*.ts`
- [ ] `praxisbase team release-audit --json`：4 门 + team_ga。
- [ ] personal scope 不入 team；凭据/私有串硬拦截。
- [ ] 测试：门分类；隐私拦截；personal 隔离。

## 阶段 7：真实验收 + status

- [ ] team-git scheduled pipeline 模板（review/promote/build + 写锁）。
- [ ] 真实跑一次完整闭环（repair-context→episode→propose→review→promote→synthesize→build→audit）。
- [ ] `team release-audit` 全绿。
- [ ] 写 `docs/status/m28-team-repair-self-evolution-<date>.md`。
- [ ] `pnpm check` 通过。

## 测试矩阵

| 领域 | 单测 | 集成/BDD |
| --- | --- | --- |
| repair-context 真实知识+预算 | ✓ | ✓ |
| episode/proposal outbox | ✓ | ✓ |
| 风险分级/冲突 | ✓ | ✓ |
| 引用追踪/晋升/衰减 | ✓ | ✓ |
| skill 团队进化 | ✓ | ✓ |
| 团队验收门/隐私 | ✓ | ✓ |

## 风险

- 治理阈值过激导致有用知识被衰减 → 衰减只移出活跃索引、引用即恢复、阈值可配。
- 团队 skill 误自动晋升 → 硬约束人工/Git review，单测守护。
- repair-context 预算截断丢关键修复 → 按 maturity+reference 排序优先，proven 优先保留。
