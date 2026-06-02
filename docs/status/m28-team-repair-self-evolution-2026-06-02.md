# M28 Team Repair Self-Evolution 状态 - 2026-06-02

## 概要

M28 已真实跑通团队修复自我进化闭环：repair-context 从稳定 KB frontmatter `signatures:` 匹配 OpenClaw 问题，团队 episode/proposal 进入 review/promote，已验证修复经验回写稳定 wiki；team-git skill synthesis 只生成 reviewable skill candidate，不自动晋升团队 skill；build 产出治理渐进索引；team release-audit 五门全绿。

本状态只封存 M28 证据，不授权 M29/M30。

## 本次关键修复

- `promote --auto` 支持部分成功：历史 backlog 中单个失败提案不再阻断同轮成功提案；有成功有失败时 run status 为 `partial`，纯失败才退出失败。
- `clusterSkillSignals` 保持 `source_refs` 与 `source_hashes` 成对去重排序，避免 skill candidate provenance 错配。
- `kb/known-fixes/openclaw-dispatch-routing-failures.md` 增加团队修复来源 `log://openclaw/team-sandbox-a/run_m28_dispatch_001`，scope 更新为 `team`，保留 signature `openclaw:dispatch-routing-failure`。

## 真实闭环证据

`node packages/cli/dist/index.js repair-context openclaw --logs /tmp/praxisbase-m28-openclaw-dispatch.log --json`：

```text
problem_signature: openclaw:dispatch-routing-failure
known_fixes: kb/known-fixes/openclaw-dispatch-routing-failures.md
truncated: true
```

执行链：

```text
node packages/cli/dist/index.js episode submit tests/fixtures/m28/openclaw/episodes/dispatch-routing-success.json
node packages/cli/dist/index.js propose tests/fixtures/m28/openclaw/proposals/dispatch-routing-known-fix-patch.json
node packages/cli/dist/index.js review --auto
node packages/cli/dist/index.js promote --auto
```

Promote 最新证据：

```text
.praxisbase/runs/promote/run_promote_555142f6.json
status: partial
promoted: 2
skipped: 15
failed: 1
```

失败项是历史 personal backlog 的 metadata downgrade，已被质量门禁拒绝；M28 team known-fix patch 已晋升。

## Skill 自我进化证据

`node packages/cli/dist/index.js skill synthesize --mode team-git --review --json`：

```text
report: .praxisbase/reports/skill-synthesis/skill-synthesis_20260602065726.json
authority_mode: team-git
mode: review
candidates: 1
needs_human: 1
promoted: 0
```

生成候选：

```text
.praxisbase/inbox/proposals/skill_candidate_84107029fa46.json
.praxisbase/inbox/reviews/semantic_skill_review_skill_candidate_84107029fa46.json
```

团队 skill 未自动晋升，符合 Git/human review 边界。重新生成后 source/hash provenance 已配对：

```text
log://openclaw/2026-05-20-05-03-48-stability-report. -> sha256:027fb599399a145d9b9ffbdb6a7531b5fe996d732dea12db17a3fcd879af19bc
log://openclaw/team-sandbox-a/run_m28_dispatch_001 -> sha256:m28dispatch001
raw-vault://codex/rollout-2026-04-04T19-26-57-019d583f-02e6-74d0-9351-b636055d911c -> sha256:d8e4f4a00e20c94f9a8116c72c73aa21cfbffc12d934158a1831e723fcb54078
```

## 治理与发布审计

`node packages/cli/dist/index.js build`：

```text
Build complete.
dist/progressive-index/layer-a-catalog.json
dist/progressive-index/layer-b-known-fixes.json
dist/progressive-index/layer-c-objects.json
```

`node packages/cli/dist/index.js team release-audit --json`：

```text
ok: true
team_ga: pass
team_repair_loop_ga: pass
skill_self_evolution_ga: pass
governance_ga: pass
privacy_boundary_ga: pass
blockers: []
warnings: []
```

## 测试证据

Focused tests：

```text
pnpm test tests/cli/review-promote.test.ts
1402/1402 pass

pnpm test tests/core/skill-stability.test.ts
1394/1394 pass
```

Full verification：

```text
pnpm check
typecheck pass
1390/1390 tests pass
```

## 非阻塞遗留

- `promote --auto` 仍记录 1 个历史 personal backlog downgrade 冲突；这是质量门禁应拒绝的历史项，不阻断 M28 team loop。
- 当前 team skill candidate 仍为 review/edit 状态，等待人工或 Git review；团队 skill 禁止自动晋升是 M28 设计要求。

## 结论

M28 五门验收 **真实全绿**，完整闭环已跑通。等待用户确认后才可进入 M29。
