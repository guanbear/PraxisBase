# Design

## Language Configuration

PraxisBase reads `.praxisbase/config.yaml` plus environment overrides:

- `language`
- `ui_language`
- `content_language`
- `PRAXISBASE_LANGUAGE`
- `PRAXISBASE_UI_LANGUAGE`
- `PRAXISBASE_CONTENT_LANGUAGE`

The project seed and this repository default all three to `zh-CN`. Prompt builders receive a compact language instruction so titles, summaries, section headings, and reusable guidance use Simplified Chinese while commands, paths, identifiers, model names, and product names remain unchanged.

## Coverage Model

Daily runs build `experience_coverage` by joining safe identifiers only:

1. Latest privacy triage items by `source_id` / `source_ref`.
2. Current lesson report source refs and states.
3. Existing inbox proposal source refs and titles.
4. Stable KB path existence when a proposal target has already been promoted.

Each row receives one status: `raw_only`, `privacy_blocked`, `low_signal_rejected`, `lesson_only`, `wiki_evidence`, `proposal`, or `stable_kb`.

## Team Low-Signal Handling

Team auto-review still requires an explicit sanitized summary. If that summary is detected as greeting-only / low-signal, the triage decision becomes `rejected_low_signal`. This keeps the manual privacy queue focused on uncertain or risky records instead of harmless non-experience chatter.

## UI

`review.html` renders a coverage section with aggregate counts and per-source rows. The top navigation includes a language selector that persists the UI preference in localStorage for lightweight client-side switching of basic browser chrome, while build-time config controls generated content language.

## Risk Controls

- Coverage rows use source ids, counts, decisions, proposal titles, and stable paths only.
- Raw excerpts, Feishu identifiers, and raw memory text are not rendered in the coverage table.
- Team mode remains review-first for non-low-signal records unless sanitized AI review explicitly releases them.
