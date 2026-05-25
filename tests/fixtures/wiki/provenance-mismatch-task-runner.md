---
id: wiki-openclaw-task-runner-presence-checks
title: "OpenClaw task runner presence checks"
sources:
  - uri: "openclaw-memory://memory/dreaming/light/2026-05-22.md#274f59a874f6147a724928e145304c0f7f0a58e0a826d0127c32bc84b7be8a53"
    hash: "sha256:17ff55c8b47a664a76f20ca32b303d38784c6400e4518ef9f21e5b86e4d27ef4"
---
# OpenClaw task runner presence checks

## When to Use
Use this guidance when the OpenClaw status dashboard displays `Runner: missing`.

## Fix
Verify the status aggregation payload includes the expected runner key.

## Verify
Confirm the dashboard no longer displays `Runner: missing`.

## Reusable Lessons
When a component appears missing in a dashboard, verify the payload before assuming the component has failed.

## Provenance
- openclaw-memory://memory/dreaming/light/2026-05-22.md#274f59a874f6147a724928e145304c0f7f0a58e0a826d0127c32bc84b7be8a53 (sha256:5834b62a4ef37fd3879e4e79c1ac16e0ca50918805cbb808ffee959f41636e9f)
