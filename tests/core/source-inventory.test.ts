/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { promisify } from "node:util";
import { buildSourceInventory } from "@praxisbase/core";

const execFileAsync = promisify(execFile);

test("section maps long OpenClaw MEMORY.md instead of skipping it", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-m25-"));
  const dir = join(root, "openclaw");
  await mkdir(dir, { recursive: true });
  const body = [
    "# Memory",
    "## Running & Routing",
    "- Long dispatch tasks need a brief ACK before tools run.",
    "- Fail-closed delegate guard must not pretend success.",
    "## Memory Management",
    "- MEMORY.md above 12000 chars can be truncated during injection.",
    "x".repeat(700_000),
  ].join("\n");
  await writeFile(join(dir, "MEMORY.md"), body, "utf8");

  const inventory = await buildSourceInventory(root, {
    agent: "openclaw",
    path: dir,
    scope: "personal",
    origin: "local",
  });

  const memory = inventory.find((item) => item.source_kind === "memory_file");
  if (!memory) throw new Error("expected MEMORY.md inventory item");
  const memoryItem = memory;
  assert.ok(memoryItem.content_spans.length >= 3);
  assert.ok(
    memoryItem.content_spans.some((span) =>
      span.heading_path.includes("Running & Routing"),
    ),
  );

  const dispatchSpan = memoryItem.content_spans.find((span) =>
    span.excerpt.includes("brief ACK"),
  );
  if (!dispatchSpan) throw new Error("expected dispatch lesson span");
  const dispatchLessonSpan = dispatchSpan;
  assert.equal(dispatchLessonSpan.line_start, 3);
  assert.ok(dispatchLessonSpan.byte_end > dispatchLessonSpan.byte_start);
});

test("normalizes skipped markdown heading levels without undefined path entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-m25-heading-gap-"));
  await writeFile(join(root, "report.md"), [
    "# Report",
    "### Verification",
    "- Run replay before promoting the fix.",
  ].join("\n"), "utf8");

  const inventory = await buildSourceInventory(root, {
    agent: "openclaw",
    path: root,
    scope: "personal",
    origin: "local",
  });

  assert.equal(inventory.length, 1);
  assert.ok(inventory[0]!.content_spans.length >= 2);
  for (const span of inventory[0]!.content_spans) {
    assert.ok(span.heading_path.every((part) => typeof part === "string" && part.length > 0));
  }
});

test("extracts useful spans from Codex JSONL session records", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-m25-codex-jsonl-"));
  const sessionPath = join(root, "codex-session.jsonl");
  const records = [
    {
      type: "message",
      role: "user",
      message: {
        content: "Please implement source inventory depth for agent session JSONL.",
      },
    },
    {
      type: "tool_call",
      name: "exec_command",
      arguments: {
        cmd: "pnpm test source-inventory",
      },
    },
    {
      type: "tool_result",
      name: "exec_command",
      result: "Test failed: expected json_message span but parser only returned paragraph spans.",
      error: "AssertionError: missing json_message",
    },
    {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Fix: parse newline-delimited JSON records and classify tool calls/results separately.",
        },
      ],
    },
    {
      type: "message",
      role: "assistant",
      summary: "Verification: pnpm build and node --test source-inventory.test.js passed.",
    },
  ];
  await writeFile(sessionPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");

  const inventory = await buildSourceInventory(root, {
    agent: "codex",
    path: sessionPath,
    scope: "personal",
    origin: "local",
  });

  assert.equal(inventory.length, 1);
  const spans = inventory[0]!.content_spans;
  assert.ok(spans.some((span) =>
    span.span_kind === "json_message" &&
    span.excerpt.includes("Please implement source inventory depth")
  ));
  assert.ok(spans.some((span) =>
    span.span_kind === "tool_call" &&
    span.excerpt.includes("pnpm test source-inventory")
  ));
  assert.ok(spans.some((span) =>
    span.span_kind === "tool_result" &&
    span.excerpt.includes("missing json_message")
  ));
  assert.ok(spans.some((span) =>
    span.span_kind === "json_message" &&
    span.excerpt.includes("parse newline-delimited JSON records")
  ));
  assert.ok(spans.some((span) =>
    span.span_kind === "json_message" &&
    span.excerpt.includes("Verification: pnpm build")
  ));

  for (const span of spans) {
    assert.equal(span.source_ref, inventory[0]!.source_ref);
    assert.equal(span.source_hash, inventory[0]!.source_hash);
    assert.ok(span.span_id.length > 0);
    assert.ok(span.line_start >= 1);
    assert.ok(span.line_end >= span.line_start);
    assert.ok(span.byte_end > span.byte_start);
    assert.ok(span.excerpt_hash.length > 0);
  }
});

test("keeps ordinary MEMORY.md markdown spans intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-m25-memory-markdown-"));
  await writeFile(join(root, "MEMORY.md"), [
    "# Agent Memory",
    "## Verification",
    "- Run the focused source inventory test after parser changes.",
    "",
    "Keep markdown paragraphs available as lesson evidence.",
  ].join("\n"), "utf8");

  const inventory = await buildSourceInventory(root, {
    agent: "codex",
    path: root,
    scope: "personal",
    origin: "local",
  });

  assert.equal(inventory.length, 1);
  assert.equal(inventory[0]!.source_kind, "memory_file");
  assert.ok(inventory[0]!.content_spans.some((span) =>
    span.span_kind === "heading" &&
    span.excerpt === "Verification" &&
    span.heading_path.includes("Verification")
  ));
  assert.ok(inventory[0]!.content_spans.some((span) =>
    span.span_kind === "bullet" &&
    span.excerpt.includes("focused source inventory test")
  ));
  assert.ok(inventory[0]!.content_spans.some((span) =>
    span.span_kind === "paragraph" &&
    span.excerpt.includes("markdown paragraphs available")
  ));
});

test("maps OpenClaw sqlite memory rows into evidence spans", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-m25-sqlite-"));
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
    VALUES
      ('chunk-1', 'openclaw://memory/ops', 'memory', 10, 12, 'hash-1', 'text-embedding', 'Confirm target machine before restart.', '[]', 1770000000),
      ('chunk-2', 'openclaw://memory/runtime', 'memory', 20, 21, 'hash-2', 'text-embedding', 'Send ACK before long dispatch work.', '[]', 1770000001);
  `]);

  const inventory = await buildSourceInventory(root, {
    agent: "openclaw",
    path: dbPath,
    scope: "personal",
    origin: "local",
  });

  assert.equal(inventory.length, 1);
  assert.equal(inventory[0]!.source_kind, "sqlite_memory");
  assert.equal(inventory[0]!.content_spans.length, 2);
  assert.ok(inventory[0]!.content_spans.some((span) => span.span_kind === "sqlite_row" && span.excerpt.includes("target machine")));
});

test("excludes OpenClaw dreaming sqlite rows from lesson evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-m25-sqlite-dream-"));
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
    VALUES
      ('dream-1', 'memory/dreaming/light/2026-05-29.md', 'memory', 1, 1, 'hash-dream', 'text-embedding', 'Write a dream diary entry from these memory fragments.', '[]', 1779999999),
      ('memory-1', 'MEMORY.md', 'memory', 2, 2, 'hash-memory', 'text-embedding', 'Confirm target machine before restart.', '[]', 1770000000);
  `]);

  const inventory = await buildSourceInventory(root, {
    agent: "openclaw",
    path: dbPath,
    scope: "personal",
    origin: "local",
  });

  assert.equal(inventory.length, 1);
  assert.equal(inventory[0]!.content_spans.length, 1);
  assert.ok(inventory[0]!.content_spans[0]!.excerpt.includes("target machine"));
  assert.ok(!inventory[0]!.content_spans.some((span) => span.heading_path.join("/").includes("dreaming")));
});

test("excludes OpenClaw dream diary sqlite rows from lesson evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "pb-m25-sqlite-dream-diary-"));
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
    VALUES
      ('diary-1', 'memory/dream-diary-2026-04-16.md', 'memory', 1, 1, 'hash-diary', 'text-embedding', 'The night left a snag in the thread.', '[]', 1779999999),
      ('memory-1', 'memory/2026-04-30.md', 'memory', 2, 2, 'hash-memory', 'text-embedding', 'Run self-test after changing code.', '[]', 1770000000);
  `]);

  const inventory = await buildSourceInventory(root, {
    agent: "openclaw",
    path: dbPath,
    scope: "personal",
    origin: "local",
  });

  assert.equal(inventory.length, 1);
  assert.equal(inventory[0]!.content_spans.length, 1);
  assert.ok(inventory[0]!.content_spans[0]!.excerpt.includes("self-test"));
  assert.ok(!inventory[0]!.content_spans.some((span) => span.heading_path.join("/").includes("dream-diary")));
});

test("expands home-relative source paths before scanning", async () => {
  const dir = await mkdtemp(join(homedir(), ".praxisbase-source-inventory-test-"));
  try {
    await writeFile(join(dir, "MEMORY.md"), "- Confirm target machine before restart.\n", "utf8");

    const inventory = await buildSourceInventory(process.cwd(), {
      agent: "openclaw",
      path: `~/${dir.slice(homedir().length + 1)}`,
      scope: "personal",
      origin: "local",
    });

    assert.equal(inventory.length, 1);
    assert.equal(inventory[0]!.source_kind, "memory_file");
    assert.ok(inventory[0]!.content_spans.some((span) => span.excerpt.includes("target machine")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
