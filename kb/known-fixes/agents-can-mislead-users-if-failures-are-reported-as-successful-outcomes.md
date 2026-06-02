---
id: agents-can-mislead-users-if-failures-are-reported-as-successful-outcomes
title: Agents can mislead users if failures are reported as successful outcomes.
protocol_version: '0.1'
type: known_fix
knowledge_type: known_fix
scope: personal
risk: medium
status: draft
maturity: draft
sources:
  - uri: >-
      source-inventory://openclaw/../../.openclaw/memory/main.sqlite#5e011796e9e4e2b34d4f2621e990675c478d8ba0964a678077a22b582a523d70
    hash: 'sha256:ad9b1897cf677fe8407009f01998a4b3dd6452f9eedff1056e6fe1a5cdfec94d'
source_count: 1
confidence: 0.93
updated_at: '2026-06-02T04:13:16.313Z'
---
# Agents can mislead users if failures are reported as successful outcomes.

## When to Use
Use this guidance when designing or operating agents that perform operations, delegate tasks, or enforce guards. It is particularly relevant when implementing error handling, status reporting, or verification logic.

## Symptoms or Context
Agents may report a task as "completed" or "successful" even when the underlying work failed, returned an error, or the outcome could not be verified. This creates a false sense of security and can lead to data inconsistency or further operational failures.

## What To Do
Implement a "fail closed" strategy for all operations, delegations, and guards. If an operation fails, returns an uncertain status, or cannot be verified, the agent must explicitly state the failure. **Do not pretend success when the underlying work failed or was not verified.**

## Verify
Check that success is only reported after confirmed successful completion of the task. Ensure that any exception, error code, or timeout results in a failure status being communicated to the user or calling system.

## Reusable Lessons
* When an operation, delegation, or guard fails or returns uncertain status, fail closed and state the failure honestly instead of claiming success.
* Do not pretend success when the underlying work failed or was not verified.

## Agent Use
* **Use this page when:** You are implementing agent logic that handles external API calls, file system operations, or sub-agent delegation, specifically within the error handling or response generation blocks.
* **Apply it by:** Ensuring your control flow strictly separates "executed" and "verified successful." Only return a success signal if the verification step passes.
* **Verify by:** Reviewing logs and traces to confirm that no successful status codes were returned corresponding to error IDs or exception logs.
* **Do not use it when:** The operation is a pure "best effort" fire-and-forget task where verification is explicitly defined as out of scope (though this should be rare in high-stakes environments).

## Provenance
- source-inventory://openclaw/../../.openclaw/memory/main.sqlite#5e011796e9e4e2b34d4f2621e990675c478d8ba0964a678077a22b582a523d70 (sha256:ad9b1897cf677fe8407009f01998a4b3dd6452f9eedff1056e6fe1a5cdfec94d)

## Related Wiki Pages
ACK timing before long-running agent work
[[openclaw-dispatch-routing-failures|OpenClaw dispatch routing failures]]
OpenClaw gateway restart after configuration changes
[[openclaw-slack-replay-and-post-deploy-stability-failures|OpenClaw Slack replay and post-deploy stability failures]]
