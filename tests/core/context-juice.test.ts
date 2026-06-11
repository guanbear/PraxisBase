import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONTEXT_JUICE_VERSION,
  DEFAULT_RECENT_RESULTS,
  MICROCOMPACT_PLACEHOLDER,
  applySourceItemBudget,
  estimateTokens,
  reserveOutputSpace,
  trajectoryMicrocompact,
  utf8ByteLength,
} from "@praxisbase/core/experience/context-juice.js";

describe("context juice source item budget", () => {
  it("truncates with a UTF-8 safe prefix and source pointer marker", () => {
    const result = applySourceItemBudget("你好abc", { maxBytes: 7, budgetId: "tiny" }, {
      sourceRef: "session://codex/utf8",
      sourceHash: "sha256:utf8",
    });

    assert.equal(result.text.startsWith("你好"), true);
    assert.equal(result.text.includes("�"), false);
    assert.equal(result.truncated, true);
    assert.equal(result.original_bytes, utf8ByteLength("你好abc"));
    assert.equal(result.source_ref, "session://codex/utf8");
    assert.equal(result.source_hash, "sha256:utf8");
    assert.match(result.marker ?? "", /bytes truncated by praxisbase_context_juice/);
    assert.match(result.text, /source_ref session:\/\/codex\/utf8/);
  });

  it("returns unchanged text when it fits the budget", () => {
    const result = applySourceItemBudget("small payload", { maxBytes: 1024, budgetId: "fit" }, {
      sourceRef: "session://codex/small",
    });

    assert.equal(result.text, "small payload");
    assert.equal(result.truncated, false);
    assert.equal(result.saved_bytes, 0);
    assert.equal(result.marker, undefined);
  });

  it("supports zero-byte payload budgets by keeping only the provenance marker", () => {
    const result = applySourceItemBudget("drop me", { maxBytes: 0, budgetId: "zero" }, {
      sourceRef: "session://codex/zero",
    });

    assert.equal(result.text.startsWith("[..."), true);
    assert.equal(result.text.includes("drop me"), false);
    assert.equal(result.truncated, true);
  });
});

describe("trajectory microcompact", () => {
  it("preserves recent tool results and protected signals while clearing old low-signal bodies", () => {
    const entries = [
      { id: "goal", kind: "user_goal", content: "fix openclaw auth" },
      { id: "old-tool", kind: "tool_result", content: "very long old output" },
      { id: "failure", kind: "failure", content: "login failed with expired token" },
      { id: "fix", kind: "fix", content: "refresh login token" },
      { id: "verify", kind: "verification", content: "smoke passed" },
      { id: "recent-1", kind: "tool_result", content: "recent output 1" },
      { id: "recent-2", kind: "tool_result", content: "recent output 2" },
    ];

    const compacted = trajectoryMicrocompact(entries, {
      budgetId: "micro",
      sourceRef: "session://codex/trajectory",
      recentResults: 2,
    });

    assert.equal(compacted.entries.find((entry) => entry.id === "old-tool")?.content, MICROCOMPACT_PLACEHOLDER);
    assert.equal(compacted.entries.find((entry) => entry.id === "failure")?.content, "login failed with expired token");
    assert.equal(compacted.entries.find((entry) => entry.id === "fix")?.content, "refresh login token");
    assert.equal(compacted.entries.find((entry) => entry.id === "verify")?.content, "smoke passed");
    assert.equal(compacted.entries.find((entry) => entry.id === "recent-1")?.content, "recent output 1");
    assert.equal(compacted.report.cleared_entries, 1);
    assert.equal(compacted.report.protected_signal_count, 3);
    assert.equal(compacted.report.recent_results_kept, 2);
  });

  it("is idempotent after the first microcompact pass", () => {
    const first = trajectoryMicrocompact([
      { id: "tool-1", kind: "tool_result", content: "old output" },
      { id: "tool-2", kind: "tool_result", content: "new output" },
    ], {
      budgetId: "micro",
      sourceRef: "session://codex/idempotent",
      recentResults: 1,
    });
    const second = trajectoryMicrocompact(first.entries, {
      budgetId: "micro",
      sourceRef: "session://codex/idempotent",
      recentResults: 1,
    });

    assert.deepEqual(second.entries, first.entries);
    assert.equal(second.report.idempotent, true);
    assert.equal(second.report.cleared_entries, 0);
  });

  it("does not treat ordinary tool-result provenance metadata as protected body content", () => {
    const compacted = trajectoryMicrocompact([
      { id: "tool-1", kind: "tool_result", content: "old output with source ref", source_ref: "raw-vault://tool/1", source_hash: "sha256:tool1" },
      { id: "tool-2", kind: "tool_result", content: "recent output", source_ref: "raw-vault://tool/2" },
    ], {
      budgetId: "micro",
      sourceRef: "session://codex/source-ref",
      recentResults: 1,
    });

    assert.equal(compacted.entries[0].content, MICROCOMPACT_PLACEHOLDER);
    assert.equal(compacted.entries[0].source_ref, "raw-vault://tool/1");
    assert.equal(compacted.entries[0].source_hash, "sha256:tool1");
    assert.equal(compacted.report.cleared_entries, 1);
  });

  it("uses the documented default recent result count", () => {
    assert.equal(DEFAULT_RECENT_RESULTS, 5);
    assert.equal(CONTEXT_JUICE_VERSION, "context-juice-v1");
  });
});

describe("context juice token helpers", () => {
  it("estimates tokens and reserves output space conservatively", () => {
    assert.equal(estimateTokens("12345678"), 2);
    assert.deepEqual(reserveOutputSpace(100, 20), {
      max_tokens: 100,
      reserved_output_tokens: 20,
      available_input_tokens: 80,
    });
  });
});
