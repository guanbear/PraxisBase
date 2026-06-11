# M28 团队版 · OpenClaw 修复自我进化 设计

日期：2026-06-03
上游 anchor：`docs/superpowers/specs/2026-06-02-convergence-and-team-roadmap-design.md`
前置门：M27 个人版 GA 必须全绿才能开工（anchor R1 + milestone 序列）。

## 1. 目标

让团队内多个 OpenClaw 修复 agent（通常是 Claude Code）在团队 GitLab 权威层上形成**完整的修复自我进化闭环**：

```text
修复前: repair-context openclaw --logs  → 取历史修复经验 + 已晋升 skill（带查询预算）
修复中: Claude Code 在沙箱内修复
修复后: episode submit (成功/失败 + 证据)  +  propose (新经验)
晋升:   review --auto (中低风险自动) / exceptions/human-required (高风险)
进化:   重复成功 episode → skill synthesize → 人工/Git review → promote → 下个 agent 自动加载
治理:   knowledge_references 回写 reference_count/last_referenced_at → 自动成熟度晋升 → 长期未引用自动衰减
```

这是**团队版的主场景**（anchor 的 B 线）。它优先于容器排查（A 线，M29），因为对象模型、bundle、skill synthesis 在个人侧（M27）已验证大半，迁到团队 review/promote 最快出真实闭环。

同时落地**治理底座 G 的第一批能力**（引用追踪、成熟度晋升、衰减、查询预算、三级渐进索引），因为没有治理，团队知识库会膨胀、过时、误导 agent。

## 2. 非目标

- 容器 / K8s 排查（M29）。
- 多 repo 联邦、外部向量库、外部搜索服务。
- 把团队 skill 自动晋升（团队 skill **必须**人工/Git review，沿用 `agent-skill-synthesis-governance` 的 Team Skill Review Boundary）。
- 让修复 agent 超出沙箱权限执行生产变更。
- 中央主控 agent（保持 peer model）。

## 3. 架构

```text
多个 OpenClaw 修复 agent (Claude Code, peer clients)
        | repair-context (读) / episode+propose (写 inbox/outbox)
        v
团队 PraxisBase repo (GitLab 权威层)
  .praxisbase/inbox|outbox   kb/   skills/   policies/
        | scheduled pipeline: review --auto / promote --auto / build
        | resource_group: praxisbase-write 写锁
        v
治理引擎 (引用追踪 + 成熟度晋升/衰减 + 查询预算)
        v
build → dist/repair-bundles/openclaw/*  + 三级索引
        v
下一个修复 agent 的 repair-context 带着更成熟的经验启动
```

权威层是 GitLab（团队），个人是 GitHub。所有 agent 是 peer，repo 不指挥 agent。

## 4. 修复闭环主线（接回被冷落的主线）

### 4.1 repair-context 从硬编码改为读真实知识

现状：`repair/context.ts` 的 `SIGNATURE_CONTEXTS` 是硬编码 map；`repair/signature.ts` 的 `detectOpenClawProblemSignature` **目前只识别 3 个 signature**：`openclaw:claude-auth-expired`、`openclaw:workspace-lock-stuck`、`openclaw:node-runtime-missing`（外加 `openclaw:unknown`）。`kb/` 里已晋升的页面（dispatch routing failures、gateway restart、slack replay 等）**没有对应 signature**，因此取不到。

M28 改为：
- **先扩展 signature 识别**：让 signature↔known-fix 映射由 kb frontmatter 的 `signatures:` 字段驱动（`kb/known-fixes/openclaw-dispatch-routing-failures.md` 已有 `signatures:` 字段可参考），而非继续硬编码；为已晋升页面补齐 signature。
- 输入日志 → signature → 从 `kb/known-fixes/`、`skills/openclaw/`、`kb/procedures/`、`kb/pitfalls/` 按 signature 检索匹配对象；
- 应用**查询预算**：注入字节有上限，按 maturity（proven > verified > draft）+ reference_count 排序，超预算截断并标记 `truncated`；
- 输出 compact bundle：known_fixes / skills / diagnostic_commands / forbidden_operations / verification_steps / rollback_steps / escalation_conditions + source_refs。
- bundle 缺失/校验失败时返回 last-known-good cache（`bundles/fetch.ts` 已有该语义），不阻断修复。

### 4.2 episode / propose

- 修复 agent 修复后提交 `repair_episode`（含 result success/failed/partial、source_refs、knowledge_references、idempotency_key）。
- 发现可复用经验时提交 `proposal`（create/patch known_fix/procedure/skill，带 evidence：source_uri/hash/excerpt/repair_result/verification）。
- 沙箱 agent 默认无宽 Git 写权限：写 `.praxisbase/outbox/` 或经受限 bot token / submission gateway，后续 sync。

### 4.3 review / promote（团队风险分级）

- 沿用 `review/{policy,risk,reviewer}.ts` + `promote/promote.ts`。
- 中低风险（新 draft known_fix、加证据、typo、reference 追加）AI 自动合入；
- 高风险（删除/重写、启用新默认 skill、改 policy/权限、降低验证、proven 晋升）→ `exceptions/human-required`，走 GitLab MR 人工裁决；
- 自动合入前置：provenance 齐全 + 独立 reviewer approve + confidence ≥ 阈值 + `check` 通过 + 未命中 manual_required + skill/procedure 含 verification+rollback。

## 5. Skill 自我进化（B 线核心）

借鉴高德 SkillClaw 的 **post-task 演化 loop + 跨 agent 去重合并 + PRM 质量打分**思想（不引入其 daemon/server）：

- 触发：同一 signature 多次成功 episode / 多 episode 重复诊断步骤 / curator 发现某 known_fix 已稳定。
- `skill synthesize --mode team --review`：从稳定 wiki / 已批准 lessons 合成团队 skill candidate（写 inbox，不动 `skills/**`）。
- **跨 agent 去重合并**：合成前先比对已有 skill，优先 patch 现有 umbrella skill 而非新建 sibling（沿用 Skill Decision Ladder）。
- 质量打分：复用 `synthesis/skill-validation.ts` + semantic review；结构缺陷先自动修复一次再进人工。
- 团队 skill **必须人工/Git review** 才能 promote；promote 后进入 `skills/`，下次 `repair-context` 自动加载 → 完成"进化"。

## 6. 治理底座 G 第一批（横切，支撑 B 与未来 A）

| 能力 | 设计 | 复用 |
| --- | --- | --- |
| 引用追踪闭环 | promote/build 时读 episode 的 `knowledge_references`，回写被引对象的 `reference_count` / `last_referenced_at` | `protocol/schemas.ts` 字段已有；新增 reference-tracker |
| 自动成熟度晋升 | 被 ≥N 个不同 environment_id/run_id 验证：draft→verified；跨 ≥2 environment：verified→proven。阈值进 `policies/` | `wiki/lifecycle.ts` |
| 自动衰减 | proven 12 月未引用→verified；verified 6 月未引用→draft；draft 持续未引用+lint 标记→archive（移出活跃索引）。规则源自腾讯实践（设计验证，不复刻代码） | `kb/maintenance.ts`, `lint/index.ts` |
| 查询预算 | repair-context / context get 注入字节上限，按 maturity+reference 排序截断 | `repair/context.ts`, `experience/context.ts` |
| 三级渐进索引 | Layer A 全景目录(~50行) / Layer B 分类清单(每条一行) / Layer C 完整对象。agent 先读 A 定位、再读 B 过滤、最后按需读 C | `build/build.ts`, `wiki/catalog.ts` |

成熟度/衰减阈值必须在 `policies/` 可配置，不硬编码。

## 7. 隐私与边界（团队 review-first）

- personal scope 对象不进 team 稳定知识；team 模式拒绝 personal-only lessons（M25 已有该行为，复用）。
- 凭据 / 私有 host / 私有账号 / 私聊内容在 proposal 生成前硬拦截；不确定项进 `exceptions/human-required`。
- 修复 bundle 只能建议，禁止要求 agent 自动执行沙箱外生产变更。
- 大 raw logs 不进 Git，只存摘要+source URI+hash+脱敏证据。

## 8. 团队 GitLab 运行

> **代码现状**：`--mode team-git` **已存在**（daily/skill/lesson/kb/privacy 命令都已支持），GitLab CI 模板 `templates/gitlab/knowledge-repo.gitlab-ci.yml` **已存在**（含 daily-harvest/review/promote/build jobs）。M28 **复用并补强**它们，不要重建。`praxisbase team release-audit` 命令是**新增**（仿 `personal-release-audit.ts`）。

- `daily run --mode team-git --branch harvest/daily --commit --push --build-site`（已有 team-git 入口）。
- Scheduled Pipeline：review / promote / build（模板已有）；确认写任务用 `resource_group: praxisbase-write` 单写锁（若模板未加则补）。
- 冲突：episode append-only 不冲突；两个已批准 proposal patch 同对象时，后者 patch 失败回 review queue，状态 `conflict`。

## 9. 团队验收门

新增 `praxisbase team release-audit --json`（仿 personal release-audit）：

```text
team_repair_loop_ga      # repair-context→episode→propose→review→promote 真实闭环
skill_self_evolution_ga  # ≥1 团队 skill 经人工 review 晋升，并被 repair-context 加载
governance_ga            # 引用追踪+成熟度晋升+衰减+查询预算 真实生效
privacy_boundary_ga      # personal 不入 team；凭据被拦截
team_ga                  # 以上全 pass
```

真实验收命令：
```bash
praxisbase repair-context openclaw --logs <fixture> --json
praxisbase episode submit episode.json --json
praxisbase propose proposal.json --json
praxisbase review --auto --json
praxisbase promote --auto --json
praxisbase skill synthesize --mode team --review --json
praxisbase build --json
praxisbase team release-audit --json
```
记录在 `docs/status/m28-team-repair-self-evolution-<date>.md`。

## 10. 失败处理

| 失败 | 行为 |
| --- | --- |
| episode/proposal submit 失败 | 写 outbox，sync 重试，idempotency_key 去重 |
| bundle fetch 失败 | last-known-good cache；无 cache 返回空 bundle + warning |
| review confidence 低 | 进 human-required，不自动合入 |
| 两 proposal 冲突 | 后者回 review queue 标 conflict |
| 衰减误降 | 引用即恢复；衰减只移出活跃索引不删除内容 |

## 11. 实现复用地图

`repair/context.ts`(改读真实知识+预算) · `repair/signature.ts` · `review/*` · `promote/promote.ts` · `synthesis/skill-*.ts`(团队 review) · `kb/maintenance.ts`+`lint/index.ts`+`wiki/lifecycle.ts`(治理) · `experience/git-workflow.ts`(team-git) · `build/build.ts`+`wiki/catalog.ts`(三级索引) · 新增 `experience/team-release-audit.ts` + reference-tracker。
