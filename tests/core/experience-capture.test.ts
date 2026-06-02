import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { finishCapture } from "@praxisbase/core";

describe("finishCapture", () => {
  it("writes a capture record to outbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));

    const result = await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      triggers: ["task_finish", "tests_run"],
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-1",
        sourceHash: "sha256:session1",
        redactedSummary: "Fixed a failing test.",
      },
    });

    assert.match(result.path, /^\.praxisbase\/outbox\/captures\/capture_/);
    const saved = JSON.parse(await readFile(join(root, result.path), "utf8"));
    assert.equal(saved.type, "capture_record");
    assert.equal(saved.agent, "codex");
    assert.equal(saved.artifacts[0].source_ref, "raw-vault://codex/session-1");
  });

  it("uses idempotency key as the stable capture id", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));

    const result = await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      triggers: ["task_finish"],
      idempotencyKey: "codex-session-1",
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-1",
        sourceHash: "sha256:session1",
        redactedSummary: "Fixed a failing test.",
      },
    });

    assert.equal(result.id, "capture_codex-session-1");
    assert.equal(result.path, ".praxisbase/outbox/captures/capture_codex-session-1.json");
  });

  it("rejects raw artifact paths under stable knowledge directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));

    await assert.rejects(
      () =>
        finishCapture(root, {
          agent: "codex",
          workspace: root,
          result: "success",
          triggers: ["task_finish"],
          artifact: {
            kind: "transcript",
            sourceRef: "kb/raw-transcript.md",
            sourceHash: "sha256:bad",
            redactedSummary: "Raw transcript.",
          },
        }),
      /RAW_ARTIFACT_REJECTED/
    );
  });

  it("rejects unsupported raw artifact ref schemes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-capture-"));

    await assert.rejects(
      () =>
        finishCapture(root, {
          agent: "codex",
          workspace: root,
          result: "success",
          triggers: ["task_finish"],
          artifact: {
            kind: "transcript",
            sourceRef: "http://example.com/raw-transcript",
            sourceHash: "sha256:bad",
            redactedSummary: "Raw transcript.",
          },
        }),
      /RAW_ARTIFACT_REJECTED/
    );
  });
});
