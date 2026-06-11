# M30 团队版 · 飞书数据源接入 实施计划

日期：2026-06-05
设计：`docs/superpowers/specs/2026-06-05-m30-feishu-source-integration-design.md`
契约：`docs/openspec/changes/m30-feishu-source-integration/`
BDD：`docs/bdd/m30-feishu-source-integration.feature`

前置：M28 全绿。**同时支持 A 和 B**，A 先落地，B 紧随。先冻结契约+fixture 再实现（anchor R5）。复用 M28 的 privacy/triage/review/promote/team-release-audit。

## 阶段 0：契约冻结

- [ ] 落 feishu fixtures：OpenClaw 飞书 export 样例（A）、飞书文档 JSON 样例、飞书群消息 JSON 样例（B），均含 PII/1v1/凭据负样本。
- [ ] 确认凭据只存 env 名（沿用 `assertNoConfigCredential`）。

## 阶段 1：路径 A（OpenClaw 飞书插件，最小改动）

模块：`experience/privacy-triage.ts`, `experience/source-adapters.ts`, `wiki/render-site.ts`
- [ ] `channel=feishu` 的 OpenClaw 源在 team 模式默认 review-first，禁用 `trusted_personal_remote` 快速通道。
- [ ] 报告/HTML 标注 `channel=feishu` 来源占比。
- [ ] 文档化飞书 OpenClaw 源 `source add` 标准写法。
- [ ] 测试：feishu-channel openclaw 源摄入；review-first 生效。

## 阶段 2：路径 B schema + config

模块：`protocol/schemas.ts`, `experience/source-config.ts`
- [ ] 加 enum：source_type `feishu`；parser `feishu-doc` / `feishu-chat`；agent `feishu`。
- [ ] source config 加 `feishu_app_id_env` / `feishu_app_secret_env` / `feishu_target` / `feishu_cli_path`；复用 `assertNoConfigCredential`（拒绝字面凭据）。
- [ ] `inferExperienceSourceParser` 支持 feishu。
- [ ] 测试：source add feishu 校验；凭据拒绝；env 名通过。

## 阶段 3：路径 B adapter（CLI 优先，API 兜底）

模块：新增 `experience/feishu-client.ts` + `experience/feishu-adapter.ts`（类比 gbrain-client/adapter）
- [ ] 飞书 CLI 方式：调 wrapper 可执行，注入 env，拉文档/消息 JSON。
- [ ] 飞书 API 方式：env 名换 tenant_access_token；非 HTTPS（除 loopback）拒绝。
- [ ] `feishu-doc` parser：文档→canonical Markdown chunk，保留 title/编辑时间/doc token 作 source_ref。
- [ ] `feishu-chat` parser：群消息按话题段切块，丢系统/纯闲聊，保留 chat+message 范围作 source_ref。
- [ ] 接入 `resolveExperienceSource`。
- [ ] 测试：mock CLI/API 拉取；doc/chat parser；source_ref 形状；非 HTTPS 拒绝。

## 阶段 4：强隐私门（B 核心）

模块：`experience/privacy-triage.ts`
- [ ] 飞书专属硬拦截：user_id/open_id/union_id/chat_id 原值视为私有标识必须脱敏；手机/邮箱/证件/卡号/token/cookie 硬拦截。
- [ ] 1v1 私聊默认 reject；群消息默认 review；公开知识库文档走常规 triage。
- [ ] 不确定 → human-required；HTML 只显脱敏摘要+原因码。
- [ ] 测试：1v1 reject；PII/飞书 id 硬拦截；群 review；leak scan。

## 阶段 5：doctor + 验收门

模块：cli `source.ts` doctor；`experience/team-release-audit.ts`
- [ ] `source doctor <feishu>`：CLI/API 可达、HTTPS、env 凭据存在（不打印）、target 可读。
- [ ] team-release-audit 加 `feishu_source_a_ga` / `feishu_source_b_ga` / `feishu_privacy_ga`。
- [ ] 测试：doctor 各分支；门分类。

## 阶段 6：真实验收 + status

- [ ] 用 mock fixture 跑 A+B 完整链路（source add→doctor→daily→audit）。
- [ ] team release-audit 中 feishu 三门 + team_ga 全绿。
- [ ] 确认原文不入 Git（grep 飞书原始 id/正文）。
- [ ] 写 `docs/status/m30-feishu-source-integration-<date>.md`。
- [ ] `pnpm check` 通过。

## 测试矩阵

| 领域 | 单测 | 集成/BDD |
| --- | --- | --- |
| A: feishu-channel openclaw + review-first | ✓ | ✓ |
| B: schema/config + 凭据拒绝 | ✓ | ✓ |
| B: CLI/API adapter + doc/chat parser | ✓ | ✓ |
| 强隐私门（1v1 reject/PII/飞书 id） | ✓ | ✓ |
| doctor + feishu 验收门 | ✓ | ✓ |

## 风险

- 飞书聊天 PII 泄漏 → 最强 deterministic 硬拦截 + 1v1 默认 reject + leak scan，原文永不入 Git。
- 误把飞书当权威 → 飞书永远是 source，权威仍是 review/promote 后的 kb/skills。
- 凭据落盘 → 只存 env 名，`assertNoConfigCredential` 守护 + 单测。
- 真实拉取私密数据做测试 → 一律用 mock fixture，禁止 CI 连真实飞书。
