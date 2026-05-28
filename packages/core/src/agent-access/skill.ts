import type { AgentToolManifest } from "../protocol/schemas.js";
import { protocolPaths } from "../protocol/paths.js";

export function generateSkill(manifest: AgentToolManifest): string {
  const toolList = manifest.tools
    .map((t) => `  - \`${t.command.join(" ")}\` - ${t.description}`)
    .join("\n");

  return `# PraxisBase Agent Skill

## Overview

PraxisBase provides durable knowledge capture for disposable agents. Use this skill to get context before repair, capture experience after repair, and build a shared wiki.

## When To Use

- Before starting a repair or diagnosis task
- After completing a successful or failed repair
- When building or inspecting the wiki knowledge base
- When checking workspace health

## Available Tools

${toolList}

## Safety Rules

- **Never** store raw logs, cookies, tokens, headers, private keys, or full chat bodies.
- **Never** mutate stable \`kb/\` or \`skills/\` directly. All changes go through proposal, review, and promote.
- Always use \`--dry-run\` first for mutating commands.
- Respect scope boundaries. Personal knowledge must not be auto-promoted to team/org scope.
- Production daily synthesis requires AI distill. Use degraded mode only for bootstrap/offline smoke.

## First Run

\`\`\`bash
praxisbase personal init --agent codex --json
praxisbase personal doctor --json
praxisbase personal run --open --json
\`\`\`

The \`personal\` command group is the preferred first-run UX. It configures safe local sources, writes agent access assets, runs daily collection, builds \`dist/index.html\`, and keeps personal knowledge local by default.

Legacy equivalent:

\`\`\`bash
praxisbase bootstrap personal --agent codex --install-skill --json
praxisbase ai init --provider openai-compatible --model <model> --json
praxisbase ai doctor --json
praxisbase daily run --mode personal --build-site --json
\`\`\`

Open \`dist/index.html\` after the daily run to inspect generated experience pages.

## Local Harvest

\`\`\`bash
praxisbase harvest --codex <path> --dry-run --json
praxisbase harvest --codex <path> --build-site --json
\`\`\`

## Remote Harvest

\`\`\`bash
praxisbase harvest --openclaw <path> --dry-run --json
praxisbase harvest --openclaw-export <json-file> --build-site --json
\`\`\`

## Context Before Repair

GBrain MCP is the default broad brain lookup path when GBrain is configured. Use PraxisBase for governed experience context and audit, not as a replacement for the GBrain brain runtime.

\`\`\`bash
praxisbase context get --agent codex --stage diagnosis --query "openclaw auth expired" --json
praxisbase context bundle --agent codex --stage diagnosis --query "openclaw auth expired" --mode personal --json
praxisbase skill inject-preview --query "openclaw auth expired" --json
praxisbase personal profile list --json
praxisbase context get --agent codex --stage diagnosis --query "openclaw auth expired" --with-gbrain --json
praxisbase context get --agent codex --stage diagnosis --query "openclaw auth expired" --with-agentmemory --json
\`\`\`

Context should come from compiled wiki pages, root wiki artifacts, graph neighbors, and provenance pointers. Use GBrain MCP for broad brain lookup across personal or team memory. Use \`--with-gbrain\` and \`--with-agentmemory\` only as sidecars for recall; stable PraxisBase wiki context remains the authority and should outrank sidecar hits. Use PraxisBase CLI for governed capture, review, promotion, and privacy gates. Do not rely on raw vault bodies as repair instructions.
Use \`context bundle\` when injecting runtime context into an agent prompt: it applies M24 context juice budgets, trust summaries, citation-preserving omission, and untrusted-source wrapping. Use \`skill inject-preview\` to inspect which promoted PraxisBase skills would be injected; candidate or external skills are excluded by default.

## Capture After Repair

\`\`\`bash
praxisbase capture finish --agent codex --result success --source-ref "raw-vault://codex/session-1" --source-hash "sha256:abc123" --summary "Fixed auth by refreshing login." --json
\`\`\`

## Build And Inspect Wiki

\`\`\`bash
praxisbase wiki compile --dry-run --json
praxisbase wiki compile --review --json
praxisbase wiki graph --json
praxisbase wiki build-site --json
\`\`\`

## Review And Promote

Changes to stable knowledge require review and promotion:

\`\`\`bash
praxisbase review --auto
praxisbase promote --auto
\`\`\`

Check \`.praxisbase/exceptions/human-required\` after daily or compile runs. Anything there needs a human privacy or correctness decision before promotion.

## Optional MCP Bridge

An MCP stdio bridge is available for agents that prefer MCP tool calls over CLI:

\`\`\`bash
praxisbase mcp serve --stdio --workspace <path>
\`\`\`

## Configure Sources

\`\`\`bash
praxisbase source add local-codex --agent codex --type local --path ~/.codex/archived_sessions --scope personal
praxisbase source add local-claude-code --agent claude-code --type local --path ~/.claude/transcripts --scope personal
praxisbase source add local-opencode --agent opencode --type local --path ~/.local/share/opencode/log --scope personal
praxisbase source add openclaw-bot --agent openclaw --channel feishu --type openclaw-api --remote bot-prod --scope team
praxisbase source list --json
\`\`\`

## Daily Personal

\`\`\`bash
praxisbase personal run --json
praxisbase daily run --mode personal --build-site --json
\`\`\`

Read the JSON \`next_actions\` field after every personal or daily run. Follow the loop in this order:

1. If \`next_actions.status\` is \`needs_privacy_triage\`, run:

\`\`\`bash
praxisbase privacy triage --mode personal --auto-release --json
praxisbase personal run --open --json
\`\`\`

2. If \`next_actions.status\` is \`needs_review\`, inspect \`dist/review.html\` and run:

\`\`\`bash
praxisbase review --auto
praxisbase promote --auto
praxisbase wiki build-site --json
\`\`\`

3. If \`next_actions.status\` is \`ready_to_export_gbrain\`, share only stable wiki lessons back to the default GBrain MCP brain and session memory:

\`\`\`bash
praxisbase gbrain export --mode personal --write --json
praxisbase agentmemory export --mode personal --write --json
\`\`\`

Do not export raw evidence, review candidates, rejected material, or human-required material to GBrain or AgentMemory.

For offline smoke only:

\`\`\`bash
praxisbase daily run --mode personal --degraded --build-site --json
\`\`\`

## Daily Team

\`\`\`bash
praxisbase daily run --mode team-git --branch harvest/daily --commit --push --build-site --json
\`\`\`

team mode rejects personal scope, private chat content, and raw credentials before proposal generation.

Generated from manifest: ${manifest.id}
Manifest path: ${protocolPaths.agentToolsManifest}
`;
}
