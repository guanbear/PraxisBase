# M30 Feishu Source Integration — OpenSpec Design

Full rationale: `docs/superpowers/specs/2026-06-05-m30-feishu-source-integration-design.md`. This file records implementation-facing decisions.

## Decisions

### D1. Two paths, shared downstream

Path A (OpenClaw Feishu plugin) and Path B (Feishu CLI/API) both produce `ExperienceEnvelope`s that flow through the same privacy triage → reducer → distill → review/promote lane. Feishu is always a source; authority remains reviewed `kb/`/`skills/`. Raw Feishu content never enters Git.

### D2. Path A is minimal reuse

`channel=feishu` already exists. Path A adds no new adapter. It only: (a) forces team review-first for feishu-channel OpenClaw sources (disables `trusted_personal_remote`), and (b) reports feishu-channel share. The OpenClaw Feishu plugin is a peer (like sre-autopilot); PraxisBase does not implement it, only consumes its openclaw-export output.

### D3. Path B schema additions

```text
ExperienceSourceTypeSchema   += "feishu"
ExperienceSourceParserSchema += "feishu-doc", "feishu-chat"
ExperienceSourceAgentSchema  += "feishu"
```
Config fields: `feishu_app_id_env`, `feishu_app_secret_env` (env names only), `feishu_target` (doc token / wiki space id / chat id — not a credential), `feishu_cli_path` (optional wrapper). `assertNoConfigCredential` rejects literal credentials.

### D4. CLI preferred, API fallback

`feishu-client.ts` supports two transports: (1) a configured Feishu CLI executable/wrapper (env-injected, like the gbrain executable pattern); (2) Feishu Open Platform API (env-name app id/secret → tenant_access_token). Non-HTTPS API endpoints rejected unless loopback.

### D5. Parsers

- `feishu-doc`: doc/wiki page → canonical Markdown chunk via context reducer; source_ref = doc token; keep title + last-edited time.
- `feishu-chat`: group messages chunked by topic segment (not per-message); drop system/idle chatter; source_ref = chat id + message id range.

### D6. Strong privacy gate (B)

Reuse `privacy-triage.ts` `containsConcretePrivateValue` + `redactForTriage`, extend with Feishu rules:
- Feishu user_id/open_id/union_id/chat_id raw values treated as private identifiers → must be redacted.
- 1v1 DM → default `reject` (never distilled).
- Group messages → default `human_required`/review.
- Public knowledge-base docs → normal triage.
- Phone/email/ID/card/token/cookie hard-blocked before envelope creation.
- Feishu sources cannot use `trusted_personal_remote`.

### D7. Doctor + gates

`source doctor <feishu>` checks CLI/API reachability + HTTPS + env-credential presence (no value printed) + target readability. `team release-audit` gains `feishu_source_a_ga`, `feishu_source_b_ga`, `feishu_privacy_ga`.

## Affected Modules

- `protocol/schemas.ts` (feishu enums + config fields)
- `experience/source-config.ts` (feishu fields, parser inference, credential guard)
- new `experience/feishu-client.ts`, `experience/feishu-adapter.ts`
- `experience/source-adapters.ts` (resolve feishu source)
- `experience/privacy-triage.ts` (feishu rules, 1v1 reject, review-first for channel=feishu)
- `experience/team-release-audit.ts` (feishu gates)
- `wiki/render-site.ts` (feishu-channel share reporting)
- CLI: `source.ts` (add/doctor feishu)

## Test Matrix

A feishu-channel review-first; B schema/config + credential rejection; CLI/API adapter + doc/chat parsers + non-HTTPS rejection; 1v1 reject + PII/Feishu-id hard-block; doctor branches; feishu release-audit gates; raw content not in Git. Tests use mock Feishu fixtures only.
