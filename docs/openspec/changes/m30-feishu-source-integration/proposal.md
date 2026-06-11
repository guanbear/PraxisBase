# Proposal: M30 Feishu Source Integration

## Why

Teams keep real operational knowledge in Feishu docs and Feishu group chats, not only in agent memory. PraxisBase currently models `channel=feishu` only as a provenance tag for an OpenClaw bot; raw Feishu doc/chat ingestion was historically a Non-Goal. Teams now need both:

- experience already captured by an OpenClaw Feishu plugin, and
- Feishu docs/chats pulled directly via Feishu CLI or Open Platform API.

This change adds BOTH paths (user decision: support A and B together). Feishu stays a source, never a knowledge authority; raw content never enters Git.

Prerequisite: M28 team gates green. Implementation order is after M29; A lands first (minimal), B follows (new adapter + strong privacy gate).

## Change

- **Path A (OpenClaw Feishu plugin, indirect)**: keep `agent=openclaw, channel=feishu` ingestion via existing openclaw-api/ssh/http/file adapters; force team review-first for feishu-channel sources (no `trusted_personal_remote` shortcut).
- **Path B (Feishu CLI / Open Platform API, direct first-class source)**: add `source_type=feishu`, parsers `feishu-doc` / `feishu-chat`, agent `feishu`; new feishu client/adapter (CLI preferred, API fallback); credentials by env-name only.
- Strong Feishu privacy gate: 1v1 DM rejected; PII/credentials/Feishu ids (user_id/open_id/union_id/chat_id) hard-blocked and redacted; raw content never committed.
- `source doctor` for Feishu sources; extend `team release-audit` with `feishu_source_a_ga` / `feishu_source_b_ga` / `feishu_privacy_ga`.

## Scope

In scope: both ingestion paths, Feishu schema/config/adapter/parsers, strong privacy gate, doctor, release-audit gates.

Out of scope:
- Committing raw Feishu docs/chats/tokens/cookies to Git.
- Treating Feishu as a knowledge authority.
- Two-way writeback to Feishu (beyond existing incident card push in `feishu/summary.ts`).
- Storing Feishu credentials (env-name references only).
- Feishu approval workflow (exceptions stay in PraxisBase human-required queue).
- Bypassing team review-first or privacy hard-blocks.

## Success Criteria

`praxisbase team release-audit --json` reports (in addition to M28 gates):
```text
feishu_source_a_ga: pass
feishu_source_b_ga: pass
feishu_privacy_ga: pass
```

Required real checks (B uses mock Feishu CLI/API fixtures):
```bash
praxisbase source add feishu-team-docs --agent feishu --type feishu --parser feishu-doc --feishu-target <wiki-space> --scope team
praxisbase source add feishu-team-chat --agent feishu --type feishu --parser feishu-chat --feishu-target <chat-id> --scope team
praxisbase source doctor feishu-team-docs --json
praxisbase daily run --mode team-git --build-site --json
praxisbase team release-audit --json
```

Must prove: feishu-channel OpenClaw source ingested with review-first; feishu CLI/API source pulled and redacted into envelopes; 1v1 DM rejected; PII/credentials/Feishu ids hard-blocked; raw content not in Git; HTML shows only redacted summaries.

## Rollout

1. Freeze Feishu fixtures (A export, B doc/chat JSON, with PII/1v1/credential negatives).
2. Path A: feishu-channel review-first + reporting.
3. Path B: schema/config.
4. Path B: feishu client/adapter + doc/chat parsers.
5. Strong Feishu privacy gate.
6. doctor + feishu release-audit gates.
7. Real mock-fixture validation + `docs/status/` record.

Never connect CI to real Feishu with private data; tests use mocks only.
