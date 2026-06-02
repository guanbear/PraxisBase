---
name: OpenClaw dispatch routing failures
description: >-
  Diagnose OpenClaw or OctoClaw dispatch failures before reporting delegated
  work as successful.
scope: personal
status: promoted
source_count: 2
origin: praxisbase_synthesized
generated_by: praxisbase
source_refs:
  - 'log://openclaw/2026-05-20-05-03-48-stability-report.'
  - >-
    raw-vault://codex/rollout-2026-04-04T19-26-57-019d583f-02e6-74d0-9351-b636055d911c
source_hashes:
  - 'sha256:027fb599399a145d9b9ffbdb6a7531b5fe996d732dea12db17a3fcd879af19bc'
  - 'sha256:d8e4f4a00e20c94f9a8116c72c73aa21cfbffc12d934158a1831e723fcb54078'
related_wiki_paths:
  - kb/known-fixes/openclaw-dispatch-routing-failures.md
---
# OpenClaw dispatch routing failures

## When To Use
Use this when OpenClaw or OctoClaw delegation, runner dispatch, or task routing looks successful from the main chat but the evidence shows missing runners, route mismatches, parameter validation failures, canonical hash mismatches, or errors such as `stickyResult is not defined`.

## Procedure
1. Send a short acknowledgement before starting any tool, network, or delegation work that may take more than a few seconds.
2. Verify dispatch evidence before saying the task was delegated or completed: check the runner state, queue state, spawned task id, and expected route.
3. If the task queue shows zero active tasks or `Runner: missing`, inspect the dispatch/orchestration layer before debugging the requested business logic.
4. If logs show `stickyResult is not defined`, route/footer mismatches, canonical hash mismatches, or parameter validation errors, treat the delegation as failed until a spawn or runner execution proof exists.
5. Compare the dispatched plan payload with the user's actual request; reject false positives such as a plan being reduced to `openclaw --version` or another unrelated health check.
6. If the main session already performed work directly, report that direct work honestly instead of claiming the delegate failed or succeeded.
7. After applying a routing fix, rerun the smallest dispatch smoke that proves spawn, route selection, and result reporting all work.

## Verification
- Confirm there is concrete evidence for one of: spawned task id, runner execution record, queue transition, or delegate result artifact.
- Re-run the workflow that originally failed and verify the response does not claim delegation success without execution proof.
- Check the related wiki page for current failure signatures before applying this skill.

## Reusable Lessons
- Do not report delegation success without dispatch evidence.
- Diagnose orchestration and routing failures before investigating downstream task logic.
- Long-running agent work should acknowledge first, then verify and report the real execution path.

## Agent Use
Use this page when:
- OpenClaw, OctoClaw, dispatch, delegation, runner, spawn, or route mismatch symptoms appear.

Apply it by:
- Load this skill and compare the current task against the trigger and procedure.
- Prefer stable PraxisBase wiki evidence over raw session text when deciding whether this skill applies.

Verify by:
- Confirm the dispatch path has concrete execution evidence before reporting delegation success.
- Check the related wiki page for current failure signatures.

## Pitfalls
- Do not confuse a healthy CLI/version check with a successful delegated task.
- Do not expose internal tool failures to the user unless they affect the outcome or the user asks.
- Do not use this for unrelated OpenClaw application bugs that have no dispatch, runner, or delegation symptom.

## Do Not Use When
- The issue is a one-off UI, database, or deployment bug with no agent dispatch path.
- Evidence is only raw private transcript text and has not been promoted or summarized by PraxisBase.

## Related Wiki Pages
- [[kb/known-fixes/openclaw-dispatch-routing-failures.md]]

## Provenance
- log://openclaw/2026-05-20-05-03-48-stability-report. (sha256:027fb599399a145d9b9ffbdb6a7531b5fe996d732dea12db17a3fcd879af19bc)
- raw-vault://codex/rollout-2026-04-04T19-26-57-019d583f-02e6-74d0-9351-b636055d911c (sha256:d8e4f4a00e20c94f9a8116c72c73aa21cfbffc12d934158a1831e723fcb54078)
