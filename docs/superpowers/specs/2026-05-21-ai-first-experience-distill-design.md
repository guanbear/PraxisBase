# AI-First Experience Distill Design

## Product Position

PraxisBase must use AI to produce production-quality experience knowledge. The deterministic pipeline is still required, but it is the safety kernel and degraded fallback, not the product's main intelligence.

The target user experience is:

```bash
praxisbase bootstrap personal --agent codex --install-skill --json
praxisbase ai init --provider openai-compatible --model <model> --json
praxisbase ai doctor --json
praxisbase daily run --mode personal --build-site --json
open dist/index.html
```

After setup, daily runs collect local and remote agent experience, use AI to distill reusable lessons, generate reviewable wiki/skill proposals, update the human-readable site, and make safe context available to later agents.

## Current Gap

The existing implementation can scan configured sources, write experience envelopes, generate raw-vault refs, compile the wiki, build the site, and serve agent context. It does not yet have a first-class AI distill core.

Current extraction is deterministic:

- Codex summaries rely on keyword lines.
- OpenClaw signatures rely on known patterns.
- wiki proposal classification relies on regex and simple semantic signatures.
- privacy detection sees full transcripts and often sends them to `human_required`.

That is safe, but not sufficient for the project goal. It cannot reliably extract failed attempts, reusable lessons, verification evidence, team-safe summaries, or skill candidates from noisy sessions.

## Design Principle

AI distill is required for production daily knowledge synthesis.

Deterministic code must still own:

- source identity and hashes;
- chunk boundaries and byte budgets;
- privacy prechecks and postchecks;
- schema validation;
- proposal boundaries;
- review/promote gates;
- graph, site, and context rendering.

AI must own:

- semantic summarization;
- reusable lesson extraction;
- failed-attempt extraction;
- suggested wiki kind;
- skill-candidate detection;
- clearer human-facing explanation.

## Architecture

Add four units.

### AI Provider Config

`praxisbase ai init` writes `.praxisbase/ai/config.json` with provider metadata only. Secrets are referenced by env var names.

`praxisbase ai doctor` verifies the config and credentials. It must never print secret values.

### Chunk And Privacy Gate

Source adapters produce bounded chunks before AI distill. Each chunk has:

- source id/ref/hash;
- chunk id/hash;
- agent and channel;
- scope hint;
- bounded text;
- provenance metadata.

Privacy precheck decides whether a chunk can be sent to AI. Privacy postcheck scans AI output before it enters any downstream artifact.

### Distill Service

The distill service sends schema-constrained prompts to an AI client and validates the response as `DistilledExperience`.

The output captures:

- problem;
- context;
- actions;
- failed attempts;
- outcome;
- verification;
- reusable lessons;
- risks;
- tags;
- suggested wiki kind;
- skill candidate;
- confidence.

Invalid AI responses, timeouts, and privacy postcheck failures are recorded in `.praxisbase/reports/ai-distill/`.

### Daily And Wiki Integration

Production `daily run` requires configured AI unless `--degraded` or `--no-ai` is explicit.

AI-distilled experience feeds:

- experience envelopes;
- raw-vault refs;
- capture records;
- wiki proposal generation;
- skill proposal generation;
- site recent knowledge summaries;
- `context get`.

Stable `kb/` and `skills/` still require review/promote.

## Personal And Team Privacy

Personal mode should be useful without being reckless.

- Raw local transcripts can stay in ignored local storage.
- Safe AI summaries can enter personal context and local wiki artifacts.
- Personal summaries cannot auto-promote to team/org.
- Human-required should mean genuinely unsafe or ambiguous, not merely "this was a transcript".

Team mode is stricter.

- Personal scope is rejected.
- Private chat and direct-message hints are rejected.
- Raw logs and full transcripts cannot become proposal body.
- Uncertain scope becomes human-required.
- AI cannot overrule deterministic team privacy gates.

## First-Run Agent Skill

The first-run agent path needs a generated instruction/skill that tells Codex/OpenClaw/OpenCode how to initialize PraxisBase.

It should cover:

1. run AI doctor;
2. initialize AI config if missing;
3. discover safe local source paths;
4. avoid secret-bearing root directories;
5. run degraded smoke only when AI is absent;
6. run production daily when AI is ready;
7. open or report `dist/index.html`;
8. retrieve context for future agents;
9. explain human-required counts without printing private content.

## Success Criteria

- A normal daily run without AI config fails with `AI_DISTILL_NOT_CONFIGURED`.
- An explicit degraded daily run succeeds but reports `production_ready: false`.
- With mocked AI, daily run distills Codex/OpenClaw chunks and creates structured summaries.
- Safe personal transcripts do not all become human-required.
- Team personal/private material is blocked before AI proposal generation.
- Wiki proposals use distilled fields rather than keyword-only summaries.
- Generated bootstrap skill is sufficient for a new Codex session to initialize the project.

## Out Of Scope

- Live model calls in deterministic tests.
- Vector database dependency.
- MCP as a required integration.
- AI direct writes to stable knowledge.
- Storing secrets in `.praxisbase/ai/config.json`.
