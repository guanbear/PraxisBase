# Knowledge Base Filter Rules Design

## Goal

Make multi-knowledge-base filtering explicit and visible. OpenClaw answer-bot experience should admit reusable repair/Q&A guidance with high recall while excluding greeting-only and unrelated material. K8s and future bases should have their own rule surfaces.

## Components

- Project config parser: supports scalar and object-form `knowledge_bases`.
- Knowledge filter evaluator: maps each wiki source to a base and evaluates built-in named rules.
- Curation integration: applies per-KB filtering before existing useful-signal heuristics.
- Static site output: shows per-base profile, filter mode, and rule names; writes `dist/knowledge-config.json`.

## Data Flow

1. `.praxisbase/config.yaml` resolves language and knowledge config.
2. Wiki evidence collection loads local `.praxisbase/filter-rules.yaml` and project knowledge config.
3. Per-KB built-ins run before generic signal checks. Reject wins; allowlist bases require a keep match.
4. Dashboard renders the resolved bases and their rule sets.

## Testing

- Unit test nested config parsing through site rendering.
- Curation test showing OpenClaw repair/Q&A retained and greeting-only content filtered.
- Existing scalar config tests continue to pass.
