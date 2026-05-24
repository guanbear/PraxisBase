# Design: KB Maintenance

## Core

`auditKb(root)` scans `kb/**/*.md` and applies `promotionTimeGuard(content)`.

`pruneKb(root, { yes })` reuses the audit result. It deletes only failing `kb/**/*.md` files when `yes` is true; otherwise it is a dry run.

## CLI

`kb audit` and `kb prune` wrap core reports.

`kb rebuild` runs prune first and then delegates to `runDailyExperience`. It is a rebuild orchestrator, not a direct stable-page writer.

## Safety Rules

- Only `kb/**/*.md` is in scope.
- `skills/**`, `.praxisbase/**`, `dist/**`, and non-markdown files are out of scope.
- `--yes` is required for destructive prune/rebuild cleanup.
- JSON reports must include deleted paths and quality reasons.
