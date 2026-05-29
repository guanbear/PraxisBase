# M25 Memory-First Experience Distillation Tasks

## 1. Schemas And Reports

- [ ] Add `ExperienceLesson`, `EvidenceSpan`, `SourceInventoryItem`, lesson state, portability, cue family, and privacy abstraction schemas.
- [ ] Add report paths for source inventory, lesson extraction, lesson cache, golden validation, and runtime lesson injection.
- [x] Add protocol cache path for AI lesson extraction cache at `.praxisbase/cache/lesson-extract`.
- [x] Add protocol cache path for governed lesson state cache at `.praxisbase/cache/lesson-state`.
- [x] Add local-only staging path for trusted remote OpenClaw raw evidence at `.praxisbase/staging/trusted-remote-openclaw`.
- [ ] Export new schemas from `packages/core/src/index.ts`.
- [ ] Add integration-contract report fields that show when lesson clusters outrank legacy distill summaries, GBrain hits, and AgentMemory hits.

## 2. Source Inventory And Span Mapping

- [ ] Add memory-first source inventory for local files, sqlite rows, reports, sessions, skills, and sidecar imports.
- [ ] Parse markdown memory files by headings, bullets, paragraphs, and byte ranges.
- [ ] Split long memory files into spans instead of skipping the file.
- [ ] Prioritize `MEMORY.md`, `TOOLS.md`, native memory, and self-authored skills ahead of ordinary logs.
- [ ] Add source inventory tests for long OpenClaw memory files and mixed Codex/OpenClaw source directories.
- [x] Add JSONL/log session span extraction for Codex/OpenCode/Claude-style records with `json_message`, `tool_call`, and `tool_result` span kinds.
- [x] Stage trusted personal remote OpenClaw raw MEMORY/TOOLS/report/sqlite-query material before M25 lesson extraction instead of relying only on sanitized envelopes.
- [x] Extract nested OpenClaw JSON export text/tool fields as evidence spans.

## 3. Signal Planner

- [ ] Add span scoring by source kind, authority hint, explicit lesson markers, failure/fix/verification markers, repetition, and user-authored/native-memory hints.
- [ ] Reserve a minimum span budget for memory files before logs.
- [ ] Include neighboring heading context for selected spans.
- [ ] Include planner identity in cache keys.
- [ ] Add tests proving newest logs cannot crowd out high-priority memory spans.

## 4. Deterministic Lesson Extraction

- [ ] Add deterministic extraction for explicit preferences, vetoes, decisions, unresolved tasks, reflections, repeated failures, tool sequences, and verified fixes.
- [ ] Preserve source refs, source hashes, and evidence span ids in every extracted seed.
- [ ] Add tests based on OpenHuman-style transcript ingest behavior without copying OpenHuman code.

## 5. LLM Lesson Extraction

- [ ] Add strict JSON lesson extractor prompts and zod validation.
- [ ] Add malformed-output repair and quarantine.
- [x] Add AI lesson extraction cache identity using prompt version, CLI/daily model identity, agent, scope, source hash, span id, and excerpt hash.
- [ ] Include planner/reducer/parser identity in lesson AI cache keys where reduced or planned span inputs affect extraction.
- [ ] Require `safe_claim`, `portability`, `privacy_tier`, `applies_to_agents`, `applies_to_systems`, and evidence spans.
- [ ] Add tests that weak one-off run reports return no lesson.

## 6. Privacy Abstraction

- [ ] Add abstraction rules for hostnames, IPs, paths, key paths, accounts, raw platform user ids, private wrapper commands, and private remote names.
- [ ] Add team-mode stricter routing for personal/private evidence.
- [ ] Block stable output leakage into `kb/`, `skills/`, `dist/`, GBrain export, and AgentMemory export.
- [ ] Add tests with remote OpenClaw private details.

## 7. Lesson Stability And Dedupe

- [x] Add lesson candidate cache with states: `candidate`, `provisional`, `active_personal`, `wiki_ready`, `skill_ready`, `forgotten`, `rejected`.
- [x] Add scoring by confidence, cue family, source count, agent count, verification, observation count, privacy tier, duplicate status, and user override.
- [x] Add pin/forget/dismiss/reject behavior for personal lessons.
- [x] Add semantic duplicate grouping and contradiction routing.

## 8. Wiki Compiler Integration

- [ ] Feed wiki curation from lesson clusters rather than raw evidence summaries.
- [ ] Render wiki candidates with applicability, procedure/recommendation, verification, negative case, portability, privacy tier, links, and span provenance.
- [ ] Prefer updating existing pages before creating new pages.
- [ ] Add integration tests proving `wiki_ready` lesson clusters win when legacy distilled summaries exist for the same source.
- [ ] Add wiki quality tests proving output is synthesized and linked, not raw copied summaries.

## 9. Skill Synthesis Integration

- [ ] Feed skill synthesis from `skill_ready` lessons and stable procedural pages.
- [ ] Preserve update-before-create and umbrella-skill matching.
- [ ] Add deterministic repair for fixable skill format errors before human review.
- [ ] Keep unreviewed candidates out of normal agent injection.
- [ ] Reject promotion-eligible skill candidates that are supported only by raw logs, one-off summaries, or sidecar hits without lesson-state authority.

## 10. Runtime Personal Injection

- [ ] Add personal runtime lesson retrieval by query, agents, systems, tags, portability, and state.
- [ ] Add bounded `Relevant PB Experience` rendering through M24 context bundles.
- [ ] Ensure stable PB pages and promoted skills outrank lesson hits.
- [ ] Exclude personal runtime lessons from team bundles by default.
- [ ] Ensure GBrain and AgentMemory sidecar hits rank below stable PB context and do not count as promotion evidence unless imported through M25.

## 11. CLI And Site

- [ ] Add CLI/report surfaces for inventory, lesson extraction, lesson cache, golden validation, and injection preview.
- [x] Add explicit `lesson extract --ai` provider path while keeping default lesson inspection deterministic-only.
- [x] Reuse cached AI lesson extraction output for repeated `lesson extract --ai` CLI runs with the same model/span identity.
- [ ] Show lesson states, privacy routing, source spans, and golden validation on the HTML site.
- [ ] Keep raw private evidence hidden by default.

## 12. Golden Validation

- [x] Add local OpenClaw golden fixture and expected lesson assertions.
- [x] Add remote OpenClaw golden fixture and expected lesson assertions.
- [x] Assert local fixture extracts at least 5 of 8 targets.
- [x] Assert remote fixture extracts at least 6 of 8 targets.
- [x] Assert every target lesson has evidence spans and no private leakage.

## 13. Real Smoke

- [x] Run a small personal daily against local OpenClaw and Codex sources with AI configured.
- [x] Run remote trusted personal OpenClaw source fetch/import if credentials are available.
- [x] Confirm trusted remote OpenClaw lesson extraction uses staged raw evidence rather than envelope-only JSON.
- [ ] Inspect generated wiki candidates and lesson cache quality.
- [ ] Inspect HTML site for useful lesson visibility.
- [ ] Record unresolved quality gaps before full daily.
- [ ] Confirm reports show which outputs came from `active_personal`, `wiki_ready`, `skill_ready`, stable PB pages, GBrain sidecars, and AgentMemory sidecars.
