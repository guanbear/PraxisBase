# M30 Feishu Source Integration Status

Date: 2026-06-03

## Result

M30 is implemented for both supported paths:

- Path A: OpenClaw Feishu plugin output remains an OpenClaw source with `channel=feishu`; team mode forces review-first.
- Path B: first-class `source_type=feishu` supports `feishu-doc` and `feishu-chat` through a mockable CLI/API adapter.
- Feishu is a source only. Authority remains reviewed/promoted PraxisBase `kb/` and `skills/`.
- Strong privacy gate is enforced before envelope creation for 1v1 chat rejection, Feishu private ids, PII, credentials, tokens, and cookies.

## Main Workspace Audit

Command:

```bash
node packages/cli/dist/index.js team release-audit --json
```

Observed status in the main workspace:

```json
{
  "team_ga": "pass",
  "team_repair_loop_ga": "pass",
  "skill_self_evolution_ga": "pass",
  "governance_ga": "pass",
  "privacy_boundary_ga": "pass",
  "k8s_bundle_ga": "not_run",
  "incident_episode_intake_ga": "not_run",
  "k8s_boundary_ga": "not_run",
  "feishu_source_a_ga": "not_run",
  "feishu_source_b_ga": "not_run",
  "feishu_privacy_ga": "not_run"
}
```

This is expected because the main workspace has no Feishu source configured. The Feishu gates are domain-enabled: not configured means `not_run` and does not fail `team_ga`; configured means strict evidence is required.

## Mock Fixture Chain

Command shape:

```bash
tmp=$(mktemp -d /tmp/praxisbase-m30-main-evidence-XXXXXX)
cp -R .praxisbase "$tmp/.praxisbase"
cp -R kb "$tmp/kb"
cp -R skills "$tmp/skills"
cp -R dist "$tmp/dist"
# create mock Feishu CLI wrapper that returns tests/fixtures/feishu-source/*.json
cd "$tmp"
FEISHU_APP_ID=mock-app FEISHU_APP_SECRET=mock-secret praxisbase source add openclaw-feishu-bot ...
FEISHU_APP_ID=mock-app FEISHU_APP_SECRET=mock-secret praxisbase source add feishu-team-docs ...
FEISHU_APP_ID=mock-app FEISHU_APP_SECRET=mock-secret praxisbase source add feishu-team-chat ...
FEISHU_APP_ID=mock-app FEISHU_APP_SECRET=mock-secret praxisbase source add feishu-team-dm-negative ...
FEISHU_APP_ID=mock-app FEISHU_APP_SECRET=mock-secret praxisbase source add feishu-team-sensitive-negative ...
FEISHU_APP_ID=mock-app FEISHU_APP_SECRET=mock-secret praxisbase source doctor feishu-team-docs --json
FEISHU_APP_ID=mock-app FEISHU_APP_SECRET=mock-secret praxisbase daily run --mode team-git --no-ai --build-site --json
praxisbase team release-audit --json
```

Observed mock result:

```json
{
  "doctor_target_readable": true,
  "team_ga": "pass",
  "feishu_source_a_ga": "pass",
  "feishu_source_b_ga": "pass",
  "feishu_privacy_ga": "pass",
  "privacy_boundary_ga": "pass",
  "k8s_bundle_ga": "not_run",
  "blockers": []
}
```

The daily report included:

- `openclaw-feishu-bot`: `human_required=1` for team review-first.
- `feishu-team-docs`: `enveloped=1`, raw document body withheld from envelope.
- `feishu-team-chat`: `human_required=1` for group review.
- `feishu-team-dm-negative`: `rejected=1`, warning `feishu_1v1_rejected_before_envelope`.
- `feishu-team-sensitive-negative`: `rejected=1`, warnings `feishu_private_identifier_blocked_before_envelope` and `feishu_private_material_blocked_before_envelope`.

## Verification

Focused regression:

```bash
pnpm build && tsc -p tsconfig.tests.json && node --test dist-tests/tests/core/team-release-audit.test.js dist-tests/tests/cli/source-command.test.js dist-tests/tests/core/feishu-source-adapter.test.js
```

Result: 26 tests passed, 0 failed.

Full check:

```bash
pnpm check
```

Result: 1413 tests passed, 0 failed.

Leak checks:

```bash
git ls-files .praxisbase dist
# Scanned stable outputs with the raw-body, Feishu-id, chat-id, and token sentinels from tests/fixtures/feishu-source.
```

Result: no tracked `.praxisbase/` or `dist/` files; no raw Feishu body/id/token strings in stable main workspace outputs or mock-generated stable outputs.

## Notes

- `team-release-audit` now reads real daily source evidence from `.praxisbase/reports/daily` and keeps compatibility with historical `.praxisbase/runs/daily` source-shaped fixtures.
- No real Feishu network call was made. All validation used mock fixtures.
- No SkillClaw or llmwiki source was copied for M30, so `NOTICE` does not require a new attribution entry.
