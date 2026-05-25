---
id: ack-timing-before-long-running-agent-work
title: "ACK timing before long-running agent work"
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: personal
risk: medium
status: draft
maturity: draft
sources:
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-19.md#0515adc0c6cb05866dde0430a486081bc14e2affdf56c98650333135cf6d1377"
    hash: "sha256:48bc0992223467a35e94502aafde273dde342a81c0878d72f0a5a6f8528f678b"
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-19.md#2324fe2c0612eb837ae44e6a0be1095b6bca694a7b01f3cb1828b98111604900"
    hash: "sha256:779e588c09ccabaa1eed668d3abd85ae90242645de0060fb3dec41d1b1ad65ec"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-05-04.md#8f2014dc2533bf40b5825749502009f77abec17b14928c57ec719d9f40405e9a"
    hash: "sha256:88864a13bdf6ebb23862040a9dbf297a970ce0a6c50f058fcdccc77c3dac8fbc"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-05-14.md#3fc37d19de1530e5b72bce03038a3092997b5d7506d3d8b3d69ebec28cbcc709"
    hash: "sha256:8fd25d0c05b389385e10601e94001b6fe4899ae35b4ecd5c028dc32f12163132"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-05-15.md#7dcfdd7f2902791ae12471be2913916f66dd3a0434ed28a35d91da529cc93ba3"
    hash: "sha256:a1a9ca69c40e541cd06b609396a4419256a6e4a0f826e082c8913bb11b0d1e04"
source_count: 5
confidence: 0.9
updated_at: "2026-05-25T06:29:07.726Z"
---
# ACK timing before long-running agent work

## When to Use
Use this guidance when an agent is about to initiate any operation that may take more than a few seconds to complete, specifically:

* Executing external tools or plugins.
* Making network requests or API calls.
* Dispatching tasks to runners (e.g., OctoClaw).
* Performing complex analysis or deep reasoning that delays response.
* Encountering periods of system unresponsiveness or diagnostic debugging.

## Symptoms or Context
* Users perceive the agent as "slow" or "unresponsive" even when the system is functioning correctly.
* Client-side timeouts occur because the agent holds the connection open while processing long-running tasks.
* User feedback indicates a need for confirmation that a request was received.
* Interactive sessions feel sluggish due to the lack of immediate feedback during task execution.
* Subagents running at maximum depth combined with dispatch errors might fail silently if the user assumes the system has hung.

## Operating Rule
Always send a brief, user-facing acknowledgment (ACK) immediately after receiving a request, before initiating any long-running operation.

### Procedure
1. **Receive Request**: Accept the user input or trigger event.
2. **Send Immediate ACK**: Output a short, synchronous confirmation message immediately. Examples include:
   * "Received, looking into it."
   * "Processing..."
   * "On it."
3. **Execute Task**: Proceed with the actual operation (tool use, network call, dispatch).
4. **Deliver Result**: Provide the final output once the operation completes.

This rule applies regardless of the pipeline being used, including OpenClaw/OctoClaw dispatch systems. Before deep-diving into network or tool failures during periods of unresponsiveness, first acknowledge the delayed state to prevent redundant process spawning.

## Verify
* Check that the agent sends a response within 1-2 seconds of the user prompt.
* Review interaction logs to ensure an ACK message precedes all tool calls or network activity.
* Confirm that user feedback regarding "slowness" decreases after implementation.
* Validate that dispatch systems do not fail silently; an ACK confirms receipt even if the dispatch backend experiences issues.

## Reusable Lessons
* Sending an immediate ACK before processing prevents client-side timeouts and significantly improves perceived responsiveness.
* Failing to ACK long-running tasks degrades user experience and perceived agent reliability.
* During periods of unresponsiveness or diagnostic debugging, acknowledging the delayed state first prevents redundant process spawning or confusion about system status.
* Health/Version checks should be strictly isolated from complex analytical tasks in subagent dispatch architectures to prevent confusion during ACK sequences.

## Provenance
* Derived from aggregated memory fragments reflecting user feedback on OpenClaw/OctoClaw latency.
* Validated against specific incidents where task dispatching failed to register, highlighting the need for immediate user feedback loops.

## Related Wiki Pages
* [[missing-replay-data-compromises-the-ability-to-debug-or-verify-past-execution-behaviors|Missing replay data compromises the ability to debug or verify past execution behaviors]]
* [[openclaw-dispatch-routing-failures|OpenClaw dispatch routing failures]]
* [[openclaw-gateway-restart-after-configuration-changes|OpenClaw gateway restart after configuration changes]]
* [[openclaw-slack-replay-and-post-deploy-stability-failures|OpenClaw Slack replay and post-deploy stability failures]]
