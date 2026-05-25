---
id: wiki-openclaw-task-runner-presence-checks
title: "OpenClaw task runner presence checks"
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: personal
risk: medium
status: draft
maturity: draft
sources:
  - uri: "openclaw-memory://memory/dreaming/rem/2026-05-03.md#47f01b017375198732b69d88bf3677bf5abad5f8c79d31a1bffba45a8dd88677"
    hash: "sha256:17ff55c8b47a664a76f20ca32b303d38784c6400e4518ef9f21e5b86e4d27ef4"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-05-17.md#2f29b922ed0bdf584e8ac349f2c2f433ee2a8616028c4abe427965399b128a06"
    hash: "sha256:341a9335b3611127a63b0dc936b7bdc1541c670283fa44647fc2ad965dc5df1c"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-05-19.md#eb075811d02df256893f6b9559157ab5e1c9e86f75c6419b2097f20df2e3e43c"
    hash: "sha256:5029e5479ef592d2a5e94578125264ad06af32481b2a6e513d3b6340daa51e01"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-05-20.md#17312d1fc3450be52df9200a0ebc6a8749137f44a3229978b8fcb7f3ec7a91df"
    hash: "sha256:97e5a2335a52ce9ef1ae7307eee2db2491d4712e5023d9bd385cebca168ab219"
  - uri: "openclaw-memory://memory/dreaming/rem/2026-05-22.md#697ee6d9b87304989f135d3c4249b51cabc0dfda6d657c46a6c9fd404e2998fa"
    hash: "sha256:ee7d82d920ea71220330baf97b252ba64fb6c212bed258f8aac387ba882229f1"
source_count: 5
confidence: 0.85
updated_at: "2026-05-24T13:43:18.884Z"
---
# OpenClaw task runner presence checks

## When to Use
Use this when Analysis of a status dashboard bug where the runner appeared as 'missing' due to an omitted key in the system's dictionary response, alongside fragmented operational logs.

## Symptoms
Analysis of a status dashboard bug where the runner appeared as 'missing' due to an omitted key in the system's dictionary response, alongside fragmented operational logs.

## What To Do
- If OctoClaw shows `Runner: missing` with 0 running/queued tasks, verify the dispatch chain immediately for corrupted or misrouted plans
- If a monitoring dashboard reports a service as down or missing, verify the data aggregation layer (the collator/parser) before investigating the service itself
- Inspected task details to verify actual vs
- When checking for hanging tasks, also explicitly verify if the task runner itself is present or missing (0/0 tasks might mean the runner is offline)
- When monitoring automated task runners, verify actual execution plans against user intent rather than just checking task completion status

## Failed Attempts
- Dispatching analytical tasks failed
- Failed Attempts

## Verify
- A complex task ('analyze OpenClaw 4.11 new features') was incorrectly mapped to a basic version check ('openclaw --version'), leaving the actual analysis undone
- If OctoClaw shows `Runner: missing` with 0 running/queued tasks, verify the dispatch chain immediately for corrupted or misrouted plans
- If a monitoring dashboard reports a service as down or missing, verify the data aggregation layer (the collator/parser) before investigating the service itself
- Inspected task details to verify actual vs

## Reusable Lessons
- {"lesson":"When constructing status or health check dictionaries, ensure all top-level keys expected by the consumer (e.g., the dashboard) are explicitly included, even if their values are empty or derived from adjacent keys.","confidence":0.8}

## Agent Use
Use this page when:
- OctoClaw shows `Runner: missing`, a dashboard shows no running or queued tasks, or a task appears completed without the intended execution.

Apply it by:
- Verify the runner presence and dispatch chain before investigating the requested task content.
- Compare the actual execution plan against the user's requested work.
- Check dashboard aggregation keys before assuming the runner service is down.

Verify by:
- Confirm the runner status is present and the queue reflects real work.
- Confirm the execution plan matches user intent instead of a trivial status command.
- Confirm status dictionaries include the top-level keys expected by the dashboard.

Do not use it when:
- The runner is present and the failure is isolated to Slack delivery, replay data, or gateway configuration.

## Provenance
- openclaw-memory://memory/dreaming/rem/2026-05-03.md#47f01b017375198732b69d88bf3677bf5abad5f8c79d31a1bffba45a8dd88677 (sha256:17ff55c8b47a664a76f20ca32b303d38784c6400e4518ef9f21e5b86e4d27ef4)
- openclaw-memory://memory/dreaming/rem/2026-05-17.md#2f29b922ed0bdf584e8ac349f2c2f433ee2a8616028c4abe427965399b128a06 (sha256:341a9335b3611127a63b0dc936b7bdc1541c670283fa44647fc2ad965dc5df1c)
- openclaw-memory://memory/dreaming/rem/2026-05-19.md#eb075811d02df256893f6b9559157ab5e1c9e86f75c6419b2097f20df2e3e43c (sha256:5029e5479ef592d2a5e94578125264ad06af32481b2a6e513d3b6340daa51e01)
- openclaw-memory://memory/dreaming/rem/2026-05-20.md#17312d1fc3450be52df9200a0ebc6a8749137f44a3229978b8fcb7f3ec7a91df (sha256:97e5a2335a52ce9ef1ae7307eee2db2491d4712e5023d9bd385cebca168ab219)
- openclaw-memory://memory/dreaming/rem/2026-05-22.md#697ee6d9b87304989f135d3c4249b51cabc0dfda6d657c46a6c9fd404e2998fa (sha256:ee7d82d920ea71220330baf97b252ba64fb6c212bed258f8aac387ba882229f1)

## Related Wiki Pages
- [[ack-timing-before-long-running-agent-work|ACK timing before long-running agent work]] - entity_overlap
- [[missing-replay-data-compromises-the-ability-to-debug-or-verify-past-execution-behaviors|Missing replay data compromises the ability to debug or verify past execution behaviors]] - entity_overlap
- [[openclaw-dispatch-routing-failures|OpenClaw dispatch routing failures]] - entity_overlap
