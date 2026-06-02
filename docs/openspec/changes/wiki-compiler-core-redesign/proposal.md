# Wiki Compiler Core Redesign Proposal

## Why

PraxisBase currently proves that the daily agent-memory loop can collect evidence, run AI distill, create proposals, promote stable markdown, and render HTML. Real output shows the kernel is still too source-centric:

- one evidence item can become one page;
- duplicated source hashes produce multiple near-identical stable pages;
- pages can contain template or raw-ish text;
- existing stable wiki pages are not selected for update/merge;
- promoted pages can be isolated with no wikilinks or related metadata.

That does not satisfy the original LLM Wiki idea. The wiki must be a persistent, compounding artifact that the LLM maintains over time. Raw evidence is input. Stable wiki pages are synthesized, merged, linked, provenance-rich knowledge.

## What Changes

- Add an observation layer between evidence and proposals.
- Add canonical topic clustering based on normalized problem/action/entity signatures, not source ids.
- Add existing wiki lookup and page planning: `create`, `update`, `merge`, `supersede`, or `archive`.
- Update AI synthesis so it receives existing page content and related pages.
- Add deterministic promotion quality gates before review/auto-promote.
- Extend reports and site output so users can see created, updated, merged, blocked, and human-required counts.

## Non-Goals

- Do not replace harvest, remote OpenClaw, daily runs, privacy triage, Skill, MCP, GitLab, or static site.
- Do not directly write stable `kb/` from compile/curate.
- Do not add a separate experience page. The generated wiki pages are the experience surface.
- Do not require MCP. Skill+CLI remains the default agent interface.

## Acceptance

- Repeated ACK timing evidence produces one canonical proposal/update, not several duplicate pages.
- Repeated stdin-closed evidence produces one canonical proposal/update, not several duplicate pages.
- Existing matching pages receive update/merge plans.
- Duplicate source hashes cannot create multiple stable pages without human split approval.
- Quality gates block raw JSON, transcript fragments, template fallback text, reference-only docs, missing provenance, unsafe paths, and wrong create-vs-update plans.
- Personal auto-promote works only for low-risk proposals that pass the quality gate.
- Reports and site output explain why proposals were written, blocked, merged, or marked human-required.

