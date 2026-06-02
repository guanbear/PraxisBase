# M27 Personal GA Freeze 状态 - 2026-06-02

## 概要

经 commit `d424f8c Fix remote noise queue accounting` 后，个人版 GA 四门真实全绿。根因修复正确：远端 OpenClaw 30 条中 14 条是 `memory/dreaming/*` / `Candidate:` 噪音，过滤逻辑已有，但队列错误地把"被过滤的噪音"算成"未处理高优先级"。改为只把"因 limit 未处理的可用条目"计入 remaining。

## 验收证据（实测）

`node packages/cli/dist/index.js personal release-audit --json`：
```text
personal_ga: pass
wiki_context_ga: pass
skill_compiler_ga: pass
gbrain_runtime_ga: pass
ok: true
blocking_reasons: []
```

- pnpm test：1367/1367 pass。
- high-priority queue：`remaining_high_priority_items = 0`。
- 远端 OpenClaw 16/16 有效项处理完；Codex app / codex-cliproxyapi / 本地 OpenClaw memory+reports 全处理完。
- HTML 站点：dist/index.html + 14 pages；broken links/duplicates/orphans/stale/quality findings 全 0。
- GBrain export：14 pages / 15 payloads / 1 promoted skill / skipped 0。
- 新增稳定 wiki 页：`kb/known-fixes/agents-can-mislead-users-if-failures-are-reported-as-successful-outcomes.md`（fail-closed / 失败不报成功）。

## Gate 1/2A/2B 判定

- Gate 1 Wiki/Context：**pass**。full queue drained，context 返回 PB 权威条目。
- Gate 2A Skill Compiler：**pass**。1 个 promoted skill（OpenClaw dispatch routing failures），inject-preview 非空。
- Gate 2B GBrain：**pass**。export + retrieval 有证据。

## M27 范围内质量项（B1/B2，已关闭）

2026-06-02 收尾已完成 B1/B2，`kb audit` 不再是假绿：

- **B1 dreaming/corpus provenance 泄漏（已关闭）**：
  - `promotionTimeGuard` 已拒绝 `memory/dreaming/`、`.dreams`、`dream-diary`、`session-corpus`、裸 `Candidate:`。
  - `kb audit` 已覆盖 `kb/**/*.md` 和 promoted `skills/**/SKILL.md`。
  - 混合 provenance 页保留有效 `log://` / `raw-vault://` 来源并剥离脏来源；全脏页已删除并解除 inbound wikilinks。
  - `grep -RIn "memory/dreaming\|\.dreams\|dream-diary\|session-corpus\|Candidate:" kb skills` 无输出。
- **B2 slug 未规范化（已关闭）**：
  - 新增稳定 slug util：kebab-case、最长 80 字符、确定性碰撞后缀。
  - `makeWikiSlug` / `slugifyId` 已接入稳定 slug util。
  - 已迁移 `kb/known-fixes/missing-replay-data-compromises-the-ability-to-debug-or-verify-past-execution-behaviors.md` 至 `kb/known-fixes/missing-replay-data-compromises-the-ability-to-debug-or-verify-past-execution.md`，并重指向 wikilinks / `related_wiki_paths`。

## B1/B2 收尾验收证据

- `node packages/cli/dist/index.js kb audit --json`：checked 10 / passed 10 / failed 0。
- `node packages/cli/dist/index.js wiki build-site --json`：pages 10，broken links / duplicates / orphans / stale / quality findings 全 0。
- `node packages/cli/dist/index.js gbrain export --mode personal --write --json`：pages 10，exported 11，skills_exported 1，errors 0，warnings 0；最新报告 `.praxisbase/reports/gbrain-export/gbrain-export_2026-06-02t05-06-14-371z.json` 不含旧 slug 或 dreaming/corpus provenance。
- `node packages/cli/dist/index.js personal release-audit --json`：personal_ga / wiki_context_ga / skill_compiler_ga / gbrain_runtime_ga 全 pass。
- `pnpm check`：1375/1375 pass。

## 非阻塞遗留（符合设计，不阻断 GA）

- 49 条 privacy-required 保留，需人工/后续策略，不自动进 wiki。
- 4 个 skill candidate 待人工 review；当前仅 1 个已推广 skill 可复用。
- AgentMemory sidecar optional unavailable，不阻塞 PB/GBrain/个人版 GA。

## 结论

M27 主门（personal GA 4 门）**真实达成**，B1/B2 质量收尾也已关闭。等待用户确认后，才可进入 M28；本状态文件不授权自动开始团队版。
