# AI-First Experience Distill Tasks

## 1. AI Provider Configuration

- [ ] Add protocol schema for `ai_provider_config`.
- [ ] Add `.praxisbase/ai/config.json` path constants.
- [ ] Add `praxisbase ai init --provider openai-compatible --model <model> --json`.
- [ ] Add `praxisbase ai doctor --json`.
- [ ] Ensure secrets are read from env vars and never written to config or reports.
- [ ] Add tests for config creation, missing env diagnostics, and no secret leakage.

## 2. AI Client Boundary

- [ ] Add an internal AI client interface with a mock implementation for tests.
- [ ] Add provider adapter for OpenAI-compatible chat/completions or responses-style JSON output.
- [ ] Enforce request timeout, max input bytes, max output bytes, and structured JSON parsing.
- [ ] Add tests for timeout, invalid JSON, schema mismatch, and successful schema output.

## 3. Source Chunking

- [ ] Add chunk model with `source_ref`, `source_hash`, `chunk_id`, `chunk_hash`, scope, agent, channel, and bounded text.
- [ ] Add Codex session chunker that prefers final summaries, changed files, commands, and test outcomes.
- [ ] Add OpenClaw sqlite/export chunker that preserves OpenClaw memory refs.
- [ ] Add Claude Code repair-log chunker.
- [ ] Add tests that chunkers skip unsupported formats, cap bytes, and do not include raw credential files.

## 4. Privacy Precheck And Postcheck

- [ ] Split privacy checks into `pre_ai`, `post_ai`, and `team_gate` decisions.
- [ ] In personal mode, allow safe local transcript chunks to be summarized without committing raw content.
- [ ] In team mode, reject personal/private chat material before AI distill.
- [ ] Route private keys, tokens, cookies, auth headers, and credential dumps to human-required or reject.
- [ ] Add tests for personal safe transcript, personal secret transcript, team personal-scope rejection, and post-AI leak rejection.

## 5. Distill Service

- [ ] Add `DistillInput` and `DistilledExperience` schemas.
- [ ] Add prompt builder that instructs AI to extract reusable experience, verification, failed attempts, risks, wiki kind, and skill candidate.
- [ ] Add distill orchestrator that validates output and writes `.praxisbase/reports/ai-distill/*.json`.
- [ ] Add tests for success, malformed AI response, privacy postcheck failure, and per-item report counts.

## 6. Daily Integration

- [ ] Make production `praxisbase daily run` require configured AI distill by default.
- [ ] Add `--degraded` and `--no-ai` flags that explicitly use deterministic fallback.
- [ ] Extend daily reports with `ai_distill` status.
- [ ] Feed distilled experience into envelope ingest and wiki compile.
- [ ] Add tests for missing AI failure, degraded success, production AI success, and daily report fields.

## 7. Wiki And Skill Proposal Quality

- [ ] Update wiki analysis to prefer distilled fields over keyword-only inference.
- [ ] Generate proposal bodies from problem, actions, failed attempts, outcome, verification, and reusable lessons.
- [ ] Generate skill proposal candidates only when repeated triggers/procedures are observed.
- [ ] Add tests for known-fix, procedure, pitfall, decision, preference, and skill candidate proposal generation.

## 8. First-Run Agent Bootstrap

- [ ] Add `praxisbase bootstrap personal --agent <agent> --install-skill --json`.
- [ ] Generate agent-readable setup instructions for Codex/OpenClaw/OpenCode compatible workflows.
- [ ] Discover local Codex App, Codex cliproxyapi, OpenClaw sqlite, and OpenClaw reports without adding secret-bearing root directories.
- [ ] Print exact next commands and generated HTML path.
- [ ] Add tests for generated skill content, source discovery, and no secret path overreach.

## 9. Documentation And Smoke

- [ ] Update README quickstart to show AI-first daily flow.
- [ ] Add user docs for personal mode and team Git mode.
- [ ] Add real smoke docs for AI configured and degraded modes.
- [ ] Run `pnpm check`.
- [ ] Run a mocked AI daily smoke in tests.
- [ ] Manually verify local personal daily does not produce excessive human-required for safe Codex sessions.

## 10. Bounded Production Operations

- [x] Add per-provider AI request timeout configuration.
- [x] Add CLI support for `daily run --max-ai-chunks <n>`.
- [x] Add CLI support for `ai init --ai-timeout-ms <n>` and `daily run --ai-timeout-ms <n>`.
- [x] Add CLI support for bounded AI concurrency and curation proposal budgets.
- [x] Stop production AI distill when the run-level chunk budget is reached.
- [x] Bound local transcript source scanning by the run AI budget and use linear multibyte text chunking.
- [x] Write chunk-level live daily progress snapshots under `.praxisbase/runs/live/`.
- [x] Add tests for timeout behavior and chunk-budget enforcement.
- [x] Document workspace wiki filter rules and bounded daily controls.
