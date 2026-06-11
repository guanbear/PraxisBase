---
id: ack-timing-before-long-running-agent-work
title: "ACK timing before long-running agent work"
protocol_version: "0.1"
type: pitfall
knowledge_type: pitfall
scope: personal
risk: medium
status: draft
maturity: draft
sources:
  - uri: "source-inventory://openclaw/../../.openclaw/memory/main.sqlite#2953ee38f9c8a6422d41165b5fedbc1af5d54c9582d035f952badea4ec101ed8"
    hash: "sha256:060dbc5e4afaa6b9ec682a179dc67ae90338fbc616243ecf02c61e3b43f56e27"
source_count: 1
confidence: 0.93
updated_at: "2026-06-02T04:13:16.313Z"
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

## Agent Use
Use this page when:
- A task will use tools, network calls, subagents, dispatch runners, or other work that may take more than a few seconds.

Apply it by:
- Send a short ACK before starting the slow work.
- Then continue with the tool, dispatch, or analysis work and report progress when useful.

Verify by:
- Confirm the user sees an initial response within 1-2 seconds.
- Check that the ACK appears before tool calls or dispatch activity in the interaction log.

Do not use it when:
- The request can be answered immediately without tools, waiting, or delegation.

## Provenance
- source-inventory://openclaw/../../.openclaw/memory/main.sqlite#2953ee38f9c8a6422d41165b5fedbc1af5d54c9582d035f952badea4ec101ed8 (sha256:060dbc5e4afaa6b9ec682a179dc67ae90338fbc616243ecf02c61e3b43f56e27)

## Related Wiki Pages
* [[openclaw-dispatch-routing-failures|OpenClaw dispatch routing failures]]
* [[openclaw-gateway-restart-after-configuration-changes|OpenClaw gateway restart after configuration changes]]
* [[openclaw-slack-replay-and-post-deploy-stability-failures|OpenClaw Slack replay and post-deploy stability failures]]
