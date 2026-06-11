# GBrain Backend Interop Implementation Plan

## Goal

Add GBrain as the preferred long-term brain backend while keeping PraxisBase focused on governed agent experience compilation. Do this by introducing a backend seam, moving AgentMemory behind it, then adding local and remote GBrain adapters.

## Guardrails

- Do not rewrite the wiki compiler, semantic review, privacy gates, or promotion audit.
- Do not make GBrain required for core PB commands.
- Do not import GBrain core modules directly in the first implementation; use CLI/MCP adapters.
- Do not install GBrain on every run; detect local install or configured remote endpoint.
- Do not export raw evidence or human-required material.
- Do not store bearer/client secrets in reports.
- Keep AgentMemory working as an optional sidecar.
- Treat GitLab/Git-reviewed PB `kb/skills` as team authority.

## Phase 1: Backend Seam

Files likely involved:

- `packages/core/src/experience/agentmemory-client.ts`
- `packages/core/src/experience/agentmemory-adapter.ts`
- `packages/core/src/experience/agentmemory-export.ts`
- `packages/core/src/experience/source-config.ts`
- `packages/core/src/experience/source-adapters.ts`
- `packages/core/src/protocol/schemas.ts`
- `packages/cli/src/commands/agentmemory.ts`

Tasks:

- Add `BrainBackend`, `BackendSource`, `BackendSink`, and `BackendRetrieval` interfaces.
- Add backend registry and typed backend diagnostics.
- Rewrap AgentMemory as a backend adapter without changing user-facing commands.
- Add tests that current AgentMemory import/export/retrieval behavior is unchanged.

Verification:

```bash
pnpm build
pnpm exec tsc -p tsconfig.tests.json
node --test dist-tests/tests/core/agentmemory-export.test.js dist-tests/tests/cli/agentmemory-command.test.js
```

## Phase 2: Local GBrain Adapter

New likely files:

- `packages/core/src/experience/gbrain-client.ts`
- `packages/core/src/experience/gbrain-adapter.ts`
- `packages/core/src/experience/gbrain-export.ts`
- `packages/cli/src/commands/gbrain.ts`

Tasks:

- Add local GBrain config schema.
- Add process-execution wrapper with timeout, JSON parse, and redacted error output.
- Implement doctor using `gbrain doctor`.
- Add bootstrap guidance for one-time `bun install -g github:garrytan/gbrain` or deterministic clone/link fallback.
- Implement retrieval using bounded `gbrain search/query --json`.
- Implement stable PB publish using `gbrain capture` or `put_page` when available.
- Add CLI command group: `praxisbase gbrain doctor|import|export`.

Tests:

- mocked successful CLI output;
- missing binary;
- timeout;
- invalid JSON;
- publish payload does not include raw evidence.

## Phase 3: Context Integration

Files likely involved:

- `packages/core/src/experience/context.ts`
- `packages/core/src/wiki/retrieval.ts`
- `packages/cli/src/commands/context.ts`
- `packages/cli/src/index.ts`

Tasks:

- Add `--with-backend <name>` repeatable option.
- Add `--with-gbrain` alias.
- Add authority labels to context items.
- Merge sidecar results after stable PB results.
- Preserve budget and citations.

Tests:

- PB stable result outranks GBrain sidecar;
- AgentMemory and GBrain can both appear;
- sidecar timeout returns warnings but successful PB context.

## Phase 4: Daily And Site Publication

Files likely involved:

- `packages/core/src/experience/daily.ts`
- `packages/core/src/wiki/render-site.ts`
- `packages/cli/src/commands/personal.ts`
- `packages/core/src/agent-access/skill.ts`

Tasks:

- Add optional post-promotion publish step.
- Add report fields for backend health, publish counts, skipped counts, and warnings.
- Add personal bootstrap hints for PB + GBrain.
- Add site cards for backend status and publish status.
- Update generated agent skill: broad brain lookup goes through GBrain; governed experience operations go through PB.

Tests:

- GBrain unavailable does not block daily;
- publish runs only after stable promotion;
- site renders backend status without exposing secrets.

## Phase 5: Remote GBrain

Files likely involved:

- `packages/core/src/experience/gbrain-mcp-client.ts`
- `packages/core/src/experience/gbrain-adapter.ts`
- `packages/cli/src/commands/source.ts`
- `packages/cli/src/commands/gbrain.ts`

Tasks:

- Add remote MCP/OAuth config.
- Add unsafe bearer blocking for non-HTTPS non-loopback endpoints.
- Add remote retrieval and publish through MCP operations.
- Add team source-scope diagnostics.
- Add redaction tests.

Tests:

- unsafe HTTP with bearer blocked;
- HTTPS accepted;
- missing secret env var warns;
- team source mismatch blocks export.

## Phase 6: Team Mode And Migration

Files likely involved:

- `packages/core/src/privacy/*`
- `packages/core/src/wiki/promotion-*`
- `packages/core/src/experience/daily.ts`
- docs and generated skills.

Tasks:

- Add explicit team policy for GBrain export.
- Require team-safe privacy verdict and promotion audit before team publish.
- Add migration guide from AgentMemory-default to GBrain-default.
- Add docs explaining PB no longer expands general brain runtime features when GBrain is configured.

Verification:

```bash
pnpm check
pnpm build
pnpm exec tsc -p tsconfig.tests.json
node --test dist-tests/tests/core/*gbrain*.test.js dist-tests/tests/cli/*gbrain*.test.js
```

## Rollout Order

1. Land backend seam with AgentMemory unchanged.
2. Land local GBrain doctor/retrieval.
3. Land GBrain export of stable PB knowledge.
4. Land context merge and daily integration.
5. Land remote MCP/OAuth.
6. Land team-mode publish policy.

This order keeps existing personal workflows working while gradually moving long-term brain responsibilities to GBrain.
