import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { PROTOCOL_VERSION } from "@praxisbase/core/protocol/types.js";
import { mcpCommand } from "@praxisbase/cli/commands/mcp.js";

describe("mcp manifest", () => {
  it("returns and writes an MCP stdio manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-mcp-cli-"));

    const output = await mcpCommand(root, "manifest", { json: true });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.manifest.type, "mcp_tool_manifest");
    assert.equal(parsed.manifest.protocol_version, PROTOCOL_VERSION);
    assert.equal(parsed.manifest.command, "praxisbase");
    assert.deepEqual(parsed.manifest.args, ["mcp", "serve", "--stdio", "--workspace", root]);
    assert.ok(parsed.manifest.tools.includes("praxisbase_context_get"));
    assert.ok(parsed.manifest.tools.includes("praxisbase_harvest"));
    assert.ok(parsed.manifest.tools.includes("praxisbase_capture_finish"));
    assert.ok(parsed.manifest.tools.includes("praxisbase_wiki_compile"));
    assert.ok(parsed.manifest.tools.includes("praxisbase_wiki_graph"));
    assert.ok(parsed.manifest.tools.includes("praxisbase_wiki_build_site"));
    assert.ok(parsed.manifest.tools.includes("praxisbase_health"));

    const manifestPath = join(root, protocolPaths.mcpManifest);
    assert.ok((await stat(manifestPath)).isFile(), "mcp manifest must exist");
    const written = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.deepEqual(written, parsed.manifest);
  });
});

describe("mcp serve", () => {
  it("requires --stdio for serve mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-mcp-cli-"));

    await assert.rejects(
      () => mcpCommand(root, "serve", { stdio: false }),
      /--stdio/i
    );
  });
});
