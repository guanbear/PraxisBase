# Human Required AI Triage Design

## Flow

```text
exceptions/human-required/*.json
  -> hard-block deterministic checks
  -> redacted AI classification
  -> deterministic release gate
  -> privacy triage report
  -> exception details.triage metadata
  -> review page
```

## AI Contract

The AI sees exception metadata and redacted summaries only. It returns JSON:

```json
{
  "classification": "safe_personal_experience",
  "confidence": 0.9,
  "rationale": "The item describes project workflow, not credentials.",
  "suggested_redactions": []
}
```

Valid classifications:

- `safe_personal_experience`
- `needs_redaction`
- `real_private_material`
- `unclear`

## Release Gate

`auto_released` requires:

- authority mode `personal-local`;
- explicit `autoRelease: true`;
- classification `safe_personal_experience`;
- confidence `>= 0.75`;
- no deterministic hard-block reason;
- personal or project scope.

Team mode always returns `team_review_only` for AI-triaged items.

## Persistence

Reports are stored under `.praxisbase/reports/privacy-triage`.

Exception records keep their audit identity and receive `details.triage` metadata. The system does not delete exceptions or mutate stable knowledge in this change.
