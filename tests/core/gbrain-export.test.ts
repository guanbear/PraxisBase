import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exportGBrain } from "@praxisbase/core/experience/gbrain-export.js";
import { writeGBrainConfig } from "@praxisbase/core/experience/gbrain-config.js";

async function writePage(root: string, relativePath: string, content: string): Promise<void> {
  const full = join(root, relativePath);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

describe("exportGBrain", () => {
  it("dry-run builds capture payloads only from stable PB pages", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-export-"));
    await writePage(root, "kb/procedures/openclaw-auth-refresh.md", `---
id: openclaw-auth-refresh
type: procedure
scope: personal
---
# OpenClaw auth refresh

## When to Use
Use this when auth expires.

## What To Do
Refresh auth and retry.
`);
    await writePage(root, ".praxisbase/inbox/proposals/review.md", "# Review candidate\n\nDo not export.");
    await writePage(root, ".praxisbase/exceptions/human-required/private.md", "# Human required\n\nDo not export.");

    const result = await exportGBrain(root, { mode: "personal", dryRun: true });

    assert.equal(result.ok, true);
    assert.equal(result.pages, 1);
    assert.equal(result.payloads.length, 1);
    assert.equal(result.payloads[0].pagePath, "kb/procedures/openclaw-auth-refresh.md");
    assert.match(result.payloads[0].content, /PraxisBase provenance/);
    assert.match(result.payloads[0].content, /generated_by: praxisbase/);
    assert.match(result.payloads[0].content, /praxisbase_path: kb\/procedures\/openclaw-auth-refresh\.md/);
    assert.match(result.payloads[0].content, /source_hashes:/);
    assert.doesNotMatch(JSON.stringify(result.payloads), /Human required|Review candidate/);
  });

  it("blocks team export unless explicitly allowed", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-export-team-"));
    await writePage(root, "kb/procedures/openclaw-auth-refresh.md", "# OpenClaw auth refresh\n\nStable content.");

    const result = await exportGBrain(root, { mode: "team", dryRun: true });

    assert.equal(result.ok, false);
    assert.match(result.errors[0], /GBRAIN_TEAM_EXPORT_BLOCKED/);
  });

  it("skips personal pages during allowed team export", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-export-team-safe-"));
    await writePage(root, "kb/procedures/personal-openclaw.md", `---
id: personal-openclaw
type: procedure
scope: personal
---
# Personal OpenClaw

Do not export to team.
`);
    await writePage(root, "kb/procedures/team-openclaw.md", `---
id: team-openclaw
type: procedure
scope: team
---
# Team OpenClaw

Safe team lesson.
`);
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await exportGBrain(root, {
      mode: "team",
      allowTeamExport: true,
      dryRun: false,
      sourceId: "team-praxisbase",
      runCommand: async (command, args) => {
        calls.push({ command, args });
        return { stdout: JSON.stringify({ slug: args[args.indexOf("--slug") + 1] }), stderr: "" };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.pages, 2);
    assert.equal(result.exported, 1);
    assert.equal(result.skipped, 1);
    assert.match(result.warnings.join("\n"), /GBRAIN_TEAM_EXPORT_SKIPPED_PERSONAL/);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].args.includes("--source"));
    assert.ok(calls[0].args.includes("team-praxisbase"));
    assert.ok(calls[0].args.includes("praxisbase/kb/procedures/team-openclaw"));
  });

  it("uses persisted local config for source-aware publishing", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-export-config-"));
    await writeGBrainConfig(root, {
      mode: "local",
      cli_path: "/opt/gbrain",
      executable: "/opt/gbrain",
      source_id: "configured-pb",
      timeout_ms: 30_000,
      publish_mode: "capture",
    });
    await writePage(root, "kb/procedures/configured-openclaw.md", "# Configured OpenClaw\n\nStable content.");
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await exportGBrain(root, {
      mode: "personal",
      dryRun: false,
      runCommand: async (command, args) => {
        calls.push({ command, args });
        return { stdout: JSON.stringify({ slug: args[args.indexOf("--slug") + 1] }), stderr: "" };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(calls[0].command, "/opt/gbrain");
    assert.ok(calls[0].args.includes("--source"));
    assert.ok(calls[0].args.includes("configured-pb"));
  });

  it("publishes through remote MCP config when configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-export-remote-"));
    await writeGBrainConfig(root, {
      mode: "remote",
      issuer_url: "https://auth.example.com",
      mcp_url: "https://gbrain.example.com/mcp",
      oauth_client_id: "pb-client",
      secret_env: "GBRAIN_EXPORT_TEST_TOKEN",
      source_id: "remote-pb",
      federated_read: ["remote-pb"],
      timeout_ms: 5_000,
    });
    await writePage(root, "kb/procedures/remote-openclaw.md", "# Remote OpenClaw\n\nStable content.");
    const original = process.env.GBRAIN_EXPORT_TEST_TOKEN;
    process.env.GBRAIN_EXPORT_TEST_TOKEN = "secret-token";
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    try {
      const result = await exportGBrain(root, {
        mode: "personal",
        dryRun: false,
        fetchImpl: async (url, init) => {
          requests.push({ url, init });
          return {
            ok: true,
            status: 200,
            json: async () => ({ jsonrpc: "2.0", id: 1, result: { slug: "remote-openclaw" } }),
            text: async () => "{}",
          };
        },
      });

      assert.equal(result.ok, true);
      assert.equal(requests[0].url, "https://gbrain.example.com/mcp");
      const body = JSON.parse(requests[0].init?.body as string);
      assert.equal(body.method, "put_page");
      assert.equal(body.params.source_id, "remote-pb");
    } finally {
      if (original === undefined) delete process.env.GBRAIN_EXPORT_TEST_TOKEN;
      else process.env.GBRAIN_EXPORT_TEST_TOKEN = original;
    }
  });
});
