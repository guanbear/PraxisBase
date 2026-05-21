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

\`\`\`bash
praxisbase context get --agent codex --stage diagnosis --query "openclaw auth expired" --json
\`\`\`

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

## Optional MCP Bridge

An MCP stdio bridge is available for agents that prefer MCP tool calls over CLI:

\`\`\`bash
praxisbase mcp serve --stdio --workspace <path>
\`\`\`

Generated from manifest: ${manifest.id}
Manifest path: ${protocolPaths.agentToolsManifest}
`;
}
