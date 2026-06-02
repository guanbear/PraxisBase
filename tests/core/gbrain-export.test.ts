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
    assert.ok(result.payloads.length >= 2, "Should have wiki page payload and catalog payload");
    const wikiPayload = result.payloads.find((p) => p.pagePath === "kb/procedures/openclaw-auth-refresh.md");
    assert.ok(wikiPayload, "Should have wiki page payload");
    assert.match(wikiPayload.content, /PraxisBase provenance/);
    assert.match(wikiPayload.content, /generated_by: praxisbase/);
    assert.match(wikiPayload.content, /praxisbase_path: kb\/procedures\/openclaw-auth-refresh\.md/);
    assert.match(wikiPayload.content, /source_hashes:/);
    assert.equal(wikiPayload.authority, "stable_pb_page");
    assert.equal(result.payloads.find((p) => p.type === "knowledge_catalog")?.authority, "knowledge_catalog");
    assert.deepEqual(result.summary.authority, {
      exported_from: ["stable_pb_page", "promoted_skill", "knowledge_catalog"],
      backend_role: "sidecar_export_sink",
      promotion_evidence: false,
    });
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
    assert.equal(result.exported, 2, "Should export team page and catalog");
    assert.equal(result.skipped, 0, "No skipped payloads after filtering");
    assert.match(result.warnings.join("\n"), /GBRAIN_TEAM_EXPORT_SKIPPED_PERSONAL/);
    assert.ok(calls.length >= 2, "Should have published team page and catalog");
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

  it("exports promoted skill pages alongside wiki pages", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-skill-export-"));
    await writePage(root, "kb/procedures/auth-refresh.md", `---
id: auth-refresh
type: procedure
scope: personal
---
# Auth Refresh

Refresh when expired.
`);
    await writePage(root, "skills/openclaw/repair/SKILL.md", `---
id: openclaw-repair-skill
type: skill
scope: personal
maturity: verified
---
# OpenClaw Repair

## When To Use
When OpenClaw breaks.

## Procedure
1. Check logs.
2. Restart.

## Verification
OpenClaw responds.

## Pitfalls
Don't force kill.

## Do Not Use When
Not broken.
`);

    const result = await exportGBrain(root, { mode: "personal", dryRun: true });

    assert.equal(result.ok, true);
    assert.ok(result.payloads.length >= 3, "Should have wiki page, skill page, and catalog payload");
    const skillPayload = result.payloads.find((p) => p.authority === "promoted_skill");
    assert.ok(skillPayload, "Should have a skill payload");
    assert.equal(skillPayload.type, "procedure");
    assert.equal(skillPayload.slug, "praxisbase/skills/openclaw/repair");
    assert.equal(skillPayload.authority, "promoted_skill");
    assert.match(skillPayload.content, /When OpenClaw breaks/);
    assert.match(skillPayload.content, /Check logs/);
    assert.equal(result.skills_exported, 1);
  });

  it("exports catalog payload with provenance hash", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-catalog-"));
    await writePage(root, "kb/known-fixes/test.md", `---
id: test-fix
type: known_fix
scope: personal
---
# Test Fix

A test fix.
`);

    const result = await exportGBrain(root, { mode: "personal", dryRun: true });

    const catPayload = result.payloads.find((p) => p.type === "knowledge_catalog");
    assert.ok(catPayload, "Should have catalog payload");
    assert.ok(catPayload.provenanceHash.startsWith("sha256:"));
    assert.equal(result.catalog_exported, 1);
  });

  it("does not export inbox candidates or raw evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-no-raw-"));
    await writePage(root, "kb/procedures/safe.md", "# Safe page\n\nPublic content.");
    await writePage(root, ".praxisbase/inbox/proposals/candidate.json", JSON.stringify({ type: "skill_synthesis_candidate", raw_log: "should not export" }));
    await writePage(root, ".praxisbase/exceptions/human-required/private.md", "# Private\n\nSecret content.");

    const result = await exportGBrain(root, { mode: "personal", dryRun: true });

    const serialized = JSON.stringify(result.payloads);
    assert.ok(!serialized.includes("should not export"), "Inbox candidate should not be exported");
    assert.ok(!serialized.includes("Secret content"), "Human-required exception should not be exported");
    assert.ok(!serialized.includes("raw_log"), "Raw log key should not appear in export");
  });

  it("skips stable pages with private material before building GBrain payloads", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-private-stable-"));
    await writePage(root, "kb/procedures/safe.md", "# Safe page\n\nPublic operational lesson.");
    await writePage(root, "kb/procedures/private-remote.md", "# Private Remote\n\nUse root@guanzhicheng.com through macmini-ssh.");
    await writePage(root, "skills/openclaw/private/SKILL.md", "# Private Skill\n\nUse ~/.ssh/openclaw_key before restart.");

    const result = await exportGBrain(root, { mode: "personal", dryRun: true });

    const serialized = JSON.stringify(result.payloads);
    assert.ok(!serialized.includes("root@guanzhicheng.com"));
    assert.ok(!serialized.includes("macmini-ssh"));
    assert.ok(!serialized.includes("openclaw_key"));
    assert.ok(result.payloads.some((payload) => payload.pagePath === "kb/procedures/safe.md"));
    assert.ok(result.warnings.some((warning) => warning.includes("GBRAIN_EXPORT_SKIPPED_PRIVATE")));
  });

  it("allows stable policy lessons that mention token expiry without concrete secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-policy-token-"));
    await writePage(root, "kb/procedures/auth-expired.md", "# Auth Expired\n\nSession token expired after 24h. Refresh auth and retry.");
    await writePage(root, "kb/procedures/concrete-secret.md", "# Concrete Secret\n\nRetry with token=abc123456789 before refresh.");

    const result = await exportGBrain(root, { mode: "personal", dryRun: true });

    const pagePaths = result.payloads.map((payload) => payload.pagePath);
    assert.ok(pagePaths.includes("kb/procedures/auth-expired.md"));
    assert.ok(!pagePaths.includes("kb/procedures/concrete-secret.md"));
    assert.ok(!JSON.stringify(result.payloads).includes("abc123456789"));
    assert.ok(result.warnings.some((warning) => warning.includes("concrete-secret.md")));
  });

  it("team export skips personal/project scopes and still includes catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-team-scopes-"));
    await writePage(root, "kb/procedures/personal-thing.md", `---
id: personal-thing
type: procedure
scope: personal
---
# Personal Thing

Not for team.
`);
    await writePage(root, "kb/procedures/team-thing.md", `---
id: team-thing
type: procedure
scope: team
---
# Team Thing

For team export.
`);
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await exportGBrain(root, {
      mode: "team",
      allowTeamExport: true,
      dryRun: false,
      sourceId: "team-pb",
      runCommand: async (command, args) => {
        calls.push({ command, args });
        return { stdout: JSON.stringify({ slug: args[args.indexOf("--slug") + 1] }), stderr: "" };
      },
    });

    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((w) => w.includes("GBRAIN_TEAM_EXPORT_SKIPPED_PERSONAL")));
    const exported = result.payloads.filter((p) => !p.type?.includes("catalog"));
    assert.ok(exported.every((p) => !p.pagePath.includes("personal")), "No personal pages should be exported");
    assert.equal(result.catalog_exported, 1);
  });

  it("preserves provenance hash idempotency across exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-export-idempotency-"));
    await writePage(root, "kb/procedures/stable.md", "# Stable\n\nContent.");

    const result1 = await exportGBrain(root, { mode: "personal", dryRun: true });
    const result2 = await exportGBrain(root, { mode: "personal", dryRun: true });

    const wikiHashes1 = result1.payloads.filter((p) => p.type !== "knowledge_catalog").map((p) => p.provenanceHash).sort();
    const wikiHashes2 = result2.payloads.filter((p) => p.type !== "knowledge_catalog").map((p) => p.provenanceHash).sort();
    assert.deepEqual(wikiHashes1, wikiHashes2, "Wiki page provenance hashes should be deterministic");
  });

  it("preserves catalog provenance hash idempotency across exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-catalog-idempotency-"));
    await writePage(root, "kb/procedures/stable.md", "# Stable\n\nContent.");

    const result1 = await exportGBrain(root, { mode: "personal", dryRun: true });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result2 = await exportGBrain(root, { mode: "personal", dryRun: true });

    const catalog1 = result1.payloads.find((p) => p.type === "knowledge_catalog");
    const catalog2 = result2.payloads.find((p) => p.type === "knowledge_catalog");
    assert.ok(catalog1);
    assert.ok(catalog2);
    assert.equal(catalog1.provenanceHash, catalog2.provenanceHash);
    assert.equal(catalog1.idempotencyKey, catalog2.idempotencyKey);
  });
});
