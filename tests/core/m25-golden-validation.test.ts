/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { runM25GoldenValidation } from "@praxisbase/core";

test("M25 golden validation extracts OpenClaw and Codex lessons without private leaks", async () => {
  const results = await runM25GoldenValidation("2026-05-29T00:00:00.000Z");
  const local = results.find((result) => result.fixture === "openclaw-local");
  const remote = results.find((result) => result.fixture === "openclaw-remote");
  const codexApp = results.find((result) => result.fixture === "codex-app");
  const codexCliProxy = results.find((result) => result.fixture === "codex-cliproxyapi");
  if (!local || !remote || !codexApp || !codexCliProxy) throw new Error("missing golden validation fixtures");

  assert.equal(local.expected_targets.length, 8);
  assert.equal(remote.expected_targets.length, 8);
  assert.equal(codexApp.expected_targets.length, 5);
  assert.equal(codexCliProxy.expected_targets.length, 5);
  assert.ok(local.matches >= 5);
  assert.ok(remote.matches >= 6);
  assert.ok(codexApp.matches >= 5);
  assert.ok(codexCliProxy.matches >= 5);
  assert.deepEqual(local.missing_targets, []);
  assert.deepEqual(remote.missing_targets, []);
  assert.deepEqual(codexApp.missing_targets, []);
  assert.deepEqual(codexCliProxy.missing_targets, []);
  assert.equal(local.privateLeakCount, 0);
  assert.equal(remote.privateLeakCount, 0);
  assert.equal(codexApp.privateLeakCount, 0);
  assert.equal(codexCliProxy.privateLeakCount, 0);
  assert.ok(local.lessons_with_span_provenance >= local.matches);
  assert.ok(remote.lessons_with_span_provenance >= remote.matches);
  assert.ok(codexApp.lessons_with_span_provenance >= codexApp.matches);
  assert.ok(codexCliProxy.lessons_with_span_provenance >= codexCliProxy.matches);
});
