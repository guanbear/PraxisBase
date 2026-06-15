# Agent Knowledge Substrate Delta

## ADDED Requirements

### Requirement: OpenClaw Cron Memory Export

PraxisBase SHALL support a documented deployment pattern where OpenClaw cron triggers a low-token script to export answer-bot memory into a GitLab-backed team source.

#### Scenario: Export uses stable bot identity

- **GIVEN** an OpenClaw answer bot runs in a temporary sandbox
- **WHEN** the exporter writes memory rows
- **THEN** each row uses a stable `source_ref` based on `openclaw://answer-bot/pm.sqlite/chunks/<chunk-id>`
- **AND** the row does not depend on sandbox IP, SSH port, or sandbox id.

#### Scenario: Export is incremental and retry-safe

- **GIVEN** the exporter has a local cursor
- **WHEN** it queries `pm.sqlite`
- **THEN** it selects rows newer than the cursor and applies a bounded limit
- **AND** it updates the cursor only after GitLab push succeeds.

#### Scenario: Team source remains review-first

- **GIVEN** exported rows are consumed as `agent=openclaw`, `channel=feishu`, `scope=team`
- **WHEN** `praxisbase daily run --mode team-git` processes them
- **THEN** team privacy policy routes Feishu-channel material through review-first handling before stable promotion.
