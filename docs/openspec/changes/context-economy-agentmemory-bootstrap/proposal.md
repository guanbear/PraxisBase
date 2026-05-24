# Proposal: Context Economy, AgentMemory Interop, And Personal Bootstrap

## Why

PraxisBase's personal mode needs to become cheaper, faster, and easier to start. Real runs have shown that AI distill receives too much low-signal material, live session memory overlaps with mature tools such as `agentmemory`, and first-run setup still exposes internal commands instead of a coherent workflow.

## What Changes

- Add a deterministic pre-AI context economy layer that reduces noisy source material before chunking and AI distill.
- Add first-class `agentmemory` interop as source, sink, and optional retrieval sidecar.
- Add `praxisbase personal ...` commands for init/connect/doctor/run/schedule.
- Extend reports and the generated site with context economy savings and agentmemory health.
- Generate agent-facing first-run guidance so Codex/OpenClaw can operate PraxisBase safely.

## What Does Not Change

- PraxisBase `kb/` remains the durable wiki authority.
- `agentmemory` does not replace wiki synthesis, semantic review, provenance, or promotion policy.
- GitHub/GitLab is not required for personal mode.
- Team mode remains strict about personal content and explicit export policy.

## Success Criteria

- Personal daily runs report meaningful AI input byte savings.
- AgentMemory can be imported from and exported to without storing secrets in config.
- Stable PraxisBase wiki context outranks agentmemory sidecar retrieval.
- A new user can initialize and run personal mode through `praxisbase personal` commands.
- The generated HTML site shows latest knowledge, review status, context economy savings, and agentmemory health.
