# GBrain Backend Interop

PraxisBase is the governed experience compiler. GBrain is the preferred long-term brain runtime for broad search, graph retrieval, MCP access, and team-facing brain storage.

## Personal First Run

Configure AI and local sources first:

```bash
praxisbase personal init --agent codex --json
praxisbase ai init --provider openai-compatible --model <model> --json
praxisbase personal doctor --json
```

Configure GBrain once per machine:

```bash
praxisbase gbrain init --executable gbrain --source praxisbase --json
praxisbase gbrain doctor --json
```

Run the daily loop and publish only promoted stable pages:

```bash
praxisbase daily run --mode personal --build-site --publish-gbrain --json
praxisbase context get --agent codex --stage diagnosis --query "openclaw auth" --with-gbrain --json
```

GBrain sidecar hits are recall context. They do not become PraxisBase promotion evidence until explicitly imported:

```bash
praxisbase gbrain import --source praxisbase --query "openclaw auth" --write --json
```

## Remote GBrain

Use a remote MCP endpoint when another machine or a team service owns the brain runtime:

```bash
praxisbase gbrain init --remote \
  --issuer-url https://auth.example.com \
  --mcp-url https://gbrain.example.com/mcp \
  --oauth-client-id praxisbase \
  --secret-env GBRAIN_BEARER_TOKEN \
  --source praxisbase \
  --json
```

Secrets are referenced by environment variable name only. Non-HTTPS remote MCP URLs are rejected unless they are loopback URLs.

## Team GitLab Authority

For team mode, the GitLab-reviewed PraxisBase repo remains the authority. GBrain is an index and agent access layer.

```bash
praxisbase gbrain init --remote \
  --issuer-url https://auth.example.com \
  --mcp-url https://gbrain.example.com/mcp \
  --oauth-client-id praxisbase-team \
  --secret-env GBRAIN_TEAM_TOKEN \
  --source team-praxisbase \
  --federated-read team-praxisbase \
  --json

praxisbase daily run --mode team-git --branch harvest/daily --commit --push --build-site --json
praxisbase gbrain export --mode team --allow-team-export --write --json
```

Team export requires the explicit allow flag and exports only stable `team` or `org` scoped pages. Personal, project, raw, rejected, and human-required material is skipped.

## AgentMemory Migration

AgentMemory remains useful for session-level recall. It is optional and lower authority than stable PraxisBase wiki pages and GBrain long-term brain search.

Recommended split:

- Use GBrain MCP or `context get --with-gbrain` for broad personal/team brain lookup.
- Use PraxisBase CLI for governed capture, privacy, review, promotion, and stable wiki/skill generation.
- Keep AgentMemory as an optional sidecar for short-lived session memory.
- Export only stable wiki pages to AgentMemory with `praxisbase agentmemory export --mode personal --write --json`.

## Compatibility Notes

When GBrain is configured, PraxisBase should not expand into a second general brain runtime. PB-only retrieval, MCP, and team-brain surfaces are compatibility paths for offline or locked-down deployments. The stable authority remains:

```text
raw evidence -> AI distill -> wiki/skill candidate -> review/privacy gates -> promote -> kb/skills -> optional GBrain publish
```

Final verification for this integration:

```bash
pnpm test tests/core/gbrain-adapter.test.ts tests/core/gbrain-export.test.ts tests/cli/gbrain-command.test.ts tests/core/gbrain-config.test.ts tests/core/gbrain-remote.test.ts tests/core/experience-context.test.ts tests/cli/daily-command.test.ts tests/core/wiki-render-site.test.ts tests/core/agent-access.test.ts
pnpm check
```
