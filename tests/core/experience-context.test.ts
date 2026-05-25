import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContext } from "@praxisbase/core";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";

describe("buildContext", () => {
  it("diagnosis context respects max bytes and keeps citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(
      join(root, "kb/known-fixes/openclaw-auth-expired.md"),
      `---
id: openclaw-auth-expired
type: known_fix
---

# OpenClaw Auth Expired

## When to Use
Use this when OpenClaw logs mention authentication expired during memory sync.

## Fix
Refresh auth state and retry memory sync. ${"details ".repeat(200)}
`,
      "utf8"
    );

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "diagnosis",
      query: "openclaw auth expired",
      maxBytes: 900,
    });

    assert.equal(output.stage, "diagnosis");
    assert.equal(output.agent, "codex");
    assert.ok(Buffer.byteLength(JSON.stringify(output)) <= 900);
    assert.ok(output.citations.some((citation) => citation.path === "kb/known-fixes/openclaw-auth-expired.md"));
    assert.ok(output.truncated, "large matching object should be truncated to fit budget");
  });

  it("returns warning instead of failing when context is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-"));

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "diagnosis",
      query: "new issue",
    });

    assert.equal(output.stage, "diagnosis");
    assert.deepEqual(output.items, []);
    assert.ok(output.warnings.includes("context_unavailable"));
  });

  it("writes a context report", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-"));

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "verification",
      query: "",
    });

    const report = JSON.parse(await readFile(join(root, ".praxisbase/reports/context", `${output.id}.json`), "utf8"));
    assert.equal(report.id, output.id);
    assert.equal(report.stage, "verification");
    assert.equal(report.changed_stable_knowledge, false);
  });

  it("uses wiki retrieval for CJK and graph-related context while preserving citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-wiki-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await mkdir(join(root, "skills/openclaw/auth-repair"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), `---
id: openclaw-auth-expired
type: known_fix
scope: team
maturity: proven
signatures: ["openclaw:auth-expired"]
---
# OpenClaw 认证失败

## When to Use
Use this when OpenClaw 认证失败 appears during auth repair.

## Fix
Refresh OpenClaw credentials and retry the failing operation. [[auth-repair]]
`);
    await writeFile(join(root, "skills/openclaw/auth-repair/SKILL.md"), `---
id: auth-repair
scope: team
maturity: verified
---
# Auth Repair

Refresh credentials safely.
`);

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "repair",
      query: "认证失败",
      maxBytes: 4000,
    });

    assert.equal(output.items[0].path, "kb/known-fixes/openclaw-auth-expired.md");
    assert.ok(output.items.some((item) => item.path === "skills/openclaw/auth-repair/SKILL.md"));
    assert.ok(output.citations.some((citation) => citation.path === "kb/known-fixes/openclaw-auth-expired.md"));
  });

  it("does not return raw-vault refs as default agent guidance before promotion", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-raw-ref-"));
    await mkdir(join(root, ".praxisbase/raw-vault/refs"), { recursive: true });
    await writeFile(join(root, ".praxisbase/raw-vault/refs/raw_ref_openclaw-auth.json"), JSON.stringify({
      id: "raw_ref_openclaw-auth",
      type: "raw_vault_ref",
      agent: "openclaw",
      kind: "openclaw_episode",
      source_ref: "openclaw-memory://openclaw://memory/auth#chunk-1",
      source_hash: "sha256:openclaw-auth",
      redacted_summary: "OpenClaw detected Claude authentication expired and asked for login again.",
      scope_hint: "project",
      created_at: "2026-05-21T00:00:00.000Z",
    }), "utf8");

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "repair",
      query: "openclaw authentication expired",
      maxBytes: 4000,
    });

    assert.deepEqual(output.items, []);
    assert.ok(output.warnings.includes("context_unavailable"));
    assert.equal(output.citations.some((citation) => citation.path.startsWith(".praxisbase/raw-vault/refs/")), false);
  });

  it("returns stable wiki before matching raw evidence when both exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-authority-"));
    await mkdir(join(root, "kb/procedures"), { recursive: true });
    await mkdir(join(root, ".praxisbase/raw-vault/refs"), { recursive: true });
    await writeFile(join(root, "kb/procedures/openclaw-gateway-restart.md"), `---
id: openclaw-gateway-restart
type: procedure
knowledge_type: procedure
scope: personal
maturity: draft
sources:
  - uri: openclaw-memory://memory/gateway#1
    hash: sha256:stable
---
# OpenClaw gateway restart after configuration changes

## When to Use
Use this after changing OpenClaw gateway routing, model, or provider configuration.

## What To Do
Restart the gateway and then check the health endpoint.
`);
    await writeFile(join(root, ".praxisbase/raw-vault/refs/raw_ref_openclaw-gateway.json"), JSON.stringify({
      id: "raw_ref_openclaw-gateway",
      type: "raw_vault_ref",
      source_ref: "openclaw-memory://memory/gateway#raw",
      source_hash: "sha256:raw",
      redacted_summary: "OpenClaw gateway restart after configuration changes with many exact query terms.",
      scope_hint: "personal",
    }), "utf8");

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "repair",
      query: "OpenClaw gateway restart after configuration changes",
      maxBytes: 4000,
    });

    assert.equal(output.items[0]?.path, "kb/procedures/openclaw-gateway-restart.md");
    assert.equal(output.items.some((item) => item.path.startsWith(".praxisbase/raw-vault/refs/")), false);
  });

  it("does not return stable kb pages that fail promote-time wiki quality", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-quality-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-run-id-abc123def456.md"), `---
id: openclaw-run-id-abc123def456
type: known_fix
---
# OpenClaw run id abc123def456

## When to Use
Use this only when reviewing this exact run id.

## What To Do
Review the source run before taking action.
`);
    await writeFile(join(root, "kb/known-fixes/openclaw-auth-refresh.md"), `---
id: openclaw-auth-refresh
type: known_fix
---
# OpenClaw auth refresh repair

## When to Use
Use this when OpenClaw authentication expires during memory sync.

## What To Do
Refresh the OpenClaw login and retry memory sync.
`);

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "diagnosis",
      query: "OpenClaw run id abc123def456 auth refresh",
      maxBytes: 4000,
    });

    assert.equal(output.items.some((item) => item.path.endsWith("openclaw-run-id-abc123def456.md")), false);
    assert.equal(output.items[0]?.path, "kb/known-fixes/openclaw-auth-refresh.md");
  });

  it("includes AgentMemory sidecar hits only after stable wiki context", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-agentmemory-"));
    await mkdir(join(root, "kb/procedures"), { recursive: true });
    await writeFile(join(root, "kb/procedures/openclaw-auth-refresh.md"), `---
id: openclaw-auth-refresh
type: procedure
knowledge_type: procedure
scope: personal
maturity: verified
---
# OpenClaw auth refresh

## When to Use
Use this when OpenClaw auth refresh is required.

## What To Do
Refresh auth and verify the OpenClaw run.
`);
    await addExperienceSource(root, {
      name: "agentmemory",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "repair",
      query: "OpenClaw auth refresh",
      maxBytes: 4000,
      withAgentMemory: true,
      fetchImpl: (async (input) => {
        if (String(input).includes("health")) {
          return new Response(JSON.stringify({ status: "ok" }));
        }
        return new Response(JSON.stringify({
          hits: [{ id: "mem-1", title: "OpenClaw auth refresh memory", content: "AgentMemory sidecar remembered the same OpenClaw auth refresh procedure." }],
        }));
      }) as typeof fetch,
    });

    assert.equal(output.items[0]?.path, "kb/procedures/openclaw-auth-refresh.md");
    assert.ok(output.items.some((item) => item.path === "agentmemory://smart-search/mem-1"));
    assert.equal(output.warnings.includes("context_unavailable"), false);
  });

  it("warns instead of failing when requested AgentMemory sidecar is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-agentmemory-down-"));
    await addExperienceSource(root, {
      name: "agentmemory",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "diagnosis",
      query: "OpenClaw auth refresh",
      withAgentMemory: true,
      fetchImpl: (async () => new Response("down", { status: 503, statusText: "Service Unavailable" })) as typeof fetch,
    });

    assert.deepEqual(output.items, []);
    assert.ok(output.warnings.some((warning) => warning.includes("agentmemory_sidecar_unavailable")));
    assert.ok(output.warnings.includes("context_unavailable"));
  });
});
