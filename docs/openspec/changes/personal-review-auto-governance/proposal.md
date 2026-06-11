# Proposal: Personal Review Auto-Governance

## Why

Personal mode now has real ingestion, AI distill, wiki curation, and AgentMemory interop. Real runs show the next bottleneck: the user still sees a large `human_required` backlog and does not get a clear product workflow from "daily run finished" to "agents can reuse the experience".

We need to make the personal loop understandable and mostly automatic without weakening team privacy.

## What Changes

- Add a personal next-action summary after daily runs.
- Make privacy triage a first-class personal follow-up step.
- Separate generated-site queues into privacy-required, review-required, rejected, and promoted material.
- Treat AgentMemory export as the final stable-wiki sharing step.
- Define a validation ladder: doctor, small daily, triage, small daily again, export, medium daily, then full daily only when the earlier gates are clean.

## Out Of Scope

- No team GitLab policy redesign.
- No browser-based approval mutation UI.
- No raw evidence viewer.
- No export of unreviewed, rejected, raw, or human-required material to AgentMemory.

## Success Criteria

- A personal user can follow CLI/site next actions without inspecting internal `.praxisbase` folders.
- Safe personal/project evidence can be auto-released after AI triage and deterministic checks.
- Concrete secrets and ambiguous private material remain blocked.
- Stable wiki pages remain the only durable authority exported to AgentMemory.
- Team mode remains strict by default.
