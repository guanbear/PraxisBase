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

### Local PGLite And Embedding

For local personal mode, GBrain can run entirely on this machine. The common setup is:

- GBrain database: local PGLite, usually under `~/.gbrain/brain.pglite`;
- GBrain source: `praxisbase`, used only for promoted PB knowledge;
- embedding provider: local Ollama or another OpenAI-compatible embedding endpoint;
- PraxisBase: calls GBrain through `praxisbase gbrain ...`, `daily --publish-gbrain`, and `context get --with-gbrain`.

Embedding is not required for PraxisBase to ingest, review, promote, or render the wiki. It is required for useful semantic retrieval from GBrain. Without embeddings, GBrain/PB can still publish pages, but agent lookup becomes mostly lexical and weaker for "same meaning, different wording" queries.

PraxisBase should not store the embedding API key or model dimensions. Configure those in GBrain, then point PB at the GBrain executable:

```bash
praxisbase gbrain init \
  --executable /path/to/gbrain-or-wrapper \
  --source praxisbase \
  --timeout-ms 30000 \
  --json
```

If the local embedding server is OpenAI-compatible but uses a custom base URL, use a small wrapper so GBrain receives the right environment:

```sh
#!/bin/sh
export LLAMA_SERVER_BASE_URL="${LLAMA_SERVER_BASE_URL:-http://127.0.0.1:11434/v1}"
exec /path/to/bun /path/to/gbrain/src/cli.ts "$@"
```

Example known-good local setup:

- provider: `llama-server`;
- base URL: `http://127.0.0.1:11434/v1`;
- model: `hf.co/Qwen/Qwen3-Embedding-0.6B-GGUF:Q8_0`;
- dimensions: `1024`;
- GBrain engine: `pglite`.

After changing embedding model or dimensions, rebuild or reinitialize the GBrain index so the PGLite vector width matches the model. Then run:

```bash
praxisbase gbrain doctor --json
praxisbase gbrain export --mode personal --write --json
praxisbase context get --agent codex --stage diagnosis --query "openclaw routing failure" --with-gbrain --json
```

Doctor is the source of truth. A good local embedding path should show an embedding provider check, vector width consistency, and nonzero indexed pages. If GBrain reports an unhealthy overall status because of unrelated optional checks, PraxisBase can still use GBrain retrieval as long as query/export work and the embedding checks are healthy.

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
