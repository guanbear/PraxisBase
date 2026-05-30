/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { planLessonSpans } from "@praxisbase/core";

test("memory spans survive small budgets before newer logs", () => {
  const memorySpan = {
    source_item_id: "memory",
    source_ref: "source-inventory://openclaw/MEMORY.md",
    source_hash: "sha256:m",
    span_id: "memory-ack",
    line_start: 2,
    line_end: 2,
    byte_start: 10,
    byte_end: 60,
    heading_path: ["Running"],
    excerpt: "Need ACK before long dispatch tasks.",
    excerpt_hash: "sha256:me",
    span_kind: "bullet" as const,
  };
  const logSpan = {
    ...memorySpan,
    source_item_id: "log",
    source_ref: "source-inventory://openclaw/new.log",
    span_id: "log-1",
    excerpt: "Smoke ran.",
    excerpt_hash: "sha256:le",
  };
  const selected = planLessonSpans(
    [
      {
        source_item_id: "log",
        source_kind: "session",
        authority_hint: "session_transcript",
        content_spans: [logSpan],
      } as any,
      {
        source_item_id: "memory",
        source_kind: "memory_file",
        authority_hint: "agent_native_memory",
        content_spans: [memorySpan],
      } as any,
    ],
    { maxSpans: 1 },
  );

  assert.equal(selected[0].span_id, "memory-ack");
});

test("planner reserves memory budget even when logs have many explicit markers", () => {
  const memorySpan = {
    source_item_id: "memory",
    source_ref: "source-inventory://openclaw/MEMORY.md",
    source_hash: "sha256:m",
    span_id: "memory-quiet",
    line_start: 2,
    line_end: 2,
    byte_start: 10,
    byte_end: 60,
    heading_path: ["Memory"],
    excerpt: "Keep durable lessons concise.",
    excerpt_hash: "sha256:me",
    span_kind: "bullet" as const,
  };
  const noisyLogs = Array.from({ length: 8 }, (_, index) => ({
    ...memorySpan,
    source_item_id: `log-${index}`,
    source_ref: `source-inventory://openclaw/run-${index}.log`,
    span_id: `log-${index}`,
    excerpt: "critical verified failure fix must always check important required lesson",
    excerpt_hash: `sha256:log-${index}`,
  }));

  const selected = planLessonSpans(
    [
      {
        source_item_id: "logs",
        source_kind: "session",
        authority_hint: "session_transcript",
        content_spans: noisyLogs,
      } as any,
      {
        source_item_id: "memory",
        source_kind: "memory_file",
        authority_hint: "agent_native_memory",
        content_spans: [memorySpan],
      } as any,
    ],
    { maxSpans: 3 },
  );

  assert.ok(selected.some((span) => span.span_id === "memory-quiet"));
});

test("planner boosts repeated evidence across spans", () => {
  const makeSpan = (spanId: string, excerpt: string) => ({
    source_item_id: spanId,
    source_ref: `source-inventory://codex/${spanId}.log`,
    source_hash: `sha256:${spanId}`,
    span_id: spanId,
    line_start: 1,
    line_end: 1,
    byte_start: 0,
    byte_end: 80,
    heading_path: [],
    excerpt,
    excerpt_hash: `sha256:${spanId}`,
    span_kind: "paragraph" as const,
  });
  const repeated1 = makeSpan("repeat-1", "Dispatch failed until target machine was confirmed.");
  const repeated2 = makeSpan("repeat-2", "Dispatch failed until target machine was confirmed.");
  const singleton = makeSpan("single", "A critical verified important fix passed.");

  const selected = planLessonSpans(
    [{
      source_item_id: "logs",
      source_kind: "session",
      authority_hint: "session_transcript",
      content_spans: [singleton, repeated1, repeated2],
    } as any],
    { maxSpans: 2 },
  );

  assert.deepEqual(
    selected.map((span) => span.span_id).sort(),
    ["repeat-1", "repeat-2"],
  );
});

test("planner carries nearest heading context with selected memory spans", () => {
  const headingSpan = {
    source_item_id: "memory",
    source_ref: "source-inventory://openclaw/MEMORY.md",
    source_hash: "sha256:m",
    span_id: "heading-ops",
    line_start: 1,
    line_end: 1,
    byte_start: 0,
    byte_end: 20,
    heading_path: ["Operations"],
    excerpt: "Operations",
    excerpt_hash: "sha256:h",
    span_kind: "heading" as const,
  };
  const lessonSpan = {
    ...headingSpan,
    span_id: "memory-target-machine",
    line_start: 2,
    line_end: 2,
    byte_start: 21,
    byte_end: 80,
    excerpt: "Confirm target machine before restart.",
    excerpt_hash: "sha256:l",
    span_kind: "bullet" as const,
  };

  const selected = planLessonSpans(
    [{
      source_item_id: "memory",
      source_kind: "memory_file",
      authority_hint: "agent_native_memory",
      content_spans: [headingSpan, lessonSpan],
    } as any],
    { maxSpans: 1 },
  );

  assert.deepEqual(
    selected.map((span) => span.span_id),
    ["heading-ops", "memory-target-machine"],
  );
});

test("planner preserves diverse golden memory lessons under noisy equal-score memory", () => {
  const makeSpan = (spanId: string, line: number, excerpt: string, kind: "heading" | "bullet" | "paragraph" = "bullet") => ({
    source_item_id: "memory",
    source_ref: "source-inventory://openclaw/remote/MEMORY.md",
    source_hash: "sha256:m",
    span_id: spanId,
    line_start: line,
    line_end: line,
    byte_start: line * 10,
    byte_end: line * 10 + excerpt.length,
    heading_path: ["Important lessons"],
    excerpt,
    excerpt_hash: `sha256:${spanId}`,
    span_kind: kind,
  });
  const noisy = Array.from({ length: 60 }, (_, index) =>
    makeSpan(
      `noise-${index}`,
      100 + index,
      "Slack daily report generated successfully with cache fallback and important verified delivery notes.",
    ),
  );
  const golden = [
    makeSpan("self-test", 10, "修改后必须自测，不要让用户反复测试。", "paragraph"),
    makeSpan("target-machine", 11, "执行重启或停止命令前必须明确确认目标机器，避免在错机器上操作。"),
    makeSpan("cache-bust", 12, "前端更新后使用 ?v=timestamp 强刷，避免浏览器缓存。"),
    makeSpan("nocase", 13, "数据库查询使用 COLLATE NOCASE，避免大小写坑。"),
    makeSpan("failover", 14, "智谱限流时切 OmniRoute 回退，保留降级状态。"),
  ];

  const selected = planLessonSpans(
    [{
      source_item_id: "memory",
      source_kind: "memory_file",
      authority_hint: "agent_native_memory",
      content_spans: [...noisy, ...golden],
    } as any],
    { maxSpans: 10 },
  );

  for (const spanId of ["self-test", "target-machine", "cache-bust", "nocase", "failover"]) {
    assert.ok(
      selected.some((span) => span.span_id === spanId),
      `expected selected spans to include ${spanId}`,
    );
  }
});
