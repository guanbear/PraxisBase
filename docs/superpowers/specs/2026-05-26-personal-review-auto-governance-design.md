# Personal Review Auto-Governance Design

## Goal

Make personal mode usable as a daily, mostly automatic experience loop while keeping team privacy strict.

The immediate problem is not that PraxisBase cannot ingest data. It can. The problem is that real personal runs still produce a large `human_required` privacy backlog, and the user cannot easily tell which items need action, which can be auto-released, which should stay blocked, and which reusable lessons actually reached the wiki and AgentMemory.

M19 turns this into an explicit flow:

```text
doctor -> daily run -> privacy triage -> wiki curation/review -> AgentMemory export -> site -> larger smoke
```

## Scope

This change covers four behaviors:

- personal-mode privacy auto-governance;
- clearer review and triage UX in the generated site;
- stable wiki export back to AgentMemory as the final sharing step;
- a repeatable validation ladder from small smoke to larger real daily.

It does not change team-mode defaults. Team mode keeps personal content out of team knowledge unless an explicit team policy allows it.

## Product Flow

### Personal Daily

`praxisbase personal run` should remain the simple command. Internally it should report a next-action summary that says:

- how many sources were scanned;
- how many AI chunks were distilled;
- how many items are privacy-required, review-required, rejected, or promoted;
- whether stable wiki changed;
- whether AgentMemory export is needed.

The CLI and site should make the next command obvious. A user should not need to inspect `.praxisbase` paths to know what to do.

### Privacy Triage

`praxisbase privacy triage --mode personal --auto-release` already exists as a foundation. M19 tightens its role:

- it reads only redacted exception metadata;
- AI classifies privacy risk;
- deterministic hard blocks still override AI;
- personal mode may auto-release high-confidence safe personal/project experience;
- team mode is review-only.

Auto-release does not promote wiki pages. It only changes whether the evidence can re-enter the normal daily/wiki pipeline on a future run.

### Review Queue UX

The static site should separate:

- `Privacy required`: blocked before reuse because privacy/scope is uncertain;
- `Review required`: safe enough to inspect, but needs a quality or merge decision;
- `Rejected`: low-signal or quality-blocked material that intentionally did not become wiki;
- `Promoted`: stable wiki pages created or updated.

Each queue card should show the reason and the recommended command:

- privacy items: run privacy triage;
- safe review items: review/promote or wait for policy;
- rejected items: no action unless debugging curation;
- promoted pages: inspect page and optionally export to AgentMemory.

### AgentMemory Export

AgentMemory is the session-level memory sharing backend, not the durable wiki authority. After stable wiki pages exist, PraxisBase should export compact lesson cards to AgentMemory:

```bash
praxisbase agentmemory export --mode personal --write --json
```

This step should be safe to rerun. Export should skip review candidates, human-required material, raw evidence, and rejected material.

### Validation Ladder

The release flow should use increasing scope:

1. `personal doctor` verifies AI, sources, site, and AgentMemory health.
2. Small daily smoke: `--limit 50 --max-ai-chunks 20 --max-curation-proposals 8`.
3. Privacy triage smoke: `--limit 100 --auto-release`.
4. Re-run small daily and verify stable wiki quality.
5. Export stable wiki to AgentMemory.
6. Larger daily: `--limit 200` before any full unbounded run.

Full daily is not the first validation step. It is only useful after the smaller loop is clean.

## Policies

### Personal Mode

Personal mode may be pragmatic:

- auto-release safe personal/project experience after AI triage and deterministic hard-block checks;
- auto-promote only low-risk, high-confidence, semantically reusable wiki proposals;
- export stable wiki pages to local AgentMemory by default when requested.

Personal mode still blocks concrete secrets, raw private values, and material that cannot be classified.

### Team Mode

Team mode is conservative:

- no personal-source auto-release into team knowledge;
- no personal AgentMemory import/export unless explicit team policy allows it;
- GitLab remains the likely authority for team knowledge;
- team review remains human-gated for privacy and scope escalation.

## Data And Reports

The daily report is the source of truth for counts. The site should use the taxonomy already introduced by the wiki kernel work:

- `privacy_required`;
- `review_required`;
- `rejected_low_signal`;
- `rejected_quality`;
- `auto_promoted`;
- `changed_stable_knowledge`;
- `agentmemory_sources`.

Privacy triage reports remain under `.praxisbase/reports/privacy-triage`. They must not contain raw secrets.

AgentMemory export reports should expose:

- pages scanned;
- payloads generated;
- exported count;
- skipped count;
- errors and warnings.

## Error Handling

- If AgentMemory health passes but smart-search fails, doctor reports a warning and daily still runs.
- If `agentmemory/health` returns 404, doctor explains that the HTTP daemon is alive but AgentMemory routes are not registered.
- If privacy triage AI is unavailable, daily remains usable and the site shows the queue as pending.
- If export fails, stable wiki remains the authority and the error appears as a warning, not a stable-knowledge mutation.
- If curation produces only rejected candidates, the run is still useful if the rejection reasons are visible.

## Testing

Unit and CLI tests should cover:

- personal triage auto-release summary;
- team triage review-only behavior;
- site queue sections and recommended commands;
- `personal run` next-action summary;
- AgentMemory export after stable wiki pages exist;
- small real daily not promoting one-off run reports.

Real validation should use local Codex, codex-cliproxyapi, OpenClaw reports, OpenClaw memory, and AgentMemory.

## Non-Goals

- No browser mutation UI in this milestone.
- No team GitLab policy redesign.
- No full raw evidence viewer.
- No automatic export of human-required or review candidate material to AgentMemory.
- No full unbounded daily run until the small and medium validation ladder is clean.

## Acceptance

- A personal user can run doctor, daily, privacy triage, site build, and AgentMemory export without reading internal `.praxisbase` paths.
- The site clearly explains privacy-required versus review-required versus rejected versus promoted material.
- High-confidence safe personal material can be auto-released, but concrete secrets remain blocked.
- One-off test pass/fail reports do not become stable wiki pages.
- Stable wiki pages can be exported to AgentMemory and retrieved as sidecar memory.
- Team mode still blocks personal content by default.
