---
id: openclaw-dispatch-routing-failures
title: "OpenClaw dispatch routing failures"
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: personal
risk: medium
status: draft
maturity: draft
sources:
  - uri: "log://openclaw/2026-05-20-05-03-48-stability-report."
    hash: "sha256:027fb599399a145d9b9ffbdb6a7531b5fe996d732dea12db17a3fcd879af19bc"
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-19.md#031f4a8b604fa8778b57646e840eba51792addf50b4050001c37807435a4d494"
    hash: "sha256:0410203fc5a88ac90206f74614ab70742dd7c016686a6191817ce096b18da9d1"
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-19.md#7a7d6e84d2f7367b6d0c5e3284e8584f2bb30fa30a403560c737b3d715282beb"
    hash: "sha256:09aeb510beedbbc036cb32688c6377e57274e09c9dea18e28c2fd1a35ab7c5b3"
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-19.md#81bb91984d55b28bd49d21bda8eb3968620033b9d4514757de85882eed1f43ab"
    hash: "sha256:16a7d4aa36eaefac34b8936e0e8da1158edbf84f09873b8b71a85e927eb7b77d"
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-21.md#00c07ef0502c3bd2641eb2b20214359277fb0eb66e904b596144cf9626832936"
    hash: "sha256:3ac783e2cb6a839947caf16354d8665162d90960fe56fcb9fc8dfd19556c6e8c"
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-22.md#46b0d26c9af0639b668b51d5af8787cf43ed9e3a8158cf15d5c0f1cb1c66e01d"
    hash: "sha256:47cdef0992b68e074501cfcf7b883903ab88b758826ca4615f250f63d2189130"
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-23.md#2029cc5ea05fc088c3232f0e1be7502f9e916de48fbfebebdcebfa40f65ed5a2"
    hash: "sha256:60740c81a685154bf174af2cdaf5e481ef720ac1709b1cd681a5b166687ed6cb"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-04-26.md#1861802eb774243e34029c80d0498c49ba85a0af4799845f29f9288b2c94e6aa"
    hash: "sha256:67eca72ba536d31a82830a1f359d23f48b7a1e8eb8db37faa3c54bb7c238c5b4"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-04-26.md#749432d9796852b5cba16f39ec8c455d4555d4d8ce1da4376892ad50cd7a863e"
    hash: "sha256:b1ca8a126f07f18040ac1a85ac31dcdd5cb370b8d11ed23896df0a08c1582e87"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-04-27.md#5012d03760fccf0828b4d7d2ec7ee2a519001a80c321313cccfaaecbe5f5e07d"
    hash: "sha256:ca804c0f662e6ded304720c4dfebafd0371ebc5e9a6a26743aad364012eaac9b"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-05-16.md#ea45d7f857a411fd4f759bdfbb1c87999813671869d57c00505154ff1fa0ece5"
    hash: "sha256:d6ccf9175fad5202cc3f12088178828cc68992007b27d3bd444e7746c3eaa72a"
  - uri: "raw-vault://codex/rollout-2026-04-04T19-26-57-019d583f-02e6-74d0-9351-b636055d911c"
    hash: "sha256:d8e4f4a00e20c94f9a8116c72c73aa21cfbffc12d934158a1831e723fcb54078"
source_count: 12
confidence: 0.875
updated_at: "2026-05-25T06:29:07.726Z"
---
# OpenClaw dispatch routing failures

## When to Use

Apply this guidance when:

* OpenClaw or OctoClaw runners fail with `ReferenceError: stickyResult is not defined`.
* Post-deploy smoke tests report structural mismatches in delegation routes (e.g., expected `delegate` but got `reply`).
* The task queue shows zero active tasks or "Runner: missing" despite incoming requests.
* Sub-agent spawn attempts fail due to canonical hash mismatches or parameter validation errors.
* Long-running agent work is initiated without an initial user acknowledgment, leading to perceived unresponsiveness.

## Symptoms or Context

* **Runtime Dispatch Errors**: The `octoclaw_dispatch` process fails consecutively, often resulting in a complete inability to process tasks.
* **Structural Validation Failures**: In `slack_delivery` lanes, structural assertions regarding delegation route, footer, and transport mechanisms fail, even if message content is valid.
* **Hash Mismatches**: Sub-agent spawning fails because the canonical hash generated during dispatch does not match the hash received during spawn (`sessions_spawn` parameter validation failure).
* **Empty Status Panels**: The OctoClaw status panel indicates no running, queued, or recently completed tasks, suggesting a total dispatch failure rather than a delay.
* **Perceived Timeouts**: Tasks involving tools, internet access, or dispatch execution appear stalled because the agent did not send an immediate ACK message.

## What To Do

### Implement Asynchronous Acknowledgment Protocol

To mitigate user perception of delays during long-running operations:

1. Send a brief ACK (e.g., "收到，处理中") **immediately** before executing tasks that require tools, internet access, or dispatch.
2. Ensure this ACK is sent for any task expected to take longer than a few seconds.
3. This protocol is critical for maintaining user trust during sub-agent spawning or complex workflow execution.

### Diagnose the Dispatch Layer

When tasks fail to produce expected analysis or execution results, verify the health of the underlying dispatch/orchestration layer before investigating the analytical logic.

1. Check for `stickyResult is not defined` errors in logs, which indicate a systemic routing error in the dispatch chain.
2. Inspect the dispatched plan payload to ensure tasks are not incorrectly mapped to basic system checks (e.g., `openclaw --version`).
3. Review the `slack_delivery` lane logic for runtime bugs in delegation orchestration, specifically checking route and footer via path assertions.

### Normalize Parameters and Validate Hashes

1. Verify parameter normalization logic specifically around the `task` field when dispatching tasks.
2. Ensure that the canonical hash generation during dispatch is consistent with the hash validation during the `sessions_spawn` phase.
3. Confirm that the OpenClaw Gateway is operational and system load is acceptable, ruling out infrastructure issues.

### Monitor Dispatch Chain

1. Implement checks to detect when the runner is missing or when 0 active tasks are present.
2. Validate structural metadata (route, transport, session IDs) explicitly in post-deploy smoke tests.
3. Ensure delegation routes follow expected patterns (e.g., `delegate` vs `reply`) and footer transport mechanisms (e.g., `native_announce` vs `budgeted_main_escalation`) are correctly configured.

## Verify

* **User Interaction**: Confirm that immediate ACK messages are received by the user prior to the commencement of long-running tasks.
* **Log Analysis**: Confirm absence of `stickyResult` reference errors and successful completion of dispatch cycles.
* **Test Execution**: Post-deploy stability smoke tests (e.g., `slack_delivery` lane) should pass all structural assertions, including route, footer, and transport.
* **Queue Activity**: The OctoClaw status panel should show active, queued, or recently completed tasks corresponding to the workload.
* **Sub-agent Spawning**: Sub-agent creation should succeed without parameter validation or canonical hash errors.

## Reusable Lessons

* **ACK Timing**: Always send a brief ACK before executing tasks that require tools, internet access, dispatch, or may take more than a few seconds to prevent user confusion.
* **Dispatch First**: Always verify the health of the dispatch/orchestration layer before investigating specific task failures. A broken dispatch chain manifests as analysis failures, but the root cause is often routing.
* **Payload Hygiene**: Verify the dispatched plan payload to prevent tasks from being mapped to basic system checks (like version checks) instead of actual execution units.
* **Structural Integrity**: Structural metadata (route, transport, session IDs) must be explicitly asserted and validated, not just the message content.
* **Hash Consistency**: Ensure canonical hash generation is deterministic across the dispatch and spawn phases to prevent validation failures.

## Provenance

* OpenClaw stability reports and smoke tests (2026-05-20).
* REM sleep reflections and diagnostic logs regarding `octoclaw_dispatch` and `stickyResult` errors (2026-04-26, 2026-04-27).
* OpenClaw memory logs regarding task dispatching anomalies, user feedback on ACK protocols, and parameter validation (2026-05-16, 2026-05-21).

## Related Wiki Pages

* [[ack-timing-before-long-running-agent-work|ACK timing before long-running agent work]]
* [[openclaw-gateway-restart-after-configuration-changes|OpenClaw gateway restart after configuration changes]]
* [[openclaw-slack-replay-and-post-deploy-stability-failures|OpenClaw Slack replay and post-deploy stability failures]]
* [[missing-replay-data-compromises-the-ability-to-debug-or-verify-past-execution-behaviors|Missing replay data compromises the ability to debug or verify past execution behaviors]]
