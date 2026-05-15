# Implementation Plan: LLM-HTML Knowledge Base (kb-cli)

## Overview

Implement a self-updating knowledge base CLI tool (`kb-cli`) as a pnpm monorepo with two packages: `@kb-cli/core` (core logic) and `@kb-cli/cli` (CLI entry point). The implementation follows the Phase 1 MVP scope: core infrastructure, 6 connectors, LLM extraction/merge pipeline, MD→HTML builder, GitLab CI integration, and OpenClaw skill template.

## Tasks

- [ ] 1. Set up monorepo structure and core interfaces
  - [ ] 1.1 Initialize pnpm workspace and project scaffolding
    - Create root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
    - Create `packages/core/` and `packages/cli/` directory structures with their own `package.json` and `tsconfig.json`
    - Install shared dev dependencies: `typescript`, `vitest`, `eslint`, `prettier`, `zod`
    - Configure ESM output, path aliases, and build scripts
    - _Requirements: 5.1_

  - [ ] 1.2 Define core type interfaces and schemas
    - Create `packages/core/src/connectors/types.ts` with `Connector`, `ConnectorConfig`, `SourceResource`, `FetchResult` interfaces
    - Create `packages/core/src/llm/types.ts` with `LLMProvider`, `LLMMessage`, `LLMResponse`, `LLMProviderConfig`, `FallbackChain`, `TaskLLMMapping` interfaces
    - Create `packages/core/src/runner/types.ts` with `Runner`, `TaskSpec`, `RunResult`, `ScheduleSpec`, `MemoryAdapter` interfaces
    - Create `packages/core/src/extractor/types.ts` with `Claim`, `ExtractResult` types
    - Create `packages/core/src/merger/types.ts` with `MergeDecision` type
    - Create `packages/core/src/builder/types.ts` with builder-related types
    - _Requirements: 2.1, 3.1, 4.1, 6.1_

  - [ ] 1.3 Implement configuration schema and loader
    - Create `packages/core/src/config/schema.ts` with full `KBConfigSchema` (zod), `NoteFrontmatterSchema`, `NoteSourceSchema`
    - Create `packages/core/src/config/loader.ts` that loads `kb.config.ts`, resolves `${ENV_VAR}` references from `process.env`, validates with zod, and merges defaults
    - Handle missing config file with clear error message
    - _Requirements: 2.3, 5.4, 6.1, 7.5_

  - [ ]* 1.4 Write unit tests for config schema and loader
    - Test zod schema validation for valid/invalid configs
    - Test environment variable resolution
    - Test error messages for missing config
    - _Requirements: 2.3, 5.4_

- [ ] 2. Implement structured logging and security modules
  - [ ] 2.1 Implement JSON structured logger
    - Create `packages/core/src/logger/json-logger.ts` with JSON Lines output
    - Support `run_id`, `task_id`, `timestamp`, `level`, `event`, `payload` fields
    - Write logs to `kb/.logs/<run-id>/run.log`
    - Support log levels: debug, info, warn, error
    - _Requirements: 7.6, 5.3_

  - [ ] 2.2 Implement PII scanner and secrets checker
    - Create `packages/core/src/security/pii.ts` with built-in regex rules (phone, email, ID card, bank card, IP)
    - Support custom patterns from config `security.pii.customPatterns[]`
    - Record redaction metadata (offset, length, type, replacement)
    - Create `packages/core/src/security/secrets.ts` with allowlist/denylist logic
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 2.3 Implement pre-flight check module
    - Create `packages/core/src/security/preflight.ts`
    - Check: required env vars exist, `kb/notes/` write permission, disk space > 100MB, LLM health ping, Git status (no unresolved conflicts)
    - Return clear error messages on failure, exit 1
    - _Requirements: 7.5_

  - [ ]* 2.4 Write unit tests for PII scanner and pre-flight checks
    - Test each PII pattern (phone, email, ID card, bank card, IP)
    - Test custom pattern support
    - Test secrets allowlist/denylist logic
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement LLM provider abstraction
  - [ ] 4.1 Implement OpenAI-compatible provider
    - Create `packages/core/src/llm/openai-compat.ts` implementing `LLMProvider` interface
    - Support `baseURL`, `apiKey`, `organization`, custom `headers` for proxy gateways
    - Implement `chat()` and `chatStructured()` (with zod schema for structured output)
    - Implement exponential backoff retry for 429/5xx with configurable `maxRetries`
    - Implement concurrency limiting with `maxConcurrency`
    - _Requirements: 6.1, 6.5_

  - [ ] 4.2 Implement Anthropic native provider
    - Create `packages/core/src/llm/anthropic.ts` implementing `LLMProvider` interface
    - Use Anthropic SDK as native fallback provider
    - Support same retry and concurrency logic
    - _Requirements: 6.3_

  - [ ] 4.3 Implement fallback chain and cost tracker
    - Create `packages/core/src/llm/fallback.ts` implementing `FallbackChain` logic (primary fails → try fallbacks in order)
    - Create `packages/core/src/llm/cost-tracker.ts` recording prompt/completion tokens and estimated cost per call
    - Write cost summary to `kb/.logs/<run-id>/cost.json`
    - Create `packages/core/src/llm/profiles.ts` with built-in profile templates: `openai`, `openai-compatible-proxy`, `anthropic`, `deepseek`, `alibaba-bailian`, `moonshot/kimi`, `local-vllm`
    - _Requirements: 6.2, 6.4, 6.6_

  - [ ]* 4.4 Write unit tests for LLM providers and fallback chain
    - Test retry logic with mocked 429/5xx responses
    - Test fallback chain switching on primary failure
    - Test cost tracking accumulation
    - _Requirements: 6.5, 6.6_

- [ ] 5. Implement data source connectors
  - [ ] 5.1 Implement connector registry and base connectors (local-fs, http-fetch, git-repo)
    - Create `packages/core/src/connectors/registry.ts` for connector registration and lookup by type
    - Create `packages/core/src/connectors/local-fs.ts`: scan local directory for `.md`, `.txt`, `.pdf`, `.docx` files
    - Create `packages/core/src/connectors/http-fetch.ts`: fetch URLs with `undici` + `@mozilla/readability` for content extraction
    - Create `packages/core/src/connectors/git-repo.ts`: clone/pull Git repos, scan specified glob paths
    - All connectors implement `list()`, `fetch()`, `incrementalSince()` methods
    - Implement content hashing (sha256) for deduplication/short-circuit
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [ ] 5.2 Implement Feishu connectors (feishu-chat, feishu-doc)
    - Create `packages/core/src/connectors/feishu-chat.ts`: pull chat messages by `chat_id` via Feishu Open API, support `update_time` incremental fetch
    - Create `packages/core/src/connectors/feishu-doc.ts`: pull wiki_space/docx documents via Feishu Open API
    - Apply PII sanitization before writing to `kb/sources/`
    - Implement Feishu API rate limiting with automatic backoff
    - Handle missing/invalid credentials gracefully (log error, skip source)
    - Install `@larksuiteoapi/node-sdk`
    - _Requirements: 2.2, 2.6, 2.7_

  - [ ] 5.3 Implement internal-log connector
    - Create `packages/core/src/connectors/internal-log.ts`: read from JSONL file or HTTP endpoint
    - Require `timestamp` field for incremental support
    - Implement `list()`, `fetch()`, `incrementalSince()` methods
    - _Requirements: 2.2_

  - [ ]* 5.4 Write unit tests for connectors
    - Test local-fs file scanning and filtering
    - Test http-fetch with mocked responses
    - Test hash-based deduplication (short-circuit)
    - Test Feishu connector rate limiting and error handling
    - _Requirements: 2.1, 2.5, 2.6, 2.7_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement LLM extraction and note merge pipeline
  - [ ] 7.1 Implement LLM extractor
    - Create `packages/core/src/extractor/extract.ts`: send source content to LLM with `extract.hbs` prompt template
    - Create `packages/core/src/extractor/prompts/extract.hbs`: Handlebars template for claim extraction (topic, claim_text, citation, confidence)
    - Parse structured LLM response into `Claim[]`
    - Record citation for each claim linking back to source
    - _Requirements: 3.1.2, 3.2_

  - [ ] 7.2 Implement merge decision engine
    - Create `packages/core/src/merger/decide.ts`: send claim + existing notes index to LLM with `merge-decision.hbs` prompt
    - Create `packages/core/src/extractor/prompts/merge-decision.hbs`: Handlebars template for merge decisions
    - Return decision: `create` | `append` | `modify` | `discard` with target note ID and patch
    - _Requirements: 3.1.3, 3.3_

  - [ ] 7.3 Implement note apply and index manager
    - Create `packages/core/src/merger/apply.ts`: apply decisions to `kb/notes/` (create new note with frontmatter, append content, apply patch)
    - Create `packages/core/src/merger/index-manager.ts`: maintain `kb/index.md` (human-readable) and `kb/index.json` (machine-readable) as the "known notes directory"
    - Update frontmatter `sources[]`, `updated_at`, `links[]` on each modification
    - Use `simple-git` to commit changes with structured message (note ID + triggering source)
    - _Requirements: 3.1.4, 3.3, 3.4_

  - [ ] 7.4 Implement ingest orchestrator with limits and reporting
    - Create ingest orchestrator that chains: fetch → extract → decide → apply → report
    - Implement `--dry-run` mode (output decisions without applying)
    - Implement `--limit-sources <N>` and `--limit-tokens <N>` cost caps
    - Generate `ingest-report.md` with: sources processed, notes created/modified/discarded, token usage, estimated cost, error list
    - _Requirements: 3.1, 3.5, 3.6, 3.7_

  - [ ]* 7.5 Write unit tests for extractor and merger
    - Test claim extraction parsing
    - Test merge decision logic with mocked LLM responses
    - Test note apply (create, append, modify)
    - Test index manager updates
    - _Requirements: 3.1, 3.3_

- [ ] 8. Implement MD → HTML builder
  - [ ] 8.1 Implement Markdown parser and wiki-link resolver
    - Create `packages/core/src/builder/build.ts`: scan `kb/notes/**/*.md`, parse frontmatter + body using `unified` (remark + rehype)
    - Create `packages/core/src/builder/wiki-link.ts`: custom remark plugin to parse `[[note-id]]` and `[[note-id|display]]` syntax, render as HTML links
    - Create `packages/core/src/builder/backlinks.ts`: compute backlinks graph from all wiki-link references
    - Validate broken links (referenced note-id not found)
    - _Requirements: 1.1, 1.6, 8.6, 9.1, 9.2, 9.6_

  - [ ] 8.2 Implement HTML page rendering and templates
    - Create HTML templates: `note.html`, `index.html`, `tag.html` in `packages/core/src/builder/template/`
    - Render each note to HTML with: code highlighting, GFM tables, Mermaid diagrams, backlinks, source references, related notes
    - Embed original MD in `<script type="application/markdown" id="kb-source">` in each HTML page
    - Generate responsive layout with dark mode toggle
    - Ensure WCAG AA basics: semantic HTML, contrast, keyboard navigation
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 8.1, 8.2, 8.3, 8.7_

  - [ ] 8.3 Implement index pages, search index, and llms.txt generation
    - Generate `dist/index.html` (recent updates, tag cloud, stats)
    - Generate `dist/tags/<tag>.html` for each tag
    - Generate `dist/llms.txt` following llmstxt.org spec
    - Generate `dist/kb-index.json` (machine-readable full index)
    - Generate `dist/search-index.json` (pre-built MiniSearch index)
    - Create `packages/core/src/builder/llms-txt.ts` for llms.txt generation
    - _Requirements: 1.5, 1.7, 8.5_

  - [ ] 8.4 Implement static assets and client-side search
    - Create `packages/core/src/builder/template/styles.css`: responsive layout, dark mode, WCAG AA contrast
    - Create `packages/core/src/builder/template/search.js`: MiniSearch client-side search loading `search-index.json`
    - Implement "Raw MD" button (show source MD from embedded script, copy to clipboard)
    - Implement "Feed to LLM" button (copy MD + prompt template to clipboard)
    - Copy static assets to `dist/assets/` during build
    - _Requirements: 8.1, 8.3, 8.4_

  - [ ]* 8.5 Write unit tests for builder
    - Test wiki-link parsing and rendering
    - Test backlinks computation
    - Test frontmatter validation
    - Test broken link detection
    - _Requirements: 1.6, 9.1, 9.3, 9.6_

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement Runner abstraction and GitLab CI integration
  - [ ] 10.1 Implement local runner and memory adapter
    - Create `packages/core/src/runner/local.ts` implementing `Runner` interface
    - Implement in-process task execution via `runOnce()`
    - Implement file-based `MemoryAdapter` (store last run timestamps in `kb/.cache/runner-state.json`)
    - Support optional local cron scheduling via `node-cron`
    - _Requirements: 4.1, 4.2, 4.7_

  - [ ] 10.2 Implement GitLab CI runner template generation
    - Create `packages/core/src/runner/gitlab-ci.ts` implementing `Runner` interface
    - Generate `.gitlab-ci.yml` from template with three jobs: `kb:ingest`, `kb:build`, `pages`
    - `registerSchedule()` outputs instructions for GitLab Pipeline Schedules configuration
    - Memory adapter uses Git-committed state file for CI persistence
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [ ]* 10.3 Write unit tests for runners
    - Test local runner task execution
    - Test memory adapter read/write
    - Test GitLab CI YAML generation
    - _Requirements: 4.1, 4.2_

- [ ] 11. Implement CLI commands
  - [ ] 11.1 Implement CLI entry point and init/check commands
    - Create `packages/cli/src/index.ts` with commander.js setup
    - Implement `kb-cli init`: create `kb.config.ts`, `kb/` directory skeleton, `.gitlab-ci.yml.example`, `.gitignore` from templates
    - Implement `kb-cli check`: lint note frontmatter, validate wiki-links, report broken links
    - Support `--with-skill openclaw` flag in init to generate `skills/kb-wiki/SKILL.md`
    - Install `commander` dependency
    - _Requirements: 5.1, 5.2, 5.4, 10.6_

  - [ ] 11.2 Implement ingest and build commands
    - Implement `kb-cli ingest`: wire to ingest orchestrator, support `--dry-run`, `--source <id>`, `--limit-sources`, `--limit-tokens`, `--yes`
    - Implement `kb-cli build`: wire to builder, support `--out <dir>`, `--base <path>`
    - Run pre-flight checks before ingest/build
    - Print change summary and require confirmation unless `--yes` is passed
    - _Requirements: 5.2, 5.5, 3.5, 3.6_

  - [ ] 11.3 Implement serve, publish, search, read, and edit commands
    - Implement `kb-cli serve`: static HTTP server on port 4567 using `sirv-cli` for `dist/`
    - Implement `kb-cli publish`: push to configured target (git remote / GitLab Pages / local copy)
    - Implement `kb-cli search <query>`: full-text search with `--json` and `--limit <N>` options
    - Implement `kb-cli read <note-id>`: output full MD to stdout (read-only, no confirmation)
    - Implement `kb-cli edit <note-id> --patch <instruction>`: LLM-powered note editing with `--dry-run`, `--yes`, `--branch <name>` for auto-commit/MR
    - _Requirements: 5.2, 5.5, 5.6, 5.7_

  - [ ]* 11.4 Write unit tests for CLI commands
    - Test init command generates correct file structure
    - Test search command output formats (text and JSON)
    - Test edit command dry-run mode
    - Test confirmation prompts behavior
    - _Requirements: 5.2, 5.5, 5.6_

- [ ] 12. Create templates and OpenClaw skill
  - [ ] 12.1 Create project templates for kb-cli init
    - Create `templates/kb.config.ts.hbs`: Handlebars template for default config
    - Create `templates/.gitlab-ci.yml.example`: full CI template with ingest/build/pages jobs
    - Create `templates/.gitignore.hbs`: exclude `kb/.logs/`, `kb/.cache/`, `.env*`, `*.secret.*`, `node_modules/`, `dist/`
    - _Requirements: 4.3, 7.4, 5.2_

  - [ ] 12.2 Create OpenClaw skill template
    - Create `skills/kb-wiki/SKILL.md` with: capability descriptions, CLI usage examples, output format docs, decision guidelines, security constraints
    - Include search, read, edit, ingest commands with examples
    - Document environment requirements (`KB_ROOT`, `kb-cli` in PATH)
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 13. Create example knowledge base
  - [ ] 13.1 Create example project structure
    - Create `examples/ai-agent-wiki/kb.config.ts` with sample configuration
    - Create `examples/ai-agent-wiki/kb/notes/` with 2-3 sample notes demonstrating frontmatter, wiki-links, and tags
    - Create `examples/ai-agent-wiki/kb/index.md` and `kb/index.json`
    - Ensure example can be built with `kb-cli build`
    - _Requirements: 1.1, 1.2, 9.1_

- [ ] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Implementation follows Phase 1 (MVP) scope only — Hermes runner, admin dashboard, MCP Server are Phase 2/3
- All code uses TypeScript 5.x targeting Node.js 20+ with ESM modules
- Use `vitest` for all testing
- Use `pnpm` for package management throughout

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 5, "tasks": ["4.4", "5.2", "5.3"] },
    { "id": 6, "tasks": ["5.4", "7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3", "7.4"] },
    { "id": 8, "tasks": ["7.5", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3"] },
    { "id": 10, "tasks": ["8.4", "8.5", "10.1"] },
    { "id": 11, "tasks": ["10.2", "10.3"] },
    { "id": 12, "tasks": ["11.1", "11.2"] },
    { "id": 13, "tasks": ["11.3", "11.4", "12.1", "12.2"] },
    { "id": 14, "tasks": ["13.1"] }
  ]
}
```
