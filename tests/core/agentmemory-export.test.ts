import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectStableKbPages,
  collectStableSkillsPages,
  kbPageToRememberPayload,
  exportAgentMemory,
  findAgentMemorySource,
} from "@praxisbase/core/experience/agentmemory-export.js";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

async function createKbWithPages(root: string, pages: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(pages)) {
    const fullPath = join(root, relativePath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
  }
}

describe("collectStableKbPages", () => {
  it("reads markdown files from kb/ subdirectories", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-kb-"));
    await createKbWithPages(root, {
      "kb/known-fixes/auth-expired.md": "# Auth Expired\n\nSession token expired after 24h.",
      "kb/pitfalls/race-condition.md": "# Race Condition\n\nAvoid concurrent writes to [[shared-state]].",
      "kb/procedures/deploy.md": "# Deploy Procedure\n\n1. Run tests\n2. Deploy",
    });

    const pages = await collectStableKbPages(root);
    assert.equal(pages.length, 3);
    assert.ok(pages.some((p) => p.relativePath.includes("auth-expired")));
    assert.ok(pages.some((p) => p.relativePath.includes("race-condition")));
    assert.ok(pages.some((p) => p.relativePath.includes("deploy")));
  });

  it("does not read from .praxisbase/ directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-no-dot-"));
    await createKbWithPages(root, {
      "kb/known-fixes/real.md": "# Real Fix\n\nContent.",
      ".praxisbase/inbox/proposals/review-candidate.md": "# Review Candidate\n\nShould not appear.",
      ".praxisbase/exceptions/human-required/rejected.md": "# Rejected\n\nShould not appear.",
    });

    const pages = await collectStableKbPages(root);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].relativePath, "kb/known-fixes/real.md");
  });

  it("returns empty array when kb/ does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-empty-"));
    const pages = await collectStableKbPages(root);
    assert.equal(pages.length, 0);
  });

  it("only reads .md files", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-mdonly-"));
    await createKbWithPages(root, {
      "kb/notes/note.md": "# Note\n\nContent.",
      "kb/notes/data.json": '{"not": "read"}',
      "kb/notes/script.sh": "#!/bin/bash",
    });

    const pages = await collectStableKbPages(root);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].relativePath, "kb/notes/note.md");
  });
});

describe("collectStableSkillsPages", () => {
  it("reads markdown files from skills/ subdirectories", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-skills-"));
    await createKbWithPages(root, {
      "skills/openclaw/repair-auth.md": "# Repair Auth\n\nSteps to fix auth.",
      "skills/k8s/triage-pod.md": "# Triage Pod\n\nPod crash loop.",
    });

    const pages = await collectStableSkillsPages(root);
    assert.equal(pages.length, 2);
    assert.ok(pages.some((p) => p.relativePath.includes("repair-auth")));
    assert.ok(pages.some((p) => p.relativePath.includes("triage-pod")));
  });
});

describe("kbPageToRememberPayload", () => {
  it("extracts title from first heading", () => {
    const payload = kbPageToRememberPayload({
      relativePath: "kb/known-fixes/auth-expired.md",
      content: "# Auth Token Expired\n\nSession expired after 24h.",
    });
    assert.equal(payload.title, "Auth Token Expired");
    assert.equal(payload.scope, "personal");
    assert.deepEqual(payload.files, ["kb/known-fixes/auth-expired.md"]);
    assert.match(payload.content, /PraxisBase provenance:/);
  });

  it("falls back to filename when no heading", () => {
    const payload = kbPageToRememberPayload({
      relativePath: "kb/pitfalls/race-condition.md",
      content: "No heading here.\nJust text.",
    });
    assert.equal(payload.title, "race-condition");
  });

  it("extracts concepts from wiki-links", () => {
    const payload = kbPageToRememberPayload({
      relativePath: "kb/notes/test.md",
      content: "# Test\n\nSee [[auth]] and [[deploy]]. Also [[auth]] again.",
    });
    assert.deepEqual(payload.concepts, ["test", "auth", "deploy"]);
  });

  it("omits concepts when no wiki-links found", () => {
    const payload = kbPageToRememberPayload({
      relativePath: "kb/notes/plain.md",
      content: "# Plain\n\nNo links here.",
    });
    assert.deepEqual(payload.concepts, ["plain"]);
  });
});

describe("exportAgentMemory", () => {
  it("dry-run converts stable kb and skills pages to remember payloads", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-dryrun-"));
    await createKbWithPages(root, {
      "kb/known-fixes/auth.md": "# Auth Repair\nUse [[OpenClaw]] auth refresh.\nSee [[Session|session fix]].\n",
      "kb/procedures/runbook.md": "No heading but mentions [[Runbook]].\n",
      "skills/openclaw/auth/SKILL.md": "# Skill Auth\nRemember [[Skill Link]].\n",
      "skills/openclaw/auth/notes.md": "# Skill Draft Notes\nDo not export non-skill markdown.\n",
      "kb/known-fixes/not-markdown.txt": "# Ignore\n",
      ".praxisbase/inbox/proposals/candidate.md": "# Proposal\nDo not export.\n",
      ".praxisbase/exceptions/human-required/secret.md": "# Secret\nDo not export.\n",
    });

    const result = await exportAgentMemory(root, { mode: "personal", dryRun: true });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "personal");
    assert.equal(result.pages, 3);
    assert.equal(result.exported, 0);
    assert.equal(result.skipped, 3);
    assert.equal(result.already_present, 0);
    assert.equal(result.summary.pages_scanned, 3);
    assert.equal(result.summary.payloads_generated, 3);
    assert.equal(result.summary.idempotency, "provenance_hash");
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.payloads.map((p) => p.pagePath).sort(), [
      "kb/known-fixes/auth.md",
      "kb/procedures/runbook.md",
      "skills/openclaw/auth/SKILL.md",
    ].sort());
    const auth = result.payloads.find((payload) => payload.pagePath === "kb/known-fixes/auth.md");
    const runbook = result.payloads.find((payload) => payload.pagePath === "kb/procedures/runbook.md");
    assert.ok(auth);
    assert.equal(auth.payload.title, "Auth Repair");
    assert.deepEqual(auth.payload.files, ["kb/known-fixes/auth.md"]);
    assert.ok(auth.payload.concepts?.includes("known_fix"));
    assert.ok(auth.payload.concepts?.includes("openclaw"));
    assert.ok(auth.payload.concepts?.includes("session"));
    assert.match(auth.payload.content, /PraxisBase provenance:/);
    assert.match(auth.provenanceHash, /^sha256:/);
    assert.equal(runbook?.payload.title, "runbook");
  });

  it("blocks team export unless explicitly allowed", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-team-block-"));
    await createKbWithPages(root, { "kb/known-fixes/test.md": "# Test\n\nContent." });

    const result = await exportAgentMemory(root, { mode: "team", dryRun: true });
    assert.equal(result.ok, false);
    assert.equal(result.pages, 0);
    assert.deepEqual(result.errors, ["AGENTMEMORY_TEAM_EXPORT_BLOCKED: team export requires explicit allowTeamExport flag."]);
  });

  it("allows team export with explicit flag", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-team-allow-"));
    await createKbWithPages(root, { "kb/known-fixes/test.md": "# Test\n\nContent." });

    const result = await exportAgentMemory(root, { mode: "team", allowTeamExport: true, dryRun: true });
    assert.equal(result.ok, true);
    assert.equal(result.payloads.length, 1);
  });

  it("POSTs payloads to agentmemory daemon when not dry-run", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-post-"));
    await createKbWithPages(root, { "kb/known-fixes/fix.md": "# Fix\n\nThe fix content." });
    await addExperienceSource(root, {
      name: "test-am",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
      bearerTokenEnv: "TEST_TOKEN",
    });

    const calls: Array<{ url: string; authorization?: string; body?: string }> = [];
    const result = await exportAgentMemory(root, {
      mode: "personal",
      dryRun: false,
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({
          url: String(input),
          authorization: headers.get("authorization") ?? undefined,
          body: init?.body?.toString(),
        });
        return jsonResponse({ id: "new-mem-1" });
      }) as typeof fetch,
      env: { TEST_TOKEN: "super-secret-token" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.exported, 1);
    assert.equal(result.skipped, 0);
    const rememberCalls = calls.filter((call) => call.url.includes("agentmemory/remember"));
    assert.equal(rememberCalls.length, 1);
    assert.ok(rememberCalls[0].body?.includes("Fix"));
    assert.ok(rememberCalls[0].authorization?.includes("Bearer super-secret-token"));
    assert.ok(!JSON.stringify(result).includes("super-secret-token"));
  });

  it("skips export when AgentMemory already has the same PraxisBase provenance hash", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-idempotent-"));
    await createKbWithPages(root, { "kb/known-fixes/fix.md": "# Fix\n\nThe fix content." });
    await addExperienceSource(root, {
      name: "test-am",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });

    const dryRun = await exportAgentMemory(root, { mode: "personal", dryRun: true });
    const hash = dryRun.payloads[0].provenanceHash;
    const calls: string[] = [];
    const result = await exportAgentMemory(root, {
      mode: "personal",
      dryRun: false,
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.includes("smart-search")) {
          return jsonResponse({ hits: [{ id: "existing", title: "Fix", content: `PraxisBase provenance:\n- hash: ${hash}` }] });
        }
        return jsonResponse({ id: "new-mem-1" });
      }) as typeof fetch,
      env: {},
    });

    assert.equal(result.ok, true);
    assert.equal(result.exported, 0);
    assert.equal(result.already_present, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.summary.already_present, 1);
    assert.ok(calls.some((call) => call.includes("agentmemory/smart-search")));
    assert.equal(calls.some((call) => call.includes("agentmemory/remember")), false);
  });

  it("reports errors when daemon POST fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-fail-"));
    await createKbWithPages(root, { "kb/known-fixes/fix.md": "# Fix\n\nContent." });
    await addExperienceSource(root, {
      name: "am-fail",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });

    const result = await exportAgentMemory(root, {
      mode: "personal",
      dryRun: false,
      fetchImpl: (async () => new Response("error", { status: 500, statusText: "Internal Server Error" })) as typeof fetch,
      env: {},
    });

    assert.equal(result.ok, false);
    assert.equal(result.exported, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /fix\.md.*500/);
  });

  it("returns AGENTMEMORY_NO_SOURCE when no source configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-nosource-"));
    await createKbWithPages(root, { "kb/known-fixes/test.md": "# Test\n\nContent." });

    const result = await exportAgentMemory(root, { mode: "personal", dryRun: false });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("AGENTMEMORY_NO_SOURCE")));
  });

  it("does not include bearer token values in result output", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-notoken-"));
    await createKbWithPages(root, { "kb/known-fixes/test.md": "# Test\n\nContent." });

    const result = await exportAgentMemory(root, { mode: "personal", dryRun: true });
    const serialized = JSON.stringify(result);
    assert.match(serialized, /provenanceHash/);
    assert.doesNotMatch(serialized, /Bearer\s+[^\s]/);
  });
});

describe("findAgentMemorySource", () => {
  it("returns first agentmemory source when no name specified", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-find-"));
    await addExperienceSource(root, {
      name: "first-am",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });

    const source = await findAgentMemorySource(root);
    assert.equal(source?.name, "first-am");
  });

  it("returns named source when specified", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-named-"));
    await addExperienceSource(root, {
      name: "am-one",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3111",
    });
    await addExperienceSource(root, {
      name: "am-two",
      agent: "agentmemory",
      sourceType: "agentmemory",
      scopeDefault: "personal",
      url: "http://localhost:3112",
    });

    const source = await findAgentMemorySource(root, "am-two");
    assert.equal(source?.name, "am-two");
  });

  it("returns undefined when no agentmemory sources exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-export-none-"));
    const source = await findAgentMemorySource(root);
    assert.equal(source, undefined);
  });
});
