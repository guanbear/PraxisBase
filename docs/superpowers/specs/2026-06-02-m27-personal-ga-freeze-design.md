# M27 Personal GA Freeze 设计

日期：2026-06-02
上游 anchor：`docs/superpowers/specs/2026-06-02-convergence-and-team-roadmap-design.md`
前序：M26 Personal GA Cut（定义了 4 门，但 release-audit 命令未实现、Gate 2A/2B 未通过）

## 1. 目标

M26 定义了个人版 GA 的三门模型（Gate 1 Wiki/Context、Gate 2A Skill Compiler、Gate 2B GBrain）。

**代码现状（实现前必须先读真实代码，不要照搬本节早期措辞）**：
- `praxisbase personal release-audit` **命令与报告已存在且基本完整**（`cli/src/commands/personal.ts` 的 `release-audit` 子命令 + `experience/personal-release-audit.ts`）。它已经产出 `wiki_context_ga` / `skill_compiler_ga` / `gbrain_runtime_ga` / `personal_ga` 四个状态，已区分 `queue.full_run` 与 `bounded_smoke`，已读 `remaining_high_priority_items`、GBrain publish/retrieval evidence。**所以 M27 不是"从零实现 audit"，而是"让门真正能 PASS + 补 waive + 修 bug"。**

**真正的 gap（M27 要解决的）**：
- 门判定齐全，但**没有一次真实 full run 让它全绿**：最新 run 是 `bounded_smoke`，`full_run=false`，`remaining_high_priority_items=283`。
- 没有 promoted skill → `skill_compiler_ga` 难 pass，`skill inject-preview` 可能为空。
- GBrain doctor 不健康，且**当前 `gbrain_runtime_ga` 没有 `waived` 状态、没有 `--waive-gbrain`**（需新增），导致它一直卡 fail。
- 没有 `daily run --mode personal --full` 的显式 full-queue 入口（需确认/新增）。
- 质量 bug：已晋升的 `kb/known-fixes/openclaw-dispatch-routing-failures.md` 的 provenance 混入 `memory/dreaming/*` 来源；kb 文件名是整句（slug 未规范化）。

M27 的唯一目标：**让个人版真正达到自己定义的 GA（让已存在的 release-audit 全绿），并把它钉死为反漂移硬刹车。** M27 只做"补全 + 修 bug"，不新增任何产品 surface（anchor R1）。

## 2. 非目标

- 团队模式、容器排查（M28/M29）。
- 新的 CLI 命令族、新检索后端、新存储层。
- 无限历史回填。
- 把 GBrain 做成第二个 brain。

## 3. 设计

### 3.1 Gate 1 — PB Wiki/Context GA（full personal queue 真实 drain）

问题：当前 `personal_ga` 在 bounded smoke 下也报 `production_ready=true`，误导。

设计：
- `daily run --mode personal --full` 必须能 **resumable** 地处理所有高优先级来源（本地 OpenClaw、可信远程 OpenClaw、Codex app、codex-cliproxyapi），在 budget + cache 控制下把 `remaining_high_priority_items` 降为 0，或对每个未处理项给出显式 blocker。
- `remaining_high_priority_items` 必须从"当前 source chunks + source-item ledger entries"计算（`source-item-ledger.ts`），不能只看 `--max-ai-chunks`。
- bounded smoke run 不得报告 Gate 1 pass；release-audit 必须能区分 `run_kind: full_run` 与 `bounded_smoke`。
- Gate 1 pass 条件：存在稳定 wiki 页或 active personal lessons；`context get --agent openclaw|codex` 在无 sidecar 时返回 PB 权威条目；稳定输出泄漏扫描通过。

### 3.2 Gate 2A — PB Skill Compiler GA（真实晋升 ≥1 skill）

设计：
- skill 合成输入只能是稳定 wiki / 已批准或 `skill_ready` lessons / 安全 active personal lessons（`synthesis/skill-signals.ts` 已限制，保持）。
- 必须真实 promote ≥1 个 personal skill 到 `skills/**`，带 promotion audit（proposal id / candidate id / validation id / semantic review id / source hashes / reviewer/policy）。
- `skill inject-preview --query "openclaw dispatch routing failure"` 必须非空。

### 3.3 Gate 2B — GBrain Runtime（**收口为可选增强**）

决策（anchor 推荐）：**把 GBrain 从"GA 硬依赖"降级为"可选增强"**，避免继续卡在"配了但不健康"的中间态。

- 若用户已配置且 GBrain doctor 健康：执行发布 + `context get --with-gbrain` 检索验证，Gate 2B = `pass`。
- 若用户未配置或显式 waive：Gate 2B = `waived`，并在 audit 中标注 `gbrain_waived: true` 与原因；此时 `personal_ga` 仍可 pass（因为 PB core 不依赖 GBrain）。
- GBrain/AgentMemory sidecar hits 永远不作为 PB promotion evidence（保持既有 authority 契约）。

`personal_ga = pass` 的判定：`wiki_context_ga=pass AND skill_compiler_ga=pass AND (gbrain_runtime_ga in {pass, waived})`。

### 3.4 release-audit 命令（已存在，需补强）

`praxisbase personal release-audit --json` **已实现**（`personal-release-audit.ts` 的 `readPersonalReleaseAuditReport` + `buildPersonalReleaseAuditReport`），已读取最新 daily/skill/gbrain evidence，默认不重跑昂贵 AI。真实报告字段（**以代码为准，不要改名**）：

```json
{
  "type": "personal_release_audit_report",
  "ok": true,
  "personal_ga": "pass|fail",
  "wiki_context_ga": "pass|fail",
  "skill_compiler_ga": "pass|fail",
  "gbrain_runtime_ga": "pass|fail",
  "gates": { "wiki_context_ga": { "...": "..." }, "skill_compiler_ga": {}, "gbrain_runtime_ga": {} },
  "blocking_reasons": [],
  "warnings": []
}
```

M27 对它的**改动只有两处**：
1. 给 `gbrain_runtime_ga` 增加 `waived` 状态 + `--waive-gbrain`（见 3.3），并让 `aggregatePersonalGaStatus` 接受 `waived` 视同通过。
2. 确保每个 gate 的 blocker 带可执行 `next_command`（现有 `blocking_reasons` 是字符串数组，需扩展为带 next_command 的结构或并行提供）。

不得为 audit 引入付费 AI 重跑。

### 3.5 质量修复

- **B1 dreaming/corpus 来源泄漏**：稳定知识对象（`kb/**`、`skills/**`）的 `sources`/`source_refs` 不得包含 `memory/dreaming/`、`.dreams`、`dream-diary`、`session-corpus`、`Candidate:` 来源。promotion-time guard（`wiki/promotion-quality.ts`、`kb/maintenance.ts` 的 `promotionTimeGuard`）必须拦截并在 `kb audit` 报告。已存在的脏页通过 `kb prune` 修复或重新晋升。
- **B2 slug 规范化**：kb/skills 文件名用规范化短 slug（kebab-case，截断长度上限），完整标题进 frontmatter `title`。新增 slug 生成在晋升路径统一调用，旧脏文件提供一次性迁移。

借鉴落地：nashsu llm_wiki 的"级联删除"用于 B1 清理脏页时同步清理 `[[wikilink]]`（`removeLinksToDeletedPages` 已有）；llmwiki 的 lint/health-score 思想用于 kb 质量度量。

## 4. 数据流（M27 后的个人 full 流程）

```text
personal connect (codex/openclaw/...)
  -> source inventory + item ledger
  -> context reducer (TokenJuice 式压缩)
  -> chunk + privacy precheck
  -> AI distill (budget+cache, resumable full queue)
  -> lessons (deterministic + AI) -> disposition (active/wiki_ready/skill_ready)
  -> wiki compile/curate + semantic review -> promote -> kb/
  -> skill synthesize -> validate -> review -> promote -> skills/   (≥1)
  -> [optional] publish stable to GBrain
  -> personal release-audit (4 门) -> 全绿 -> status 记录
```

## 5. 失败处理

| 失败 | 行为 |
| --- | --- |
| full queue 中断 | resume_state 持久化，可续跑；audit 报 `queue_incomplete` + resume 命令 |
| 无 promoted skill | skill_compiler_ga=fail，blocker 带 `skill synthesize/promote` 命令 |
| GBrain 不健康且未 waive | gbrain_runtime_ga=fail，blocker 给 doctor/setup 命令或 `--waive-gbrain` |
| 检测到 dreaming 泄漏 | kb audit fail，列出脏页 + `kb prune` 命令；release-audit 阻断 |
| leak scan 命中私有串 | wiki_context_ga=fail |

## 6. 验收

`praxisbase personal release-audit --json` 输出：
```text
wiki_context_ga: pass
skill_compiler_ga: pass
gbrain_runtime_ga: pass | waived
personal_ga: pass
```
且这些真实命令可复现：
```bash
praxisbase daily run --mode personal --full --build-site --json
praxisbase context get --agent openclaw --stage diagnosis --mode personal --query "openclaw dispatch" --json
praxisbase context get --agent codex --stage diagnosis --mode personal --query "openclaw dispatch" --json
praxisbase skill inject-preview --query "openclaw dispatch routing failure" --json
praxisbase kb audit --json
praxisbase personal release-audit --json
```
并在 `docs/status/m27-personal-ga-freeze-<date>.md` 记录真实运行证据。

## 7. 实现复用

- `experience/personal-release-audit.ts`（接 4 门）
- `experience/personal-ga.ts`（queue full/bounded 区分）
- `experience/source-item-ledger.ts`（remaining 计算）
- `synthesis/skill-*.ts`（promote ≥1）
- `kb/maintenance.ts` + `wiki/promotion-quality.ts`（B1）
- 统一 slug util（B2，若不存在则新增 `protocol/slug.ts` 并在所有晋升路径调用）
