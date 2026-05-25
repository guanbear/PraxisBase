---
id: verify-openclaw-agent-identification-response
title: "Verify OpenClaw Agent Model Identification and Response Capabilities"
protocol_version: "0.1"
type: procedure
knowledge_type: procedure
scope: personal
risk: medium
status: draft
maturity: draft
sources:
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-21.md#3a48807eed16ac4f762f21dba5c9655d7ebd31fe8553837b88f68929e89a6905"
    hash: "sha256:593ddcbcfa9883cf19dc7a55e133ee51fb36c96e7cd6cddf571213f465ed1c69"
source_count: 1
confidence: 0.93
updated_at: "2026-05-24T13:43:18.884Z"
---
# Verify OpenClaw Agent Model Identification and Response Capabilities

## When to Use
Use this procedure when validating the operational status of the OpenClaw agent after deployment, configuration changes, or when troubleshooting interaction issues. It is specifically applicable when you need to confirm the agent is routing to the correct model and processing basic text instructions accurately.

## Context
The OpenClaw agent must reliably identify the active model and execute simple text repetition tasks to ensure basic functionality in a live environment. Failures in these areas may indicate routing issues or model availability problems.

## Procedure
1. Initiate the acceptance test run for the case `footer_truth.current_model` to verify model identification.
2. Initiate the acceptance test run for the case `reply_core.simple_chat` to verify simple text repetition.
3. Execute these tests on the OpenClaw Macmini worker via Slack commands.

## Verify
- Confirm that the agent correctly identifies the active model (e.g., zhipu/GLM-5.1).
- Confirm that the agent successfully echoes the specific status messages or text provided in the input.

## Reusable Lessons
- The agent was successfully routed to use the zhipu/GLM-5.1 model during verification.
- Acceptance tests initiated via Slack commands provide an effective mechanism for live environment validation.

## Agent Use
Use this page when:
- You need to verify that OpenClaw is routed to the expected active model and can handle a simple live response.

Apply it by:
- Run the model identification acceptance case.
- Run a simple chat or echo acceptance case through the same live entry point.
- Prefer this as a narrow post-change smoke before deeper Slack delivery or replay debugging.

Verify by:
- Confirm the agent names the expected active model.
- Confirm the simple response matches the requested text or status.
- Confirm the test ran through the intended OpenClaw worker and entry point.

Do not use it when:
- The active model is already verified and the current failure is dispatch routing, replay availability, or full post-deploy stability.

## Provenance
Evidence derived from OpenClaw acceptance test execution logs dated 2026-05-21.

## Related Wiki Pages
* [[ack-timing-before-long-running-agent-work|ACK timing before long-running agent work]]
* [[missing-replay-data-compromises-the-ability-to-debug-or-verify-past-execution-behaviors|Missing replay data compromises the ability to debug or verify past execution behaviors]]
* [[openclaw-dispatch-routing-failures|OpenClaw dispatch routing failures]]
* [[openclaw-gateway-restart-after-configuration-changes|OpenClaw gateway restart after configuration changes]]
* [[openclaw-slack-replay-and-post-deploy-stability-failures|OpenClaw Slack replay and post-deploy stability failures]]
