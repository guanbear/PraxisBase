# Knowledge Base Filter Rules

## Why

PraxisBase now supports multiple knowledge bases such as OpenClaw and K8s, but the filtering intent is still mostly global. Operators need to see and configure each knowledge base's source scope and filter rules so OpenClaw answer-bot memory can keep repair and fixed-answer experience while excluding greetings, unrelated chatter, and non-reusable material.

## What Changes

- Allow each configured knowledge base to carry its own profile, filter mode, and named filter rules.
- Apply built-in per-knowledge-base rules during wiki evidence selection before curation.
- Keep existing `.praxisbase/filter-rules.yaml` local rules compatible.
- Render each knowledge base's profile, filter mode, and active rules in the static site.
- Emit a machine-readable `dist/knowledge-config.json` for GitLab Pages or review tooling.

## Non-Goals

- Do not build a full browser-based YAML editor in this change.
- Do not bypass privacy review or proposal approval.
- Do not remove existing generic curation heuristics for knowledge bases without allowlist filtering.

## Acceptance

- OpenClaw can be configured as an allowlist knowledge base that keeps repair actions, fixed Q&A policies, verification, and escalation guidance.
- Greeting-only or unrelated OpenClaw memory is filtered before curation.
- K8s can be declared as a separate knowledge base with its own visible rule set.
- The dashboard shows every configured knowledge base and the rules that govern it.
