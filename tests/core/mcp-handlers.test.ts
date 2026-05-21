import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMcpToolManifest,
  callMcpTool,
  handleMcpJsonRpc,
  listMcpTools,
  writeMcpToolManifest,
} from "@praxisbase/core/agent-access/mcp.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";

async function seedKnownFix(root: string): Promise<void> {
  await mkdir(join(root, "kb/known-fixes"), { recursive: true });
  await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), [
    "---",
    "id: openclaw-auth-expired",
    "type: known_fix",
    "knowledge_type: known_fix",
    "scope: project",
    "maturity: verified",
    "signatures:",
    "  - openclaw:auth-expired",
    "---",
    "# OpenClaw Auth Expired",
    "",
    "Refresh login when OpenClaw reports expired authentication.",
  ].join("\n"));
}

describe("MCP manifest helpers", () => {
  it("builds and writes the MCP manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-mcp-core-"));
    const manifest = buildMcpToolManifest(root);

    assert.equal(manifest.type, "mcp_tool_manifest");
    assert.ok(manifest.tools.includes("praxisbase_context_get"));

    await writeMcpToolManifest(root, manifest);
    const written = JSON.parse(await readFile(join(root, protocolPaths.mcpManifest), "utf8"));
    assert.deepEqual(written, manifest);
  });

  it("lists tools with mutates metadata and input schemas", () => {
    const tools = listMcpTools();
    const compile = tools.find((tool) => tool.name === "praxisbase_wiki_compile");

    assert.ok(compile, "compile tool must be listed");
    assert.equal(compile.mutates, "proposals");
    assert.equal(compile.requires_human_review, true);
    assert.equal(typeof compile.inputSchema, "object");
  });
});

describe("MCP tool handlers", () => {
  it("context_get returns CLI-compatible context JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-mcp-core-"));
    await seedKnownFix(root);

    const result = await callMcpTool(root, "praxisbase_context_get", {
      agent: "codex",
      stage: "diagnosis",
      query: "openclaw auth expired",
    }) as {
      ok: boolean;
      context: {
        items: unknown[];
        citations: unknown[];
        truncated: boolean;
        budget: { used_bytes: number };
      };
    };

    assert.equal(result.ok, true);
    assert.ok(result.context.items.length >= 1);
    assert.ok(Array.isArray(result.context.citations));
    assert.equal(result.context.truncated, false);
    assert.equal(typeof result.context.budget.used_bytes, "number");
  });

  it("wiki_compile dry-run reports changed_stable_knowledge false", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-mcp-core-"));

    const result = await callMcpTool(root, "praxisbase_wiki_compile", {
      dry_run: true,
    }) as {
      ok: boolean;
      report: { mode: string; changed_stable_knowledge: boolean };
    };

    assert.equal(result.ok, true);
    assert.equal(result.report.mode, "dry-run");
    assert.equal(result.report.changed_stable_knowledge, false);
  });

  it("harvest defaults to dry-run and does not change stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-mcp-core-"));

    const result = await callMcpTool(root, "praxisbase_harvest", {}) as {
      ok: boolean;
      report: { mode: string; changed_stable_knowledge: boolean };
    };

    assert.equal(result.ok, true);
    assert.equal(result.report.mode, "dry-run");
    assert.equal(result.report.changed_stable_knowledge, false);
  });

  it("capture_finish writes an outbox capture through the same core path", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-mcp-core-"));

    const result = await callMcpTool(root, "praxisbase_capture_finish", {
      agent: "codex",
      result: "success",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:abc123",
      summary: "Fixed OpenClaw auth expired with a refreshed login.",
    }) as { ok: boolean; path: string };

    assert.equal(result.ok, true);
    assert.match(result.path, /^\.praxisbase\/outbox\/captures\//);
  });

  it("wiki_graph, wiki_build_site, and health return JSON-compatible reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-mcp-core-"));

    const graph = await callMcpTool(root, "praxisbase_wiki_graph", {}) as {
      ok: boolean;
      health: { pages: number };
    };
    const site = await callMcpTool(root, "praxisbase_wiki_build_site", {}) as {
      ok: boolean;
      result: { pages: number };
    };
    const health = await callMcpTool(root, "praxisbase_health", {}) as {
      ok: boolean;
      health: { pages: number };
    };

    assert.equal(graph.ok, true);
    assert.equal(graph.health.pages, 0);
    assert.equal(site.ok, true);
    assert.equal(site.result.pages, 0);
    assert.equal(health.ok, true);
    assert.equal(health.health.pages, 0);
  });

  it("handles JSON-RPC tools/list and tools/call", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-mcp-core-"));
    await seedKnownFix(root);

    const list = await handleMcpJsonRpc(root, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }) as {
      id: number;
      result: { tools: Array<{ name: string }> };
    };
    assert.equal(list.id, 1);
    assert.ok(list.result.tools.some((tool: { name: string }) => tool.name === "praxisbase_context_get"));

    const call = await handleMcpJsonRpc(root, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "praxisbase_context_get",
        arguments: {
          agent: "codex",
          stage: "diagnosis",
          query: "openclaw auth expired",
        },
      },
    }) as {
      id: number;
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    assert.equal(call.id, 2);
    assert.equal(call.result.isError, false);
    assert.match(call.result.content[0].text, /openclaw/i);
  });
});
