# M29 Container Incident Experience 状态 - 2026-06-02

## 概要

M29 已把容器/K8s incident experience 接入团队版同一协议闭环：K8s 使用 `IncidentEpisode`/`Proposal`/known_fix/skill 共享对象模型，bundle 为只读 recommendation-only，sre-autopilot 只作为 peer client 读 bundle、回写 episode/proposal。PB 没有实现 sre-autopilot 的 Go analyzer、探针、MCP/HTTP、LLM loop 或任何 Kubernetes 写权限。

本状态只封存 M29 证据，不授权 M30。

## 本次关键实现

- `repair/signature.ts` 增加 K8s signature detector，覆盖 `pod-oomkilled`、`pod-crashloop-imagepull`、`ingress-5xx-upstream-timeout`、`pvc-pending`、`node-notready`、`dns-resolution-failure`。
- seed pack 扩展到 6 个 K8s known_fix，并保留 `skills/k8s/incident-triage/SKILL.md`，所有 bundle entry 都带 `forbidden_operations`、`verification_steps`、`source_refs`、`risk` 和 `recommendation_only`。
- `adaptDirectionResult` 输出 `scope: team` incident episode/proposal，支持 `confirmed` / `ruled_out` / `inconclusive` / `data_gap`。
- 现有 `episode` 命令族增加 `sync-outbox`，复用 outbox → inbox 幂等同步，不新增顶层命令。
- `team release-audit` 增加三门：`k8s_bundle_ga`、`incident_episode_intake_ga`、`k8s_boundary_ga`，并纳入 `team_ga` 汇总。

## 真实 fixture 闭环证据

临时仓库：

```text
/private/tmp/praxisbase-m29-real-96FFhW
```

执行链：

```text
node packages/cli/dist/index.js init --profile all
node packages/cli/dist/index.js build
node packages/cli/dist/index.js bundle fetch k8s-incident --signature k8s:pod-oomkilled
node packages/cli/dist/index.js episode submit tests/fixtures/m28/openclaw/episodes/dispatch-routing-success.json --offline-ok
node packages/cli/dist/index.js propose tests/fixtures/m28/openclaw/proposals/dispatch-routing-known-fix-patch.json --offline-ok
node packages/cli/dist/index.js episode submit tests/fixtures/k8s-incident/incident-episode.json --offline-ok
node packages/cli/dist/index.js propose tests/fixtures/k8s-incident/proposal.json --offline-ok
node packages/cli/dist/index.js episode sync-outbox --json
node packages/cli/dist/index.js review --auto
node packages/cli/dist/index.js promote --auto
node packages/cli/dist/index.js build
node packages/cli/dist/index.js team release-audit --json
```

结果：

```text
bundle_signature: k8s:pod-oomkilled
bundle_warning: null
sync: episodes=2 proposals=2 skipped=0
ok: true
team_ga: pass
team_repair_loop_ga: pass
skill_self_evolution_ga: pass
governance_ga: pass
privacy_boundary_ga: pass
k8s_bundle_ga: pass
incident_episode_intake_ga: pass
k8s_boundary_ga: pass
blockers: []
warnings: []
```

## 主工作区可选 K8s domain 证据

主工作区 `/Users/guanbear/workspace/praxisbase` 当前没有播种 K8s seed pack：`dist/repair-bundles/k8s-incident/manifest.json` 存在但 `entries` 为 0，且没有 `skills/k8s/incident-triage/SKILL.md` / K8s known_fix seed。因此 K8s 是未启用的可选 domain，`team release-audit` 不应把三门判成失败。

执行：

```text
node packages/cli/dist/index.js team release-audit --json
```

结果：

```text
ok: true
team_ga: pass
team_repair_loop_ga: pass
skill_self_evolution_ga: pass
governance_ga: pass
privacy_boundary_ga: pass
k8s_bundle_ga: not_run
incident_episode_intake_ga: not_run
k8s_boundary_ga: not_run
blockers: []
warnings: [k8s_domain_not_enabled]
next_commands: [praxisbase init --profile k8s, praxisbase build]
```

要在主工作区启用并复现 K8s 三门真实验收，先播种 K8s profile 并重建：

```text
node packages/cli/dist/index.js init --profile k8s
node packages/cli/dist/index.js build
```

启用后，`k8s_bundle_ga` / `incident_episode_intake_ga` / `k8s_boundary_ga` 不再允许 `not_run`；三门必须按真实 bundle、incident episode/proposal/review、边界证据判定，全绿才允许 `team_ga: pass`。

## 测试证据

Focused tests：

```text
pnpm build && tsc -p tsconfig.tests.json && node --test \
  dist-tests/tests/cli/k8s-intake.test.js \
  dist-tests/tests/core/m29-contract-fixtures.test.js \
  dist-tests/tests/core/team-release-audit.test.js

11/11 pass
```

Full verification：

```text
pnpm check
typecheck pass
1398/1398 tests pass
```

收尾补丁 focused tests：

```text
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/team-release-audit.test.js
5/5 pass

tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/team-release-audit.test.js dist-tests/tests/cli/team-command.test.js
6/6 pass
```

## 边界确认

- PB 只产出只读 K8s incident bundle，不执行生产操作。
- bundle checksum mismatch 会拒绝 entry 并降级到 last-known-good cache；无 cache 时返回空 bundle。
- 新 team/k8s skill proposal 仍由已有 team skill review 规则拦到 human-required，不会自动晋升。
- `team_ga` 要求 M28 五门 pass；K8s domain 启用后要求 M29 K8s 三门同时 pass。K8s domain 未启用时，三门为 `not_run` warning，不拉黑 `team_ga`。

## 结论

M29 三门验收在临时 repo 已完成真实全绿闭环；主工作区当前 K8s 未启用，因此三门为 `not_run` 且不影响团队 GA。等待用户确认后才可进入 M30。
