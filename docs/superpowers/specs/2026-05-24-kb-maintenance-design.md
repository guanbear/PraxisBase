# KB Maintenance Design

## Problem

Previous versions could leave low-quality generated markdown physically under `kb/`. The current retrieval/site layers hide bad `kb/` pages with `promotionTimeGuard`, but local users still need a direct maintenance command to find and remove historical bad stable pages before rebuilding the wiki.

## Goals

- Provide `praxisbase kb audit` to inspect local `kb/**/*.md` without mutation.
- Provide `praxisbase kb prune` as dry-run by default, deleting only with `--yes`.
- Provide `praxisbase kb rebuild` to prune bad pages and then reuse the existing daily/wiki flow.
- Keep the llm-wiki kernel invariant: raw evidence is compiled/synthesized into candidate wiki pages, then reviewed/promoted; maintenance must not write new stable knowledge directly.

## Non-Goals

- Do not audit or delete `skills/**` in this first version.
- Do not invent a second wiki quality policy.
- Do not delete raw vault, inbox, reports, `dist`, or non-markdown files.
- Do not auto-repair bad pages in place.

## Design

`packages/core/src/kb/maintenance.ts` owns stable local maintenance:

- Recursively scan only `kb/**/*.md`.
- Read each page through `safePath`.
- Evaluate content with `promotionTimeGuard(content)`.
- Return a structured report with `checked`, `passed`, `failed`, `findings`, `deleted`, and `dry_run`.
- Delete only failing files when prune receives `yes: true`.
- After confirmed deletion, scan remaining `kb/**/*.md` pages and convert wikilinks targeting deleted page slugs into plain text so pruning does not leave broken wiki graph edges.

`packages/cli/src/commands/kb.ts` owns CLI formatting:

- `audit`: returns the report.
- `prune`: defaults to dry-run; `--yes` enables deletion.
- `rebuild`: first runs prune, then calls `runDailyExperience` with the requested mode/build-site options.

## Safety

- Deletion is physically constrained to `kb/**/*.md` and resolved through `safePath`.
- `prune` without `--yes` must never mutate.
- `prune --yes` may mutate remaining `kb/**/*.md` only to remove wikilinks pointing at pages it deleted in the same run.
- `rebuild` must not bypass review/promote gates by writing wiki pages itself.
- Existing user-authored valid pages are preserved when `promotionTimeGuard` passes.

## Acceptance

- A bad `kb/` markdown page is reported by `audit`.
- `prune --dry-run` reports the same bad page and leaves it on disk.
- `prune --yes` deletes only the failing `kb/` markdown page.
- `prune --yes` removes wikilink markup pointing to deleted pages while preserving the visible link label as text.
- Valid pages and `skills/**` files are not deleted.
- CLI JSON reports are stable and machine-readable.
