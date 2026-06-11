import { PROTOCOL_VERSION } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { writeJson } from "../store/file-store.js";
import { makeId } from "../protocol/id.js";
import type { AgentToolManifest, AgentToolDescriptor } from "../protocol/schemas.js";
import type { AgentProfile } from "../protocol/types.js";

export interface AgentAccessInput {
  agent: AgentProfile;
}

const CANONICAL_TOOLS: AgentToolDescriptor[] = [
  {
    name: "context_get",
    description: "Retrieve repair context from stable knowledge and wiki",
    command: ["context", "get"],
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        stage: { type: "string" },
        query: { type: "string" },
        max_bytes: { type: "number" },
      },
      required: ["agent", "stage"],
    },
    mutates: "reports",
    dry_run_supported: true,
    requires_human_review: false,
  },
  {
    name: "harvest",
    description: "Harvest agent experience from local or remote sources",
    command: ["harvest"],
    input_schema: {
      type: "object",
      properties: {
        codex: { type: "string" },
        openclaw: { type: "string" },
        openclaw_export: { type: "string" },
        dry_run: { type: "boolean" },
        build_site: { type: "boolean" },
      },
    },
    mutates: "inbox",
    dry_run_supported: true,
    requires_human_review: false,
  },
  {
    name: "capture_finish",
    description: "Record a completed agent capture with summary",
    command: ["capture", "finish"],
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        result: { type: "string" },
        source_ref: { type: "string" },
        source_hash: { type: "string" },
        summary: { type: "string" },
      },
      required: ["agent", "result", "source_ref", "source_hash", "summary"],
    },
    mutates: "outbox",
    dry_run_supported: false,
    requires_human_review: false,
  },
  {
    name: "wiki_compile",
    description: "Compile wiki from knowledge sources and generate proposal candidates",
    command: ["wiki", "compile"],
    input_schema: {
      type: "object",
      properties: {
        dry_run: { type: "boolean" },
        review: { type: "boolean" },
      },
    },
    mutates: "proposals",
    dry_run_supported: true,
    requires_human_review: true,
  },
  {
    name: "wiki_graph",
    description: "Build wiki link graph and health summary",
    command: ["wiki", "graph"],
    input_schema: {
      type: "object",
      properties: {},
    },
    mutates: "reports",
    dry_run_supported: true,
    requires_human_review: false,
  },
  {
    name: "wiki_build_site",
    description: "Build static wiki site with pages, search index, and LLM exports",
    command: ["wiki", "build-site"],
    input_schema: {
      type: "object",
      properties: {},
    },
    mutates: "reports",
    dry_run_supported: false,
    requires_human_review: false,
  },
  {
    name: "health",
    description: "Report wiki health through graph and lint summaries",
    command: ["wiki", "graph"],
    input_schema: {
      type: "object",
      properties: {},
    },
    mutates: "reports",
    dry_run_supported: true,
    requires_human_review: false,
  },
];

export function listAgentToolDescriptors(): AgentToolDescriptor[] {
  return CANONICAL_TOOLS.map((tool) => ({
    ...tool,
    command: [...tool.command],
    input_schema: { ...tool.input_schema },
  }));
}

export function buildAgentToolManifest(
  workspace: string,
  input: AgentAccessInput
): AgentToolManifest {
  return {
    id: makeId("agent-tool-manifest", `${workspace}-${input.agent}`),
    protocol_version: PROTOCOL_VERSION,
    type: "agent_tool_manifest",
    workspace,
    generated_at: new Date().toISOString(),
    tools: listAgentToolDescriptors(),
  };
}

export async function writeAgentToolManifest(
  root: string,
  manifest: AgentToolManifest
): Promise<void> {
  await writeJson(root, protocolPaths.agentToolsManifest, manifest);
}
