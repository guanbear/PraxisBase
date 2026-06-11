# Agent Knowledge Substrate Spec Delta: M30 Feishu Source Integration

## ADDED Requirements

### Requirement: Feishu Source Via OpenClaw Plugin (Path A)

PraxisBase SHALL ingest Feishu-derived experience captured by an OpenClaw Feishu plugin as an OpenClaw source with `channel=feishu`, under team review-first.

#### Scenario: Feishu-channel OpenClaw source is review-first in team mode

- **GIVEN** an OpenClaw source with `agent=openclaw` and `channel=feishu`
- **WHEN** team distillation runs
- **THEN** its experience requires review before becoming team stable knowledge
- **AND** it cannot use the `trusted_personal_remote` shortcut

### Requirement: Feishu First-Class Source (Path B)

PraxisBase SHALL support Feishu docs and chats as a first-class source via Feishu CLI or Open Platform API.

#### Scenario: Add a Feishu doc source

- **GIVEN** Feishu app credentials are referenced by environment variable name only
- **WHEN** `praxisbase source add feishu-team-docs --agent feishu --type feishu --parser feishu-doc --feishu-target <wiki-space> --scope team` runs
- **THEN** the source config is written with env-name credential references
- **AND** no literal credential is stored

#### Scenario: Feishu doc is pulled and redacted into an envelope

- **GIVEN** a configured `feishu-doc` source and a mock Feishu doc
- **WHEN** the adapter resolves the source
- **THEN** the doc becomes a canonical Markdown chunk with a doc-token source_ref
- **AND** the envelope carries a redacted summary, source_ref, and hash
- **AND** raw doc body is not committed to Git

#### Scenario: Non-HTTPS Feishu API endpoint is rejected

- **GIVEN** a Feishu API base URL that is not HTTPS and not loopback
- **WHEN** the source is resolved
- **THEN** PraxisBase rejects the endpoint

### Requirement: Feishu Privacy Gate

PraxisBase SHALL hard-block Feishu private content before AI distillation.

#### Scenario: 1v1 direct message is rejected

- **GIVEN** a Feishu source containing a 1v1 direct message
- **WHEN** privacy triage runs
- **THEN** the item is rejected and never distilled

#### Scenario: Feishu identifiers and PII are redacted or blocked

- **GIVEN** Feishu content containing user_id/open_id/union_id/chat_id raw values or phone/email/token
- **WHEN** privacy triage runs
- **THEN** identifiers are redacted and credentials are hard-blocked before envelope creation
- **AND** HTML shows only redacted summaries with reason codes

#### Scenario: Public knowledge-base doc follows normal triage

- **GIVEN** a Feishu public knowledge-base doc with no PII
- **WHEN** privacy triage runs
- **THEN** it proceeds through normal team triage

### Requirement: Feishu Release Audit Gates

PraxisBase SHALL extend the team release audit with Feishu gates.

#### Scenario: Team audit includes Feishu gates

- **WHEN** `praxisbase team release-audit --json` runs after M30
- **THEN** it includes `feishu_source_a_ga`, `feishu_source_b_ga`, and `feishu_privacy_ga`
- **AND** `team_ga` requires these to pass alongside the M28 gates

#### Scenario: Feishu gates are not_run when no Feishu source is configured

- **GIVEN** no Feishu source (path A or path B) is configured
- **WHEN** `praxisbase team release-audit --json` runs
- **THEN** the three Feishu gates report `not_run` with warning `feishu_domain_not_enabled`
- **AND** `team_ga` is not failed by the Feishu gates
- **AND** once a Feishu source is configured the gates are evaluated strictly against real evidence
