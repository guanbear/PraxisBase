/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
