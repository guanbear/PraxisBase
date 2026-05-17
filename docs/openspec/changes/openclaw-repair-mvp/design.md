# OpenClaw Repair MVP Design

## Overview

This change builds the first executable PraxisBase slice: OpenClaw sandbox repair as an agent knowledge substrate. The system is file-first and CLI-first. Agents interact through generated bundles and inbox/outbox files; CI and reviewer agents process proposals into stable Git-backed knowledge.

## Runtime Flow

```text
OpenClaw sandbox issue
  -> repair agent starts
  -> praxisbase repair-context openclaw --logs ...
  -> agent repairs and verifies inside sandbox
  -> praxisbase episode submit episode.json
  -> praxisbase propose proposal.json
  -> scheduled praxisbase review --auto
  -> scheduled praxisbase promote --auto
  -> praxisbase build regenerates bundles
  -> next agent fetches improved context
```

## Storage Surfaces

| Surface | Purpose |
| --- | --- |
| `.praxisbase/inbox/episodes` | Validated submitted repair episodes |
| `.praxisbase/inbox/proposals` | Validated submitted knowledge proposals |
| `.praxisbase/inbox/reviews` | AI reviewer decisions |
| `.praxisbase/outbox` | Local retry queue when authority repo is unavailable |
| `kb/known-fixes` | Reviewed stable known fixes |
| `kb/procedures` | Reviewed stable procedures |
| `skills/openclaw` | Agent-facing repair skills |
| `dist/repair-bundles` | Generated context bundles for agents |

## Core Components

### Protocol Schemas

Implement Zod schemas for:

- `Episode`
- `Proposal`
- `Review`
- `KnownFixFrontmatter`
- `Evidence`

Every schema must require `protocol_version: "0.1"`.

### Repair Context

MVP signature detection is deterministic:

- auth expired logs map to `openclaw:claude-auth-expired`
- workspace lock logs map to `openclaw:workspace-lock-stuck`
- missing Node runtime logs map to `openclaw:node-runtime-missing`
- unknown logs map to `openclaw:unknown`

For `openclaw:claude-auth-expired`, return a bundle with:

- baseline diagnostics skill
- auth repair skill
- auth expired known fix
- diagnostic commands
- forbidden operations
- verification steps
- rollback steps
- escalation conditions

### Review

Risk classification:

- `archive` is high risk.
- `policy` and `decision` changes are high risk.
- `skill`, `known_fix`, and `procedure` changes are medium risk unless only linking.
- note/link metadata changes are low risk.

Auto-merge requires:

- decision `approve`
- risk `low` or `medium`
- confidence `>= 0.75`
- evidence source URI
- evidence hash
- verification text

### Promotion

Promotion writes only to stable knowledge paths:

- `kb/**`
- `skills/**`

Promotion must reject any proposal patch path outside those prefixes.

### Build

Build generates:

- `dist/repair-bundles/openclaw-sandbox.json`
- `dist/repair-bundles/manifest.json`
- `dist/kb-index.json`
- `dist/search-index.json`
- `dist/llms.txt`
- `dist/index.html`

The manifest includes protocol version, bundle path, checksum, generated time, commit SHA when available, and compatible CLI version.

## Failure Handling

- If bundle fetch fails, agents use last-known-good cache.
- If episode/proposal submission fails, agents write to `.praxisbase/outbox`.
- If promotion patch conflicts, proposal returns to review queue with status `conflict`.
- If review confidence is below threshold, proposal enters human exception queue.

## Security Boundary

Repair bundles must include:

- allowed action class
- forbidden operations
- verification steps
- rollback steps
- escalation condition

OpenClaw repair may operate inside the sandbox. Production-impacting actions are out of scope for automatic execution.
