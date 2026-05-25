import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { PROTOCOL_VERSION } from "@praxisbase/core/protocol/types.js";
import {
  AgentToolManifestSchema,
  AgentToolDescriptorSchema,
  McpToolManifestSchema,
} from "@praxisbase/core/protocol/schemas.js";
import { buildAgentToolManifest, writeAgentToolManifest } from "@praxisbase/core/agent-access/manifest.js";
import { generateSkill } from "@praxisbase/core/agent-access/skill.js";

// ---------------------------------------------------------------------------
// Task 1: Protocol paths and schemas
// ---------------------------------------------------------------------------

describe("protocol paths for agent access", () => {
  it("has agentTools path", () => {
    assert.equal(protocolPaths.agentTools, ".praxisbase/agent-tools");
  });

  it("has agentToolsSkills path", () => {
    assert.equal(protocolPaths.agentToolsSkills, ".praxisbase/agent-tools/skills");
  });

  it("has agentToolsManifest path", () => {
    assert.equal(protocolPaths.agentToolsManifest, ".praxisbase/agent-tools/manifest.json");
  });

  it("has mcpManifest path", () => {
    assert.equal(protocolPaths.mcpManifest, ".praxisbase/agent-tools/mcp.json");
  });

  it("has reportsWikiQuality path", () => {
    assert.equal(protocolPaths.reportsWikiQuality, ".praxisbase/reports/wiki-quality");
  });

  it("has runsWiki path", () => {
    assert.equal(protocolPaths.runsWiki, ".praxisbase/runs/wiki");
  });
});

describe("AgentToolManifest schema", () => {
  it("parses a valid manifest", () => {
    const manifest = {
      id: "atm_test1",
      protocol_version: PROTOCOL_VERSION,
      type: "agent_tool_manifest",
      workspace: "/tmp/test",
      generated_at: "2026-05-21T00:00:00.000Z",
      tools: [
        {
          name: "context_get",
          description: "Get context for repair",
          command: ["context", "get"],
          input_schema: { type: "object" },
          mutates: "reports",
          dry_run_supported: true,
          requires_human_review: false,
        },
      ],
    };
    const result = AgentToolManifestSchema.safeParse(manifest);
    assert.ok(result.success, `Parse should succeed: ${JSON.stringify(result)}`);
  });
});

describe("AgentToolDescriptor schema", () => {
  it("parses a valid descriptor", () => {
    const descriptor = {
      name: "harvest",
      description: "Harvest agent experience",
      command: ["harvest"],
      input_schema: { type: "object" },
      mutates: "inbox",
      dry_run_supported: true,
      requires_human_review: false,
    };
    const result = AgentToolDescriptorSchema.safeParse(descriptor);
    assert.ok(result.success, `Parse should succeed: ${JSON.stringify(result)}`);
  });
});

describe("McpToolManifest schema", () => {
  it("parses a valid MCP manifest", () => {
    const mcpManifest = {
      id: "mcp_test1",
      protocol_version: PROTOCOL_VERSION,
      type: "mcp_tool_manifest",
      transport: "stdio",
      command: "praxisbase",
      args: ["mcp", "serve", "--stdio", "--workspace", "/tmp/test"],
      tools: ["praxisbase_context_get"],
      generated_at: "2026-05-21T00:00:00.000Z",
    };
    const result = McpToolManifestSchema.safeParse(mcpManifest);
    assert.ok(result.success, `Parse should succeed: ${JSON.stringify(result)}`);
  });
});

// ---------------------------------------------------------------------------
// Task 2: Canonical Agent Tool Manifest
// ---------------------------------------------------------------------------

describe("buildAgentToolManifest", () => {
  it("returns a manifest with stable tool names for codex agent", () => {
    const root = "/tmp/test-workspace";
    const manifest = buildAgentToolManifest(root, { agent: "codex" });

    assert.equal(manifest.type, "agent_tool_manifest");
    assert.equal(manifest.protocol_version, PROTOCOL_VERSION);
    assert.equal(manifest.workspace, root);

    const toolNames = manifest.tools.map((t) => t.name);
    assert.ok(toolNames.includes("context_get"), "must include context_get");
    assert.ok(toolNames.includes("harvest"), "must include harvest");
    assert.ok(toolNames.includes("capture_finish"), "must include capture_finish");
    assert.ok(toolNames.includes("wiki_compile"), "must include wiki_compile");
    assert.ok(toolNames.includes("wiki_graph"), "must include wiki_graph");
    assert.ok(toolNames.includes("wiki_build_site"), "must include wiki_build_site");
    assert.ok(toolNames.includes("health"), "must include health");
  });

  it("uses a stable manifest id for the same workspace and agent", () => {
    const a = buildAgentToolManifest("/tmp/test", { agent: "codex" });
    const b = buildAgentToolManifest("/tmp/test", { agent: "codex" });

    assert.equal(a.id, b.id);
  });

  it("context_get has mutates: reports because it writes a context report", () => {
    const manifest = buildAgentToolManifest("/tmp/test", { agent: "codex" });
    const ctx = manifest.tools.find((t) => t.name === "context_get");
    assert.ok(ctx, "context_get must exist");
    assert.equal(ctx.mutates, "reports");
  });

  it("returns cloned tool descriptors so callers cannot mutate canonical tools", () => {
    const first = buildAgentToolManifest("/tmp/test", { agent: "codex" });
    first.tools[0].name = "changed";

    const second = buildAgentToolManifest("/tmp/test", { agent: "codex" });

    assert.equal(second.tools[0].name, "context_get");
  });

  it("harvest has dry_run_supported: true", () => {
    const manifest = buildAgentToolManifest("/tmp/test", { agent: "codex" });
    const harvest = manifest.tools.find((t) => t.name === "harvest");
    assert.ok(harvest, "harvest must exist");
    assert.equal(harvest.dry_run_supported, true);
  });

  it("no tool has mutates: stable_knowledge", () => {
    const manifest = buildAgentToolManifest("/tmp/test", { agent: "codex" });
    for (const tool of manifest.tools) {
      assert.notEqual(
        tool.mutates,
        "stable_knowledge",
        `tool ${tool.name} must not mutate stable_knowledge`
      );
    }
  });

  it("manifest validates against AgentToolManifestSchema", () => {
    const manifest = buildAgentToolManifest("/tmp/test", { agent: "codex" });
    const result = AgentToolManifestSchema.safeParse(manifest);
    assert.ok(result.success, `Built manifest must validate: ${JSON.stringify(result)}`);
  });
});

describe("writeAgentToolManifest", () => {
  it("writes manifest.json to the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-agent-tools-"));
    const manifest = buildAgentToolManifest(root, { agent: "codex" });

    await writeAgentToolManifest(root, manifest);

    const written = JSON.parse(
      await readFile(join(root, protocolPaths.agentToolsManifest), "utf8")
    );
    assert.equal(written.type, "agent_tool_manifest");
    assert.equal(written.id, manifest.id);
    assert.deepEqual(written.tools, manifest.tools);
  });
});

describe("generateSkill", () => {
  it("mentions daily run, source add, context get, and team privacy rules", () => {
    const manifest = buildAgentToolManifest("/tmp/test", { agent: "codex" });
    const skill = generateSkill(manifest);

    assert.ok(skill.includes("praxisbase personal init"), "must mention personal init");
    assert.ok(skill.includes("praxisbase personal run"), "must mention personal run");
    assert.ok(skill.includes("praxisbase source add"), "must mention praxisbase source add");
    assert.ok(skill.includes("praxisbase daily run"), "must mention praxisbase daily run");
    assert.ok(skill.includes("praxisbase context get"), "must mention praxisbase context get");
    assert.ok(skill.includes("--with-agentmemory"), "must mention AgentMemory sidecar retrieval");
    assert.ok(
      skill.includes("team mode rejects personal scope"),
      "must mention team mode rejects personal scope"
    );
  });
});
