# M25 Memory-First Experience Distillation Proposal

## Why

PraxisBase has the right governance envelope, but real personal data still shows a core quality gap: useful OpenClaw/Codex experience can remain buried in long `MEMORY.md`, session logs, reports, and agent-specific files while the wiki compiler spends budget on newer low-value chunks.

The user-provided local and remote OpenClaw summaries prove the raw memory contains high-value lessons. Those summaries must become golden validation samples, not a new input source. PraxisBase must extract comparable lessons directly from raw memory/session/log evidence.

OpenHuman's latest source confirms a useful pattern: keep a structured agent-experience layer between raw sessions and runtime injection. Its `agent_experience` modules capture post-turn tool-loop lessons, store structured lesson/reuse/avoid hints, retrieve them by query/tools/tags, and inject a bounded "Relevant Operating Experience" block. PraxisBase should borrow that mechanism independently, then apply PB's stronger privacy, provenance, wiki compilation, and review/promote governance.

## What Changes

- Add a memory-first source inventory that prioritizes `MEMORY.md`, `TOOLS.md`, native memory, self-authored skills, and verified reports before ordinary logs.
- Add evidence span mapping with source refs, source hashes, line/byte ranges, heading paths, and excerpt hashes.
- Add `ExperienceLesson` and lesson candidate schemas for reusable experience rather than raw summaries.
- Add deterministic high-precision extraction for explicit preferences, decisions, reflections, tool sequences, repeated failures, and verified fixes.
- Add LLM lesson extraction as the primary synthesis lane when AI is configured.
- Add privacy abstraction so private facts can become safe reusable lessons when possible.
- Add portability classification: `universal`, `agent_family`, `project`, `environment`, `private_instance`.
- Add lesson stability/dedupe/cache states before wiki/skill compilation.
- Feed wiki curation from lesson clusters instead of raw evidence summaries.
- Feed skill synthesis from stable procedural lesson clusters and existing wiki pages.
- Make `ExperienceLesson` the primary semantic unit for production wiki, skill, runtime, GBrain export, and AgentMemory export decisions.
- Narrow existing `DistilledExperience` summaries to compatibility, diagnostics, lesson seeding, and explicit degraded mode.
- Add golden validation fixtures for local and remote OpenClaw target lessons.
- Expose personal runtime lesson hits through the existing M24 context bundle without treating them as stable team knowledge.

## Goals

- Produce useful personal wiki/skill candidates from raw OpenClaw/Codex memory without relying on the agent to summarize first.
- Reduce raw-ish wiki pages and one-off run report candidates.
- Preserve provenance at span level.
- Let personal mode auto-activate safe high-confidence runtime lessons while keeping team mode strict.
- Make universal/project/environment/private applicability explicit.
- Prevent private host/IP/path/account/key/user-id leakage into stable wiki, skills, site, GBrain export, and AgentMemory export.
- Prevent GBrain, AgentMemory, legacy distill summaries, or runtime lesson hits from becoming promotion authorities.
- Keep PB as the governed compiler rather than merging OpenHuman, SkillClaw, GBrain, or AgentMemory runtimes.

## Non-Goals

- Do not add "agent-generated summary" as a formal trusted input source.
- Do not copy OpenHuman GPL source code, prompts, TokenJuice rules, or runtime architecture.
- Do not replace GBrain MCP, AgentMemory, or PB file-first storage.
- Do not auto-promote brand-new stable team wiki pages or team skills.
- Do not require an OpenHuman/OpenClaw/Codex plugin hook for M25 to work.
- Do not build OpenHuman's desktop UI, Memory Tree, OAuth connectors, or managed backend.
- Do not keep raw distilled summaries as a parallel production authority once lesson clusters exist.

## Acceptance

- A local OpenClaw fixture built from raw memory/session evidence extracts at least 5 of the expected golden lessons.
- A remote OpenClaw fixture built from raw memory/session evidence extracts at least 6 of the expected golden lessons.
- Every extracted target lesson cites one or more evidence spans with source ref and source hash.
- Long memory files are section-mapped and prioritized instead of skipped wholesale.
- Personal mode can auto-activate safe high-confidence lessons for runtime context injection.
- Team mode blocks or abstracts private instance details.
- Wiki candidates generated from lessons contain applicability, procedure/recommendation, verification, negative case, related links, privacy tier, and provenance.
- Skill candidates come from procedural lesson clusters or stable wiki pages and prefer update-before-create.
- Daily integration proves that when lesson clusters and legacy summaries both exist, wiki, skill, runtime, GBrain, and AgentMemory paths choose lesson-state-driven outputs.
