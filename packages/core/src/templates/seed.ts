export const seedFiles: Record<string, string> = {
  ".praxisbase/config.yaml": `protocol_version: "0.1"
name: praxisbase-openclaw-repair
default_scope: team
`,
  ".praxisbase/schedules.yaml": `schedules:
  - id: review-proposals
    task: review
    mode: auto
    cron: "*/15 * * * *"
    runner: gitlab-ci
  - id: promote-approved
    task: promote
    mode: auto
    cron: "*/15 * * * *"
    runner: gitlab-ci
  - id: build-bundles
    task: build
    cron: "*/30 * * * *"
    runner: gitlab-ci
`,
  ".praxisbase/policies/autonomy.yaml": `autonomy:
  mode: ai_automerge_with_human_exceptions
  reviewer:
    min_confidence: 0.75
    require_independent_context: true
  auto_merge:
    low: true
    medium: true
    high: false
  human_required_for:
    - delete
    - rewrite_policy
    - enable_new_default_skill
    - modify_permissions
    - reduce_safety_checks
`,
  ".praxisbase/policies/risk-rules.yaml": `human_required_for:
  - delete
  - rewrite_policy
  - enable_new_default_skill
  - modify_permissions
  - reduce_safety_checks
`,
  "skills/openclaw/baseline-diagnostics/SKILL.md": `# OpenClaw Baseline Diagnostics

Use this skill before applying a repair. Capture OpenClaw status, Claude Code status, recent logs, workspace path, runtime version, and network reachability. Do not modify production systems from a sandbox repair run.

## When To Use

Run this skill at the start of every OpenClaw repair session, before applying any fix.

## Required Context

- OpenClaw sandbox workspace path
- Access to recent OpenClaw logs (last 200 lines minimum)
- Network access to model gateway

## Steps

1. Check OpenClaw session status.
2. Check Claude Code version and auth state.
3. Capture recent log output.
4. Test network reachability to model gateway.
5. Record all diagnostic results for the repair episode.

## Forbidden Operations

- Do not modify production systems.
- Do not delete user workspace data.
- Do not print secrets into chat.

## Verification

Confirm that diagnostic output was captured and no forbidden operations were performed.

## Rollback

Baseline diagnostics is read-only; no rollback needed.
`,
  "skills/openclaw/auth-repair/SKILL.md": `# OpenClaw Auth Repair

Use this skill when logs indicate Claude Code or the model gateway cannot authenticate.

## When To Use

Logs contain "authentication expired", "401 unauthorized", or "refresh credentials" patterns.

## Required Context

- OpenClaw sandbox workspace path
- Current auth state file location
- Access to model gateway

## Steps

1. Check current auth state and token expiry.
2. Verify gateway reachability with a minimal request.
3. Refresh auth state using the sandbox credential mechanism.
4. Restart the agent session.
5. Retry a minimal model call.

## Forbidden Operations

- Do not modify production systems.
- Do not delete user workspace data.
- Do not print secrets into chat.
- Do not use production credentials in sandbox.

## Verification

Run a minimal agent/model call and confirm it succeeds without auth errors.

## Rollback

Restore the previous auth state snapshot if refresh makes the session worse.
`,
  "kb/known-fixes/openclaw-auth-expired.md": `---
id: openclaw-auth-expired
protocol_version: "0.1"
type: known_fix
scope: team
risk: medium
status: draft
signatures:
  - openclaw:claude-auth-expired
skills:
  - skills/openclaw/auth-repair/SKILL.md
sources:
  - uri: seed://openclaw/auth-expired
    hash: sha256:seed
confidence: 0.6
updated_at: 2026-05-17T00:00:00Z
---

## Symptoms

Claude Code reports expired authentication or cannot call the configured model gateway.

## Diagnosis

Check auth state, gateway reachability, and recent OpenClaw logs.

## Fix

Refresh sandbox auth state and restart the agent session.

## Verification

Run a minimal model call.

## Rollback

Restore the previous auth state snapshot.
`
};
