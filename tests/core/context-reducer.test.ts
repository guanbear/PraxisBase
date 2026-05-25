import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reduceContext,
  normalizeReducerInput,
  stripAnsi,
  dropLinesMatching,
  dedupeAdjacentLines,
  collapseWhitespace,
  headTail,
  preserveSectionsMatching,
  truncate,
  buildContextEconomyReport,
  buildBuiltinRules,
  validateRules,
  computeRuleSetHash,
  computeSpecificity,
  matchRule,
  isFileInspection,
  REDUCER_VERSION,
  MIN_REDUCE_INPUT_BYTES,
  MIN_USEFUL_REDUCTION_RATIO,
  NormalizedReducerInputSchema,
  ContextReducerRuleSchema,
  ContextReductionResultSchema,
  ContextEconomyReportSchema,
  ContextEconomyReport,
  ContextReductionResult,
  protocolPaths,
} from "@praxisbase/core";
import type { ContextReducerRule } from "@praxisbase/core";

function repeatText(text: string, times: number): string {
  return Array(times).fill(text).join("\n");
}

function makeLargeText(minBytes: number): string {
  const line = "A".repeat(80);
  const linesNeeded = Math.ceil(minBytes / 80) + 1;
  return repeatText(line, linesNeeded);
}

describe("context reducer protocol", () => {
  describe("schemas and paths", () => {
    it("exposes context economy report path", () => {
      assert.equal(protocolPaths.reportsContextEconomy, ".praxisbase/reports/context-economy");
    });

    it("validates NormalizedReducerInput schema", () => {
      const parsed = NormalizedReducerInputSchema.parse({
        command: "pnpm test",
        argv: ["pnpm", "test"],
        stdout: "all tests passed",
        stderr: "",
        combined_text: "all tests passed",
        exit_code: 0,
        source_metadata: { agent: "codex" },
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:abc123",
      });
      assert.equal(parsed.command, "pnpm test");
      assert.deepEqual(parsed.argv, ["pnpm", "test"]);
      assert.equal(parsed.exit_code, 0);
      assert.equal(parsed.source_ref, "raw-vault://codex/session-1");
      assert.equal(parsed.source_hash, "sha256:abc123");
    });

    it("validates ContextReducerRule schema with defaults", () => {
      const parsed = ContextReducerRuleSchema.parse({
        id: "test-rule",
        family: "test",
        actions: [{ type: "strip_ansi" }],
      });
      assert.equal(parsed.priority, 0);
      assert.equal(parsed.confidence, 1);
      assert.equal(parsed.pass_through_file_inspection, true);
      assert.equal(parsed.preserve_failure_tail, false);
      assert.equal(parsed.preserve_failure_tail_lines, 30);
    });

    it("validates ContextReductionResult schema", () => {
      const result = reduceContext({
        combined_text: makeLargeText(1024),
        source_ref: "test://ref",
        source_hash: "sha256:test",
      });
      const parsed = ContextReductionResultSchema.parse(result);
      assert.equal(typeof parsed.reducer_version, "string");
      assert.equal(typeof parsed.rule_set_hash, "string");
      assert.equal(typeof parsed.reduction_hash, "string");
    });

    it("validates ContextEconomyReport schema", () => {
      const report = buildContextEconomyReport([
        reduceContext({ combined_text: makeLargeText(1024) }),
      ]);
      const parsed = ContextEconomyReportSchema.parse(report);
      assert.equal(parsed.type, "context_economy_report");
      assert.equal(parsed.reducer_version, REDUCER_VERSION);
      assert.equal(parsed.items_seen, 1);
    });
  });

  describe("normalization", () => {
    it("normalizes from command, stdout, stderr, combined_text, exit_code", () => {
      const result = normalizeReducerInput({
        command: "pnpm test",
        stdout: "running tests...",
        stderr: "no errors",
        combined_text: "running tests...\nno errors",
        exit_code: 0,
        source_ref: "ref://1",
        source_hash: "sha256:abc",
      });
      assert.equal(result.command, "pnpm test");
      assert.ok(result.text.includes("running tests..."));
      assert.ok(result.text.includes("no errors"));
      assert.equal(result.exit_code, 0);
      assert.equal(result.source_ref, "ref://1");
      assert.equal(result.source_hash, "sha256:abc");
    });

    it("normalizes from cmd alias for command", () => {
      const result = normalizeReducerInput({
        cmd: "npm run build",
        combined_text: "built successfully",
      });
      assert.equal(result.command, "npm run build");
    });

    it("normalizes from argv array", () => {
      const result = normalizeReducerInput({
        argv: ["pnpm", "test", "--run"],
        combined_text: "test output",
      });
      assert.deepEqual(result.argv, ["pnpm", "test", "--run"]);
    });

    it("combines stdout, stderr, and combined_text into text", () => {
      const result = normalizeReducerInput({
        stdout: "out",
        stderr: "err",
        combined_text: "combined",
      });
      assert.equal(result.text, "out\nerr\ncombined");
    });

    it("preserves source metadata", () => {
      const result = normalizeReducerInput({
        combined_text: "text",
        source_metadata: { agent: "codex", session: "s1" },
      });
      assert.deepEqual(result.source_metadata, { agent: "codex", session: "s1" });
    });

    it("handles null exit_code", () => {
      const result = normalizeReducerInput({
        combined_text: "text",
        exit_code: null,
      });
      assert.equal(result.exit_code, null);
    });
  });

  describe("deterministic actions", () => {
    it("strip_ansi removes ANSI escape sequences", () => {
      const input = "\u001b[32mSuccess\u001b[0m: all \u001b[1mdone\u001b[0m";
      const result = stripAnsi(input);
      assert.equal(result, "Success: all done");
    });

    it("strip_ansi preserves non-ANSI text", () => {
      const input = "Hello World\nLine 2";
      assert.equal(stripAnsi(input), input);
    });

    it("drop_lines_matching removes matching lines", () => {
      const input = "keep\nremove-me\nkeep too\nalso remove-me";
      const result = dropLinesMatching(input, "remove-me");
      assert.equal(result, "keep\nkeep too");
    });

    it("drop_lines_matching with regex pattern", () => {
      const input = "keep\n   \nkeep too\n  ";
      const result = dropLinesMatching(input, "^\\s*$");
      assert.equal(result, "keep\nkeep too");
    });

    it("drop_lines_matching returns original on invalid regex", () => {
      const input = "some text";
      const result = dropLinesMatching(input, "[invalid");
      assert.equal(result, "some text");
    });

    it("dedupe_adjacent_lines collapses consecutive duplicates", () => {
      const input = "line1\nline1\nline2\nline2\nline2\nline3";
      const result = dedupeAdjacentLines(input);
      assert.equal(result, "line1\nline2\nline3");
    });

    it("dedupe_adjacent_lines preserves non-adjacent duplicates", () => {
      const input = "line1\nline2\nline1";
      const result = dedupeAdjacentLines(input);
      assert.equal(result, "line1\nline2\nline1");
    });

    it("collapse_whitespace collapses multiple spaces to one", () => {
      const input = "hello   world  \n  foo   bar  ";
      const result = collapseWhitespace(input);
      assert.equal(result, "hello world\n foo bar");
    });

    it("head_tail preserves text shorter than threshold", () => {
      const input = Array(5).fill("line").join("\n");
      const result = headTail(input, 10, 10);
      assert.equal(result, input);
    });

    it("head_tail clips long text with omission marker", () => {
      const lines = Array(200).fill("line content here");
      const input = lines.join("\n");
      const result = headTail(input, 40, 40);
      assert.ok(result.includes("[120 lines omitted]"));
      const resultLines = result.split("\n");
      assert.equal(resultLines.length, 81);
    });

    it("preserve_sections_matching keeps matching lines", () => {
      const input = "normal line\nERROR: something broke\nnormal\nFAIL: test failed\nok";
      const result = preserveSectionsMatching(input, "(?:ERROR|FAIL)");
      assert.equal(result, "ERROR: something broke\nFAIL: test failed");
    });

    it("preserve_sections_matching returns empty for no matches", () => {
      const input = "normal line\nanother line";
      const result = preserveSectionsMatching(input, "ERROR");
      assert.equal(result, "");
    });

    it("preserve_sections_matching returns original on invalid regex", () => {
      const input = "some text";
      const result = preserveSectionsMatching(input, "[invalid");
      assert.equal(result, "some text");
    });

    it("truncate truncates to max bytes (UTF-8 safe)", () => {
      const input = "Hello 🌍 World 🌍";
      const inputBytes = Buffer.byteLength(input, "utf8");
      const halfBytes = Math.floor(inputBytes / 2);
      const result = truncate(input, halfBytes);
      assert.ok(Buffer.byteLength(result, "utf8") <= halfBytes);
      assert.ok(result.length > 0);
    });

    it("truncate returns original when under limit", () => {
      const input = "short";
      assert.equal(truncate(input, 1000), input);
    });

    it("experience fidelity compression preserves reusable evidence while dropping agent boilerplate", () => {
      const boilerplate = [
        "Knowledge cutoff: 2024-06",
        "You are Codex, a coding agent based on GPT-5.",
        "# AGENTS.md instructions for /repo",
        "Tool definitions: exec_command apply_patch update_plan",
        "<environment_context>",
        "  <cwd>/repo</cwd>",
        "</environment_context>",
      ].join("\n");
      const repeatedProgress = repeatText("progress: scanned unchanged file", 80);
      const evidence = [
        "User goal: fix OpenClaw gateway restart after configuration changes.",
        "Command: node packages/cli/dist/index.js daily run --mode personal --progress --json",
        "*** Update File: packages/gateway/src/config.ts",
        "ERROR: gateway kept old routing table after config reload",
        "Fix: restart gateway after config changes and verify route table refresh.",
        "Verification: smoke test passed after restart; report id run_gateway_restart_2026-05-25.",
        "Reusable lesson: after OpenClaw config changes, restart the gateway before judging routing failures.",
        "Provenance: openclaw-memory://memory/dreaming/rem/2026-05-25.md#abc123 sha256:feedface",
      ].join("\n");
      const text = [
        boilerplate,
        repeatedProgress,
        evidence,
        boilerplate,
        repeatedProgress,
      ].join("\n");

      const result = reduceContext({
        combined_text: text,
        source_metadata: { agent: "codex" },
        source_ref: "codex://session-experience",
        source_hash: "sha256:experience",
      }, {
        rules: [{
          id: "experience-fidelity-test",
          family: "codex-session",
          priority: 99,
          confidence: 1,
          pass_through_file_inspection: false,
          preserve_failure_tail: false,
          preserve_failure_tail_lines: 30,
          actions: [
            { type: "strip_ansi" },
            { type: "preserve_experience_fidelity", window_lines: 1, max_sections: 40 },
          ] as any,
        }],
        minReduceInputBytes: 100,
      });

      assert.equal(result.applied, true);
      assert.ok(result.text.includes("User goal: fix OpenClaw gateway restart"), result.text);
      assert.ok(result.text.includes("Command: node packages/cli/dist/index.js daily run"), result.text);
      assert.ok(result.text.includes("*** Update File: packages/gateway/src/config.ts"), result.text);
      assert.ok(result.text.includes("ERROR: gateway kept old routing table"), result.text);
      assert.ok(result.text.includes("Fix: restart gateway"), result.text);
      assert.ok(result.text.includes("Verification: smoke test passed"), result.text);
      assert.ok(result.text.includes("Reusable lesson: after OpenClaw config changes"), result.text);
      assert.ok(result.text.includes("Provenance: openclaw-memory://"), result.text);
      assert.ok(!result.text.includes("Knowledge cutoff"), result.text);
      assert.ok(!result.text.includes("Tool definitions:"), result.text);
      assert.ok(!result.text.includes("# AGENTS.md instructions"), result.text);
      assert.ok((result.counters.preserved_signal_lines ?? 0) >= 8);
      assert.ok((result.counters.dropped_boilerplate_lines ?? 0) >= 6);
      assert.ok((result.counters.deduped_repeated_blocks ?? 0) >= 1);
    });

    it("experience fidelity compression keeps only source lines and omission markers", () => {
      const sourceLines = [
        "ordinary setup line",
        "ERROR: CLI timed out while waiting for wiki curate",
        "Fix: lower concurrency and resume from cached distill chunks",
        "Verification: daily run completed with ok=true",
        "source_hash: sha256:abc123",
      ];
      const result = reduceContext({
        combined_text: [
          "You are Codex, a coding agent based on GPT-5.",
          ...sourceLines,
          repeatText("progress: no signal", 40),
        ].join("\n"),
      }, {
        rules: [{
          id: "experience-fidelity-no-synthesis",
          family: "generic",
          priority: 99,
          confidence: 1,
          pass_through_file_inspection: false,
          preserve_failure_tail: false,
          preserve_failure_tail_lines: 30,
          actions: [{ type: "preserve_experience_fidelity", window_lines: 0, max_sections: 20 } as any],
        }],
        minReduceInputBytes: 10,
      });

      assert.equal(result.applied, true);
      const allowed = new Set(sourceLines);
      for (const line of result.text.split(/\r?\n/).filter(Boolean)) {
        assert.ok(allowed.has(line) || /^\.\.\. \[\d+/.test(line), `unexpected synthesized line: ${line}`);
      }
    });
  });

  describe("specificity scoring", () => {
    it("higher priority rule scores higher", () => {
      const highPriorityRule: ContextReducerRule = {
        id: "a-high",
        family: "test",
        priority: 10,
        confidence: 1,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "strip_ansi" }],
      };
      const lowPriorityRule: ContextReducerRule = {
        id: "b-low",
        family: "test",
        priority: 1,
        confidence: 1,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "strip_ansi" }],
      };
      const high = computeSpecificity(highPriorityRule, { command: "test" });
      const low = computeSpecificity(lowPriorityRule, { command: "test" });
      assert.ok(high > low);
    });

    it("tool_match increases specificity", () => {
      const withTool: ContextReducerRule = {
        id: "with-tool",
        family: "test",
        priority: 1,
        confidence: 1,
        tool_match: "pnpm",
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "strip_ansi" }],
      };
      const withoutTool: ContextReducerRule = {
        id: "without-tool",
        family: "test",
        priority: 1,
        confidence: 1,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "strip_ansi" }],
      };
      const scoreWith = computeSpecificity(withTool, { argv: ["pnpm", "test"] });
      const scoreWithout = computeSpecificity(withoutTool, { argv: ["pnpm", "test"] });
      assert.ok(scoreWith > scoreWithout);
    });

    it("tool_match is a positive match requirement", () => {
      const matchingRule: ContextReducerRule = {
        id: "cat-rule",
        family: "file",
        priority: 10,
        confidence: 1,
        tool_match: "cat",
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "strip_ansi" }],
      };
      const result = matchRule([matchingRule], {
        text: makeLargeText(1024),
        argv: ["pnpm", "test"],
        command: "pnpm test",
      });
      assert.equal(result, null);
    });

    it("ties break by rule id (deterministic)", () => {
      const ruleA: ContextReducerRule = {
        id: "alpha-rule",
        family: "test",
        priority: 1,
        confidence: 1,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "strip_ansi" }],
      };
      const ruleB: ContextReducerRule = {
        id: "beta-rule",
        family: "test",
        priority: 1,
        confidence: 1,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "strip_ansi" }],
      };
      const result = matchRule([ruleB, ruleA], { text: "some text" });
      assert.ok(result);
      assert.equal(result.rule.id, "alpha-rule");
    });

    it("test-output rule beats generic fallback", () => {
      const rules = buildBuiltinRules();
      const result = matchRule(rules, {
        text: makeLargeText(1024),
        argv: ["pnpm", "test"],
        command: "pnpm test",
      });
      assert.ok(result);
      assert.equal(result.rule.family, "test-output");
    });

    it("git-output rule beats generic fallback", () => {
      const rules = buildBuiltinRules();
      const result = matchRule(rules, {
        text: makeLargeText(1024),
        argv: ["git", "log"],
        command: "git log --oneline",
      });
      assert.ok(result);
      assert.equal(result.rule.family, "git-output");
    });

    it("plain text without command/source falls back to generic", () => {
      const rules = buildBuiltinRules();
      const result = matchRule(rules, {
        text: makeLargeText(1024),
      });
      assert.ok(result);
      assert.equal(result.rule.family, "generic");
    });
  });

  describe("pass-through safety", () => {
    it("tiny input is not reduced", () => {
      const result = reduceContext({
        combined_text: "short",
        source_ref: "test://tiny",
        source_hash: "sha256:tiny",
      });
      assert.equal(result.applied, false);
      assert.equal(result.text, "short");
      assert.equal(result.original_bytes, result.reduced_bytes);
      assert.ok(result.warnings.some((w) => w.includes("input_below_threshold")));
    });

    it("non-beneficial reduction returns original text", () => {
      const text = Array(20).fill("unique line " + Math.random()).join("\n");
      const result = reduceContext({
        combined_text: text,
      }, {
        minReduceInputBytes: 10,
        minUsefulReductionRatio: 0.01,
      });
      assert.equal(result.applied, false);
      assert.equal(result.text, text);
      assert.ok(result.warnings.some((w) => w.includes("reduction_not_beneficial")));
    });

    it("file inspection commands pass through (cat)", () => {
      const largeText = makeLargeText(5000);
      const result = reduceContext({
        argv: ["cat", "src/app.ts"],
        combined_text: largeText,
        source_ref: "test://cat",
        source_hash: "sha256:cat",
      }, {
        minReduceInputBytes: 100,
      });
      assert.equal(result.applied, false);
      assert.equal(result.text, largeText);
      assert.ok(result.warnings.some((w) => w.includes("file_inspection_pass_through")));
    });

    it("file inspection can be explicitly reduced by a matching rule", () => {
      const largeText = repeatText("same source line", 400);
      const catRule: ContextReducerRule = {
        id: "cat-reduce",
        family: "file-inspection-opt-in",
        priority: 20,
        confidence: 1,
        tool_match: "cat",
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [
          { type: "dedupe_adjacent_lines" },
          { type: "head_tail", head_lines: 10, tail_lines: 10 },
        ],
      };

      const result = reduceContext({
        argv: ["cat", "src/app.ts"],
        combined_text: largeText,
      }, {
        rules: [catRule],
        minReduceInputBytes: 100,
      });

      assert.equal(result.applied, true);
      assert.equal(result.matched_rule_id, "cat-reduce");
      assert.ok(result.reduced_bytes < result.original_bytes);
    });

    it("pass-through still preserves failure facts", () => {
      const result = reduceContext({
        combined_text: "short failure",
        exit_code: 1,
      });
      assert.equal(result.applied, false);
      assert.equal(result.facts.is_failure, true);
    });

    it("file inspection commands pass through (sed)", () => {
      const largeText = makeLargeText(5000);
      const result = reduceContext({
        command: "sed -n '1,200p' src/app.ts",
        combined_text: largeText,
      }, {
        minReduceInputBytes: 100,
      });
      assert.equal(result.applied, false);
      assert.ok(result.warnings.some((w) => w.includes("file_inspection_pass_through")));
    });

    it("file inspection commands pass through (jq)", () => {
      const largeText = makeLargeText(5000);
      const result = reduceContext({
        argv: ["jq", ".name"],
        combined_text: largeText,
      }, {
        minReduceInputBytes: 100,
      });
      assert.equal(result.applied, false);
    });

    it("file inspection commands pass through (bat)", () => {
      const largeText = makeLargeText(5000);
      const result = reduceContext({
        argv: ["bat", "README.md"],
        combined_text: largeText,
      }, {
        minReduceInputBytes: 100,
      });
      assert.equal(result.applied, false);
    });

    it("failed command preserves more tail context", () => {
      const lines = Array(200).fill("line of output");
      lines.push("FAIL: test critical failure");
      lines.push("Error: assertion failed at line 42");
      const text = lines.join("\n");

      const result = reduceContext({
        combined_text: text,
        exit_code: 1,
        command: "pnpm test",
        argv: ["pnpm", "test"],
        source_ref: "test://fail",
        source_hash: "sha256:fail",
      });

      assert.equal(result.applied, true);
      assert.ok(result.text.includes("FAIL: test critical failure"));
      assert.ok(result.text.includes("Error: assertion failed"));
      assert.ok(result.facts.is_failure === true);
    });

    it("non-failed command with exit_code 0 is not marked as failure", () => {
      const text = makeLargeText(2000);
      const result = reduceContext({
        combined_text: text,
        exit_code: 0,
      });
      assert.equal(result.facts.is_failure, false);
    });
  });

  describe("built-in rule families", () => {
    it("has 8 built-in rule families", () => {
      const rules = buildBuiltinRules();
      const families = new Set(rules.map((r) => r.family));
      assert.equal(families.size, 8);
      assert.ok(families.has("codex-session"));
      assert.ok(families.has("openclaw-log"));
      assert.ok(families.has("command-output"));
      assert.ok(families.has("test-output"));
      assert.ok(families.has("git-output"));
      assert.ok(families.has("agentmemory-memory"));
      assert.ok(families.has("json-jsonl"));
      assert.ok(families.has("generic"));
    });

    it("codex-session rule matches codex source metadata", () => {
      const rules = buildBuiltinRules();
      const result = matchRule(rules, {
        text: makeLargeText(2000),
        source_metadata: { agent: "codex" },
      });
      assert.ok(result);
      assert.equal(result.rule.family, "codex-session");
    });

    it("openclaw-log rule matches openclaw source metadata", () => {
      const rules = buildBuiltinRules();
      const result = matchRule(rules, {
        text: makeLargeText(2000),
        source_metadata: { agent: "openclaw" },
      });
      assert.ok(result);
      assert.equal(result.rule.family, "openclaw-log");
    });

    it("generic rule is the lowest priority fallback", () => {
      const rules = buildBuiltinRules();
      const generic = rules.find((r) => r.family === "generic");
      assert.ok(generic);
      assert.equal(generic!.priority, 0);
    });
  });

  describe("result metadata", () => {
    it("computes reducer_version", () => {
      const result = reduceContext({ combined_text: makeLargeText(1024) });
      assert.equal(result.reducer_version, REDUCER_VERSION);
    });

    it("computes rule_set_hash", () => {
      const result = reduceContext({ combined_text: makeLargeText(1024) });
      assert.ok(result.rule_set_hash.startsWith("sha256:"));
      assert.ok(result.rule_set_hash.length > 10);
    });

    it("computes reduction_hash", () => {
      const result = reduceContext({ combined_text: makeLargeText(1024) });
      assert.ok(result.reduction_hash.startsWith("sha256:"));
    });

    it("reports matched rule id, family, confidence", () => {
      const result = reduceContext({
        combined_text: makeLargeText(2000),
        command: "pnpm test",
        argv: ["pnpm", "test"],
      });
      assert.ok(result.matched_rule_id);
      assert.ok(result.matched_rule_family);
      assert.ok(typeof result.matched_rule_confidence === "number");
    });

    it("reports byte counts", () => {
      const text = makeLargeText(2000);
      const result = reduceContext({ combined_text: text });
      assert.ok(result.original_bytes > 0);
      assert.ok(result.reduced_bytes > 0);
      assert.ok(result.saved_bytes >= 0);
      assert.ok(result.saved_ratio >= 0 && result.saved_ratio <= 1);
    });

    it("reports facts and counters", () => {
      const result = reduceContext({
        combined_text: makeLargeText(1024),
        command: "pnpm test",
        argv: ["pnpm", "test"],
        exit_code: 1,
        source_ref: "ref://1",
        source_hash: "sha256:abc",
      });
      assert.equal(result.facts.command, "pnpm test");
      assert.deepEqual(result.facts.argv, ["pnpm", "test"]);
      assert.equal(result.facts.exit_code, 1);
      assert.equal(result.facts.is_failure, true);
      assert.equal(result.facts.source_ref, "ref://1");
      assert.equal(result.facts.source_hash, "sha256:abc");
      assert.ok(typeof result.counters.original_lines === "number");
    });

    it("preserves source_ref and source_hash in result", () => {
      const result = reduceContext({
        combined_text: makeLargeText(1024),
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:def456",
      });
      assert.equal(result.source_ref, "raw-vault://codex/session-1");
      assert.equal(result.source_hash, "sha256:def456");
    });
  });

  describe("invalid regex diagnostics", () => {
    it("invalid user regex does not throw, produces warning", () => {
      const badRule: ContextReducerRule = {
        id: "bad-regex-rule",
        family: "test",
        priority: 1,
        confidence: 1,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [
          { type: "drop_lines_matching", pattern: "[invalid-regex" },
        ],
      };

      const result = reduceContext(
        { combined_text: makeLargeText(1024) },
        { userRules: [badRule] },
      );

      assert.ok(result.warnings.some((w) => w.includes("invalid_regex")));
      assert.ok(typeof result.text === "string");
    });

    it("validateRules reports invalid regex and keeps valid rules", () => {
      const badRule: ContextReducerRule = {
        id: "bad-rule",
        family: "test",
        priority: 1,
        confidence: 1,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "drop_lines_matching", pattern: "[broken" }],
      };
      const goodRule: ContextReducerRule = {
        id: "good-rule",
        family: "test",
        priority: 1,
        confidence: 1,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "drop_lines_matching", pattern: "^\\s*$" }],
      };

      const { valid, warnings } = validateRules([badRule, goodRule]);
      assert.equal(valid.length, 1);
      assert.equal(valid[0].id, "good-rule");
      assert.equal(warnings.length, 1);
      assert.ok(warnings[0].includes("bad-rule"));
    });
  });

  describe("rule overlay system", () => {
    it("user rules overlay built-in rules by id", () => {
      const customRule: ContextReducerRule = {
        id: "generic-default",
        family: "custom",
        priority: 20,
        confidence: 0.5,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "dedupe_adjacent_lines" }],
      };

      const result = reduceContext(
        {
          combined_text: makeLargeText(2000),
          source_metadata: { unknown: "value" },
        },
        { userRules: [customRule] },
      );

      const builtinRules = buildBuiltinRules();
      const builtinHash = computeRuleSetHash(builtinRules);
      assert.notEqual(result.rule_set_hash, builtinHash);
      assert.equal(result.matched_rule_id, "generic-default");
      assert.equal(result.matched_rule_family, "custom");
    });

    it("project rules are loaded alongside user rules", () => {
      const projectRule: ContextReducerRule = {
        id: "project-custom",
        family: "project",
        priority: 10,
        confidence: 0.9,
        source_match: { project: "praxisbase" },
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "strip_ansi" }, { type: "head_tail", head_lines: 20, tail_lines: 20 }],
      };

      const result = reduceContext(
        {
          combined_text: makeLargeText(5000),
          source_metadata: { project: "praxisbase" },
        },
        { projectRules: [projectRule] },
      );

      assert.ok(result.matched_rule_id);
      assert.equal(result.matched_rule_family, "project");
    });
  });

  describe("context economy report", () => {
    it("builds report from multiple results", () => {
      const results: ContextReductionResult[] = [
        reduceContext({ combined_text: makeLargeText(2000), argv: ["pnpm", "test"] }),
        reduceContext({ combined_text: makeLargeText(3000), argv: ["git", "log"] }),
        reduceContext({ combined_text: "short" }),
      ];

      const report = buildContextEconomyReport(results, "2026-05-25T00:00:00.000Z");

      assert.equal(report.items_seen, 3);
      assert.ok(report.items_reduced >= 2);
      assert.ok(report.items_passed_through >= 1);
      assert.ok(report.input_bytes > 0);
      assert.ok(report.output_bytes > 0);
      assert.ok(report.saved_bytes > 0);
      assert.ok(Object.keys(report.rule_hits).length > 0);
      assert.ok(Object.keys(report.family_hits).length > 0);
      assert.equal(report.reducer_version, REDUCER_VERSION);
      assert.ok(report.rule_set_hash.startsWith("sha256:"));
    });

    it("report validates against schema", () => {
      const report = buildContextEconomyReport([
        reduceContext({ combined_text: makeLargeText(1024) }),
      ]);
      const parsed = ContextEconomyReportSchema.parse(report);
      assert.equal(parsed.type, "context_economy_report");
      assert.equal(parsed.protocol_version, "0.1");
    });

    it("empty report is valid", () => {
      const report = buildContextEconomyReport([]);
      const parsed = ContextEconomyReportSchema.parse(report);
      assert.equal(parsed.items_seen, 0);
      assert.equal(parsed.items_reduced, 0);
      assert.equal(parsed.saved_bytes, 0);
    });
  });

  describe("end-to-end reduction scenarios", () => {
    it("reduces noisy command output while keeping key information", () => {
      const lines: string[] = [
        "Running build...",
        "\u001b[32mCompiling...\u001b[0m",
        ...Array(200).fill("progress: building module X"),
        "BUILD SUCCESS",
        "3 tests passed",
      ];
      const text = lines.join("\n");

      const result = reduceContext({
        combined_text: text,
        command: "pnpm build",
        argv: ["pnpm", "build"],
        exit_code: 0,
        source_ref: "codex://session-1",
        source_hash: "sha256:build",
      });

      assert.equal(result.applied, true);
      assert.ok(result.reduced_bytes < result.original_bytes);
      assert.ok(result.text.includes("BUILD SUCCESS") || result.text.includes("tests passed"), `expected key info in reduced text, got: ${result.text.slice(-200)}`);
      assert.equal(result.source_ref, "codex://session-1");
      assert.equal(result.source_hash, "sha256:build");
    });

    it("reduces test output preserving failure context", () => {
      const lines: string[] = [
        "Running tests...",
        ...Array(50).fill("  ✓ passing test"),
        "  ✗ FAIL: test_auth_expired",
        "  Error: token is expired",
        "  at Auth.verify (auth.ts:42)",
        "Tests: 51 passed, 1 failed",
      ];
      const text = lines.join("\n");

      const result = reduceContext({
        combined_text: text,
        command: "pnpm test",
        argv: ["pnpm", "test"],
        exit_code: 1,
        source_ref: "test://run-1",
        source_hash: "sha256:test1",
      });

      assert.equal(result.applied, true);
      assert.ok(result.text.includes("FAIL: test_auth_expired"));
      assert.ok(result.text.includes("Error: token is expired"));
      assert.ok(result.facts.is_failure);
    });

    it("reduces git output preserving commit and branch info", () => {
      const lines: string[] = [
        "commit abc123 (HEAD -> main)",
        "Author: dev <dev@test.com>",
        "Date: today",
        "",
        "    fix: auth expired",
        "",
        ...Array(80).fill("M src/file_" + Math.random() + ".ts"),
        "10 files changed, 200 insertions(+), 50 deletions(-)",
      ];
      const text = lines.join("\n");

      const result = reduceContext({
        combined_text: text,
        command: "git log",
        argv: ["git", "log"],
        exit_code: 0,
      });

      assert.equal(result.applied, true);
      assert.ok(result.matched_rule_family === "git-output");
    });

    it("handles ANSI-heavy output", () => {
      const lines = Array(100).fill("\u001b[32m✓\u001b[0m \u001b[1mtest passed\u001b[0m");
      const text = lines.join("\n");

      const result = reduceContext({
        combined_text: text,
        command: "pnpm test",
        argv: ["pnpm", "test"],
      });

      assert.equal(result.applied, true);
      assert.ok(!result.text.includes("\u001b"));
    });
  });

  describe("file inspection detection", () => {
    it("detects cat from argv", () => {
      assert.ok(isFileInspection(["cat", "file.txt"], undefined));
    });

    it("detects sed from command", () => {
      assert.ok(isFileInspection(undefined, "sed -n '1,10p' file"));
    });

    it("detects head from argv", () => {
      assert.ok(isFileInspection(["head", "-20", "file.log"], undefined));
    });

    it("detects tail from argv", () => {
      assert.ok(isFileInspection(["tail", "-f", "log.txt"], undefined));
    });

    it("detects jq from argv", () => {
      assert.ok(isFileInspection(["jq", ".name"], undefined));
    });

    it("detects batcat from argv", () => {
      assert.ok(isFileInspection(["batcat", "file.md"], undefined));
    });

    it("detects yq from argv", () => {
      assert.ok(isFileInspection(["yq", ".key"], undefined));
    });

    it("detects nl from argv", () => {
      assert.ok(isFileInspection(["nl", "file.txt"], undefined));
    });

    it("does not flag non-inspection commands", () => {
      assert.ok(!isFileInspection(["pnpm", "test"], undefined));
      assert.ok(!isFileInspection(undefined, "node build.js"));
    });
  });

  describe("rule set hash", () => {
    it("changes when rules are modified", () => {
      const rules1 = buildBuiltinRules();
      const rules2: ContextReducerRule[] = [...rules1, {
        id: "extra-rule",
        family: "extra",
        priority: 1,
        confidence: 1,
        pass_through_file_inspection: false,
        preserve_failure_tail: false,
        preserve_failure_tail_lines: 30,
        actions: [{ type: "strip_ansi" as const }],
      }];
      assert.notEqual(computeRuleSetHash(rules1), computeRuleSetHash(rules2));
    });

    it("changes when behavior-affecting action parameters change", () => {
      const rules1 = buildBuiltinRules();
      const rules2 = buildBuiltinRules().map((rule) => {
        if (rule.id !== "generic-default") return rule;
        return {
          ...rule,
          actions: [{ type: "drop_lines_matching" as const, pattern: "^DEBUG" }],
        };
      });
      const rules3 = buildBuiltinRules().map((rule) => {
        if (rule.id !== "generic-default") return rule;
        return {
          ...rule,
          actions: [{ type: "drop_lines_matching" as const, pattern: "^TRACE" }],
        };
      });
      assert.notEqual(computeRuleSetHash(rules1), computeRuleSetHash(rules2));
      assert.notEqual(computeRuleSetHash(rules2), computeRuleSetHash(rules3));
    });

    it("is deterministic for same rules", () => {
      const hash1 = computeRuleSetHash(buildBuiltinRules());
      const hash2 = computeRuleSetHash(buildBuiltinRules());
      assert.equal(hash1, hash2);
    });
  });
});
