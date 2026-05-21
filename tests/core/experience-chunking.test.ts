import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addExperienceSource } from "@praxisbase/core/experience/source-config.js";
import {
  chunkExperienceSource,
  chunkTextExperience,
} from "@praxisbase/core/experience/chunking.js";
import {
  evaluatePostAiPrivacy,
  evaluatePreAiPrivacy,
  evaluateTeamGate,
} from "@praxisbase/core/experience/privacy-policy.js";

const execFileAsync = promisify(execFile);

describe("experience chunking", () => {
  it("chunks Codex sessions around commands, file changes, tests, and outcomes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-chunk-codex-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session.jsonl"), [
      JSON.stringify({ role: "user", content: "Fix OpenClaw auth handling." }),
      JSON.stringify({ role: "assistant", content: "Changed packages/core/src/repair/context.ts and ran pnpm check. Tests passed." }),
      JSON.stringify({ role: "assistant", content: "Final: implemented auth refresh fallback successfully." }),
    ].join("\n"), "utf8");
    const source = await addExperienceSource(root, {
      name: "codex-app",
      agent: "codex",
      sourceType: "local",
      scopeDefault: "personal",
      path: sessions,
      now: "2026-05-21T00:00:00.000Z",
    });

    const chunks = await chunkExperienceSource(root, source, {
      maxChunkBytes: 2000,
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].agent, "codex");
    assert.equal(chunks[0].scope_hint, "personal");
    assert.match(chunks[0].source_ref, /^raw-vault:\/\/codex\//);
    assert.match(chunks[0].text, /Changed packages\/core\/src\/repair\/context\.ts/);
    assert.match(chunks[0].text, /pnpm check/);
    assert.match(chunks[0].text, /Tests passed/);
  });

  it("chunks OpenClaw sqlite rows while preserving memory refs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-chunk-openclaw-"));
    const dbPath = join(root, "main.sqlite");
    await execFileAsync("sqlite3", [dbPath, `
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'memory',
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        hash TEXT NOT NULL,
        model TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
      VALUES ('chunk-1', 'openclaw://memory/auth', 'memory', 1, 4, 'hash-1', 'text-embedding', 'OpenClaw detected Claude authentication expired. Login again and verify repair.', '[]', 1770000000);
    `]);
    const source = await addExperienceSource(root, {
      name: "local-openclaw-memory",
      agent: "openclaw",
      sourceType: "local",
      scopeDefault: "project",
      path: dbPath,
      now: "2026-05-21T00:00:00.000Z",
    });

    const chunks = await chunkExperienceSource(root, source, {
      maxChunkBytes: 2000,
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].agent, "openclaw");
    assert.equal(chunks[0].source_ref, "openclaw-memory://openclaw://memory/auth#chunk-1");
    assert.match(chunks[0].text, /authentication expired/);
  });

  it("chunks Claude Code repair logs and caps chunk text", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-chunk-claude-"));
    const logs = join(root, "logs");
    await mkdir(logs, { recursive: true });
    await writeFile(join(logs, "repair.log"), [
      "2026-05-21T01:00:00Z INFO Starting OpenClaw repair",
      "Changed packages/cli/src/index.ts",
      "Ran pnpm check",
      "OpenClaw repair succeeded",
      "This trailing line should be truncated by the byte cap",
    ].join("\n"), "utf8");
    const source = await addExperienceSource(root, {
      name: "claude-repair",
      agent: "claude-code",
      sourceType: "local",
      channel: "log-system",
      scopeDefault: "team",
      path: logs,
      now: "2026-05-21T00:00:00.000Z",
    });

    const chunks = await chunkExperienceSource(root, source, {
      maxChunkBytes: 90,
      now: "2026-05-21T01:00:00.000Z",
    });

    assert.ok(chunks.length >= 1);
    assert.equal(chunks[0].agent, "claude-code");
    assert.ok(chunks.every((chunk) => Buffer.byteLength(chunk.text, "utf8") <= 90));
    assert.match(chunks[0].text, /OpenClaw repair/);
  });

  it("can chunk explicit text with stable hashes", () => {
    const first = chunkTextExperience({
      source_id: "source_1",
      agent: "codex",
      channel: "local",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:source",
      scope_hint: "personal",
      text: "Implemented wiki compile and ran pnpm check.",
      maxChunkBytes: 2000,
    });
    const second = chunkTextExperience({
      source_id: "source_1",
      agent: "codex",
      channel: "local",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:source",
      scope_hint: "personal",
      text: "Implemented wiki compile and ran pnpm check.",
      maxChunkBytes: 2000,
    });

    assert.equal(first.length, 1);
    assert.equal(first[0].chunk_hash, second[0].chunk_hash);
    assert.equal(first[0].chunk_id, second[0].chunk_id);
  });
});

describe("AI privacy gates", () => {
  it("allows safe personal transcript chunks for AI distill", () => {
    const result = evaluatePreAiPrivacy({
      mode: "personal-local",
      scopeHint: "personal",
      text: "User asked to fix OpenClaw auth. Assistant changed code and pnpm check passed.",
    });

    assert.equal(result.verdict, "allow_for_ai");
  });

  it("routes personal chunks with secrets to human review before AI", () => {
    const result = evaluatePreAiPrivacy({
      mode: "personal-local",
      scopeHint: "personal",
      text: "BEGIN PRIVATE KEY\nabc\nEND PRIVATE KEY",
    });

    assert.equal(result.verdict, "human_required");
    assert.ok(result.reasons.includes("private_material_detected"));
  });

  it("rejects team personal scope before AI calls", () => {
    const result = evaluateTeamGate({
      mode: "team-git",
      scopeHint: "personal",
      text: "Personal Codex preference.",
    });

    assert.equal(result.verdict, "reject");
    assert.ok(result.reasons.includes("team_rejects_personal_scope"));
  });

  it("routes AI output leaks to human review", () => {
    const result = evaluatePostAiPrivacy({
      mode: "personal-local",
      scopeHint: "personal",
      text: "The summary accidentally included token=abc123456789.",
    });

    assert.equal(result.verdict, "human_required");
    assert.ok(result.reasons.includes("private_material_detected"));
  });
});
