import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  buildMcpToolManifest,
  handleMcpJsonRpc,
  writeMcpToolManifest,
} from "@praxisbase/core/agent-access/mcp.js";

export interface McpCommandOptions {
  json?: boolean;
  stdio?: boolean;
  workspace?: string;
}

export async function mcpCommand(
  root: string,
  subcommand: string,
  options: McpCommandOptions
): Promise<string> {
  const workspace = options.workspace ?? root;

  if (subcommand === "manifest") {
    const manifest = buildMcpToolManifest(workspace);
    await writeMcpToolManifest(workspace, manifest);
    if (options.json) return JSON.stringify({ ok: true, manifest }, null, 2);
    return `MCP manifest: ${manifest.tools.length} tools`;
  }

  if (subcommand === "serve") {
    if (!options.stdio) {
      throw new Error("mcp serve requires --stdio.");
    }
    await serveMcpStdio(workspace);
    return "MCP stdio server stopped";
  }

  throw new Error(`Unknown subcommand "mcp ${subcommand}". Use "mcp manifest" or "mcp serve".`);
}

export async function serveMcpStdio(root: string): Promise<void> {
  const rl = createInterface({ input, output: undefined, terminal: false });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const request = JSON.parse(trimmed);
      const response = await handleMcpJsonRpc(root, request);
      if (response) output.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.write(JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message },
      }) + "\n");
    }
  }
}
