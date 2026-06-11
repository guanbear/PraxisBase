# M30 Feishu Source Integration Tasks

## 0. 实现前必读（硬约束，违反即停）

> 这些约束在 anchor、M30 design、`5.1 源码级借鉴授权清单` 里已定义。即使聊天上下文丢失，开工前也必须遵守。前置：M27/M28/M29 已封顶并提交。

1. **顺序（R5）**：每个阶段**先冻结契约**（spec delta + bdd fixture，飞书 doc/chat/openclaw-export JSON 样例 + PII/1v1/凭据负样本进 `tests/fixtures/`）**再写实现**。
2. **飞书永远是 source，不是权威**：飞书原文（文档正文/聊天/token/cookie）**绝不进 Git**，只进脱敏摘要 + source_ref + hash。权威仍是 review/promote 后的 `kb/`、`skills/`。
3. **同时支持 A 和 B，A 先 B 后**：
   - 路径 A（OpenClaw 飞书插件）几乎不改核心：复用 `channel=feishu`，只加 team review-first（禁用 `trusted_personal_remote`）。OpenClaw 插件是 peer，不在本仓库实现。
   - 路径 B（飞书 CLI/API 直连）新增 `feishu` source_type + `feishu-doc`/`feishu-chat` parser + adapter。
4. **最强隐私门（B 核心，违反即停）**：1v1 私聊默认 **reject**；群消息默认 review；公开 KB 文档走常规 triage。飞书 user_id/open_id/union_id/chat_id 原值视为私有标识必须脱敏；手机/邮箱/证件/卡号/token/cookie 在 envelope 创建前硬拦截。飞书源**不可**用 `trusted_personal_remote` 快速通道。复用现有 `privacy-triage.ts` 再加飞书规则。
5. **凭据只存 env 名**：复用 `assertNoConfigCredential`，拒绝字面凭据。非 HTTPS API（除 loopback）拒绝。
6. **测试只用 mock fixture，禁止连真实飞书拉私密数据**。
7. **不漂移（R1）**：M30 三门未全绿前不加计划外 surface；复用既有 adapter/triage/release-audit，`feishu` gate 是在 `team-release-audit` 上新增 3 门（仿 K8s 的 domain-enabled 判定：未配置飞书源时 not_run，不拉黑 team_ga）。
8. **真实验收**：三门全绿建立在一次真实 mock-fixture 闭环上（source add→doctor→daily→team release-audit），写 `docs/status/m30-feishu-source-integration-<date>.md`，`pnpm check` 全过。

## 0.1 Contract Freeze

- [x] Freeze Feishu fixtures: OpenClaw feishu export (A); Feishu doc JSON + group chat JSON (B); all with PII/1v1/credential negatives.
- [x] Confirm credentials are env-name only (`assertNoConfigCredential`).

## 1. Path A — OpenClaw Feishu Plugin (minimal)

- [x] Force team review-first for `channel=feishu` OpenClaw sources; disable `trusted_personal_remote` shortcut for them.
- [x] Report feishu-channel source share in daily report + HTML.
- [x] Document `source add` standard form for a Feishu OpenClaw source.
- [x] Tests: feishu-channel openclaw ingestion; review-first enforced.

## 2. Path B — Schema + Config

- [x] Add enums: source_type `feishu`; parser `feishu-doc`/`feishu-chat`; agent `feishu`.
- [x] Add config fields `feishu_app_id_env`/`feishu_app_secret_env`/`feishu_target`/`feishu_cli_path`; reuse `assertNoConfigCredential`.
- [x] Extend `inferExperienceSourceParser` for feishu.
- [x] Tests: source add feishu validation; literal-credential rejection; env-name accepted.

## 3. Path B — Adapter (CLI preferred, API fallback)

- [x] New `experience/feishu-client.ts`: CLI transport (env-injected wrapper) + API transport (env-name app id/secret → tenant_access_token); reject non-HTTPS unless loopback.
- [x] New `experience/feishu-adapter.ts`: resolve feishu source into raw items.
- [x] `feishu-doc` parser: doc → canonical Markdown chunk; source_ref=doc token; keep title/edited time.
- [x] `feishu-chat` parser: topic-segment chunks; drop system/idle; source_ref=chat+message range.
- [x] Wire into `resolveExperienceSource`.
- [x] Tests: mock CLI/API pull; doc/chat parsers; source_ref shape; non-HTTPS rejection.

## 4. Strong Privacy Gate (B core)

- [x] Feishu-specific hard blocks: user_id/open_id/union_id/chat_id raw values redacted; phone/email/ID/card/token/cookie blocked.
- [x] 1v1 DM default reject; group messages default review; public KB docs normal triage.
- [x] Uncertain → human-required; HTML shows only redacted summary + reason code.
- [x] Tests: 1v1 reject; PII/Feishu-id hard-block; group review; leak scan.

## 5. Doctor + Release Audit Gates

- [x] `source doctor <feishu>`: CLI/API reachable + HTTPS + env credential present (no value printed) + target readable.
- [x] Extend `team release-audit` with `feishu_source_a_ga`/`feishu_source_b_ga`/`feishu_privacy_ga`.
- [x] Tests: doctor branches; gate classification.

## 6. Real Validation + Status

- [x] Run full A+B chain with mock fixtures: source add → doctor → daily → audit.
- [x] feishu gates + `team_ga` green.
- [x] Verify raw content not in Git (grep for raw Feishu ids/body).
- [x] Write `docs/status/m30-feishu-source-integration-<date>.md`.
- [x] `pnpm check` passes.
