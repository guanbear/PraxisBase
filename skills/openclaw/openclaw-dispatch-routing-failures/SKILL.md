---
name: OpenClaw dispatch routing failures
description: Diagnose OpenClaw or OctoClaw dispatch failures before reporting delegated work as successful.
scope: personal
status: promoted
source_count: 12
origin: praxisbase_synthesized
generated_by: praxisbase
source_refs:
  - log://openclaw/2026-05-20-05-03-48-stability-report.
  - openclaw-memory://memory/dreaming/light/2026-05-19.md#031f4a8b604fa8778b57646e840eba51792addf50b4050001c37807435a4d494
  - openclaw-memory://memory/dreaming/light/2026-05-19.md#7a7d6e84d2f7367b6d0c5e3284e8584f2bb30fa30a403560c737b3d715282beb
  - openclaw-memory://memory/dreaming/light/2026-05-19.md#81bb91984d55b28bd49d21bda8eb3968620033b9d4514757de85882eed1f43ab
  - openclaw-memory://memory/dreaming/light/2026-05-21.md#00c07ef0502c3bd2641eb2b20214359277fb0eb66e904b596144cf9626832936
  - openclaw-memory://memory/dreaming/light/2026-05-22.md#46b0d26c9af0639b668b51d5af8787cf43ed9e3a8158cf15d5c0f1cb1c66e01d
  - openclaw-memory://memory/dreaming/light/2026-05-23.md#2029cc5ea05fc088c3232f0e1be7502f9e916de48fbfebebdcebfa40f65ed5a2
  - openclaw-memory://memory/dreaming/rem/2026-04-26.md#1861802eb774243e34029c80d0498c49ba85a0af4799845f29f9288b2c94e6aa
  - openclaw-memory://memory/dreaming/rem/2026-04-26.md#749432d9796852b5cba16f39ec8c455d4555d4d8ce1da4376892ad50cd7a863e
  - openclaw-memory://memory/dreaming/rem/2026-04-27.md#5012d03760fccf0828b4d7d2ec7ee2a519001a80c321313cccfaaecbe5f5e07d
  - openclaw-memory://memory/dreaming/rem/2026-05-16.md#ea45d7f857a411fd4f759bdfbb1c87999813671869d57c00505154ff1fa0ece5
  - raw-vault://codex/rollout-2026-04-04T19-26-57-019d583f-02e6-74d0-9351-b636055d911c
source_hashes:
  - sha256:027fb599399a145d9b9ffbdb6a7531b5fe996d732dea12db17a3fcd879af19bc
  - sha256:0410203fc5a88ac90206f74614ab70742dd7c016686a6191817ce096b18da9d1
  - sha256:09aeb510beedbbc036cb32688c6377e57274e09c9dea18e28c2fd1a35ab7c5b3
  - sha256:16a7d4aa36eaefac34b8936e0e8da1158edbf84f09873b8b71a85e927eb7b77d
  - sha256:3ac783e2cb6a839947caf16354d8665162d90960fe56fcb9fc8dfd19556c6e8c
  - sha256:47cdef0992b68e074501cfcf7b883903ab88b758826ca4615f250f63d2189130
  - sha256:60740c81a685154bf174af2cdaf5e481ef720ac1709b1cd681a5b166687ed6cb
  - sha256:67eca72ba536d31a82830a1f359d23f48b7a1e8eb8db37faa3c54bb7c238c5b4
  - sha256:b1ca8a126f07f18040ac1a85ac31dcdd5cb370b8d11ed23896df0a08c1582e87
  - sha256:ca804c0f662e6ded304720c4dfebafd0371ebc5e9a6a26743aad364012eaac9b
  - sha256:d6ccf9175fad5202cc3f12088178828cc68992007b27d3bd444e7746c3eaa72a
  - sha256:d8e4f4a00e20c94f9a8116c72c73aa21cfbffc12d934158a1831e723fcb54078
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
- openclaw-memory://memory/dreaming/light/2026-05-19.md#031f4a8b604fa8778b57646e840eba51792addf50b4050001c37807435a4d494 (sha256:0410203fc5a88ac90206f74614ab70742dd7c016686a6191817ce096b18da9d1)
- openclaw-memory://memory/dreaming/light/2026-05-19.md#7a7d6e84d2f7367b6d0c5e3284e8584f2bb30fa30a403560c737b3d715282beb (sha256:09aeb510beedbbc036cb32688c6377e57274e09c9dea18e28c2fd1a35ab7c5b3)
- openclaw-memory://memory/dreaming/light/2026-05-19.md#81bb91984d55b28bd49d21bda8eb3968620033b9d4514757de85882eed1f43ab (sha256:16a7d4aa36eaefac34b8936e0e8da1158edbf84f09873b8b71a85e927eb7b77d)
- openclaw-memory://memory/dreaming/light/2026-05-21.md#00c07ef0502c3bd2641eb2b20214359277fb0eb66e904b596144cf9626832936 (sha256:3ac783e2cb6a839947caf16354d8665162d90960fe56fcb9fc8dfd19556c6e8c)
- openclaw-memory://memory/dreaming/light/2026-05-22.md#46b0d26c9af0639b668b51d5af8787cf43ed9e3a8158cf15d5c0f1cb1c66e01d (sha256:47cdef0992b68e074501cfcf7b883903ab88b758826ca4615f250f63d2189130)
- openclaw-memory://memory/dreaming/light/2026-05-23.md#2029cc5ea05fc088c3232f0e1be7502f9e916de48fbfebebdcebfa40f65ed5a2 (sha256:60740c81a685154bf174af2cdaf5e481ef720ac1709b1cd681a5b166687ed6cb)
- openclaw-memory://memory/dreaming/rem/2026-04-26.md#1861802eb774243e34029c80d0498c49ba85a0af4799845f29f9288b2c94e6aa (sha256:67eca72ba536d31a82830a1f359d23f48b7a1e8eb8db37faa3c54bb7c238c5b4)
- openclaw-memory://memory/dreaming/rem/2026-04-26.md#749432d9796852b5cba16f39ec8c455d4555d4d8ce1da4376892ad50cd7a863e (sha256:b1ca8a126f07f18040ac1a85ac31dcdd5cb370b8d11ed23896df0a08c1582e87)
- openclaw-memory://memory/dreaming/rem/2026-04-27.md#5012d03760fccf0828b4d7d2ec7ee2a519001a80c321313cccfaaecbe5f5e07d (sha256:ca804c0f662e6ded304720c4dfebafd0371ebc5e9a6a26743aad364012eaac9b)
- openclaw-memory://memory/dreaming/rem/2026-05-16.md#ea45d7f857a411fd4f759bdfbb1c87999813671869d57c00505154ff1fa0ece5 (sha256:d6ccf9175fad5202cc3f12088178828cc68992007b27d3bd444e7746c3eaa72a)
- raw-vault://codex/rollout-2026-04-04T19-26-57-019d583f-02e6-74d0-9351-b636055d911c (sha256:d8e4f4a00e20c94f9a8116c72c73aa21cfbffc12d934158a1831e723fcb54078)
