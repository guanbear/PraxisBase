# PraxisBase 路线文档索引 (2026-06)

这是交给实现 AI 的**单一入口**。按顺序读、按顺序做。任何文档与 anchor 冲突时以 anchor 为准。

## 当前进度（2026-06-02）

- **M27 个人版已由用户确认封顶。**
- **M28 团队·OpenClaw 修复自我进化已由用户确认封顶。**
- **M29 团队·容器/K8s 排查经验已实现并真实验收全绿，等待用户确认封顶。**
  - `team release-audit --json`: `team_ga=pass`
  - M29 三门：`k8s_bundle_ga=pass` / `incident_episode_intake_ga=pass` / `k8s_boundary_ga=pass`
  - `pnpm check`: 1396/1396 pass
- 详见 `docs/status/m29-container-incident-experience-2026-06-02.md`。
- **下一步 = 等用户确认 M29 封顶；确认前不要开 M30。**

## 0. 先读：Anchor（宪法）

- `docs/superpowers/specs/2026-06-02-convergence-and-team-roadmap-design.md`
  - 北极星、三条产品线（P 个人 / B 修复自我进化 / A 容器排查）、milestone 序列、反漂移纪律 R1–R7、**4.5 代码现状基线**、借鉴裁决 + **5.1 源码级借鉴授权清单（按 license）**、文档策略。

## 1. Milestone 序列与门（不全绿不进下一个）

```text
M27 个人版封顶  → personal release-audit 全绿
M28 团队·修复自我进化(主线) → team release-audit (B+治理) 全绿
M29 团队·容器排查 → team release-audit (+K8s 三门) 全绿
M30 治理收口/联邦（可选）
```

## 2. 各 milestone 文档包

### M27 个人版封顶（先做）
- 设计：`docs/superpowers/specs/2026-06-02-m27-personal-ga-freeze-design.md`
- OpenSpec：`docs/openspec/changes/m27-personal-ga-freeze/{proposal,design,tasks}.md` + `specs/agent-knowledge-substrate/spec.md`
- BDD：`docs/bdd/m27-personal-ga-freeze.feature`

### M28 团队·OpenClaw 修复自我进化（团队主线）
- 设计：`docs/superpowers/specs/2026-06-03-m28-team-repair-self-evolution-design.md`
- 实施计划：`docs/superpowers/plans/2026-06-03-m28-team-repair-self-evolution-implementation-plan.md`
- OpenSpec：`docs/openspec/changes/m28-team-repair-self-evolution/{proposal,design,tasks}.md` + `specs/agent-knowledge-substrate/spec.md`
- BDD：`docs/bdd/m28-team-repair-self-evolution.feature`

### M29 团队·容器/K8s 排查经验
- 设计：`docs/superpowers/specs/2026-06-04-m29-container-incident-experience-design.md`
- 实施计划：`docs/superpowers/plans/2026-06-04-m29-container-incident-experience-implementation-plan.md`
- OpenSpec：`docs/openspec/changes/m29-container-incident-experience/{proposal,design,tasks}.md` + `specs/agent-knowledge-substrate/spec.md`
- BDD：`docs/bdd/m29-container-incident-experience.feature`
- 集成边界（前序，必读）：`docs/superpowers/specs/2026-05-18-sre-autopilot-k8s-incident-integration-design.md`

### M30 团队·飞书数据源接入（文档 + 聊天，同时支持 A+B）
- 设计：`docs/superpowers/specs/2026-06-05-m30-feishu-source-integration-design.md`
- 实施计划：`docs/superpowers/plans/2026-06-05-m30-feishu-source-integration-implementation-plan.md`
- OpenSpec：`docs/openspec/changes/m30-feishu-source-integration/{proposal,design,tasks}.md` + `specs/agent-knowledge-substrate/spec.md`
- BDD：`docs/bdd/m30-feishu-source-integration.feature`

## 3. 执行规则（给实现 AI）

1. 先读 anchor，再读当前 milestone 的 design → openspec → bdd。
2. 先写/冻结契约（spec delta + bdd fixture），再写实现（R5）。
3. 复用既有代码（anchor 第 4 节 + 4.5 代码现状基线），禁止重造对象模型（R2）。
4. 当前 milestone 的门未全绿前，不新增产品 surface（R1）。
5. 每个 milestone 收尾必须写 `docs/status/<name>-<date>.md` 真实运行证据（R6），并 `pnpm check` 通过。
6. 借鉴项目按 anchor 第 5 节 + **5.1 源码级借鉴授权清单**裁决：MIT(llmwiki/SkillClaw)可源码级移植并注明出处；GPL(nashsu)只能借思想禁止拷码；GBrain/AgentMemory 当外部能力。

## 4. 立即要做的（等待 M29 确认）

1. 用户确认 M29 封顶前，不开 M30。
2. 若需要复核，先看 `docs/status/m29-container-incident-experience-2026-06-02.md` 的真实 fixture 链路和 `pnpm check` 证据。
3. 用户确认后，才进入下一 milestone。
