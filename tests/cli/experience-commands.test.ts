import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { captureFinishCommand } from "@praxisbase/cli/commands/capture.js";
import { installCommand } from "@praxisbase/cli/commands/install.js";
import { memoryCommand } from "@praxisbase/cli/commands/memory.js";
import { contextCommand } from "@praxisbase/cli/commands/context.js";
import { distillCommand } from "@praxisbase/cli/commands/distill.js";
import { watchCommand } from "@praxisbase/cli/commands/watch.js";

describe("experience CLI commands", () => {
  it("capture finish returns JSON and writes capture record", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-capture-"));

    const output = await captureFinishCommand(root, {
      agent: "codex",
      result: "success",
      sourceRef: "raw-vault://codex/session-1",
      sourceHash: "sha256:session1",
      summary: "Fixed a project issue and tests passed.",
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.match(parsed.path, /^\.praxisbase\/outbox\/captures\/capture_/);

    const saved = JSON.parse(await readFile(join(root, parsed.path), "utf8"));
    assert.equal(saved.agent, "codex");
    assert.equal(saved.result, "success");
  });

  it("capture finish rejects raw artifact refs under stable knowledge paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-capture-"));

    await assert.rejects(
      () =>
        captureFinishCommand(root, {
          agent: "codex",
          result: "success",
          sourceRef: "kb/raw-transcript.md",
          sourceHash: "sha256:bad",
          summary: "Raw transcript.",
          json: true,
        }),
      /RAW_ARTIFACT_REJECTED/
    );
  });

  it("install dry-run returns JSON without writing files", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-install-"));

    const output = await installCommand(root, {
      agent: "codex",
      dryRun: true,
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dry_run, true);
    assert.ok(parsed.writes.some((write: { path: string }) => write.path === ".praxisbase/adapters/codex.json"));
    assert.ok(parsed.commands.includes("praxisbase context get --agent codex --stage diagnosis --json"));

    await assert.rejects(() => stat(join(root, ".praxisbase/adapters/codex.json")), { code: "ENOENT" });
  });

  it("install non-dry-run writes adapter config", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-install-"));

    const output = await installCommand(root, {
      agent: "codex",
      dryRun: false,
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dry_run, false);

    const saved = JSON.parse(await readFile(join(root, ".praxisbase/adapters/codex.json"), "utf8"));
    assert.equal(saved.type, "adapter_config");
    assert.equal(saved.agent, "codex");
  });

  it("memory import returns JSON report without writing stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-memory-"));
    const source = join(root, "hermes-memory.json");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(source, JSON.stringify({
      agent: "hermes",
      kind: "skill_summary",
      source_ref: "raw-vault://hermes/skill-auth-repair",
      source_hash: "sha256:hermes1",
      redacted_summary: "Hermes synthesized an auth repair skill.",
    })));

    const output = await memoryCommand(root, "import", {
      agent: "hermes",
      source,
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.changed_stable_knowledge, false);
    assert.equal(parsed.report.imported_sources, 1);
    assert.equal(parsed.report.proposal_candidates.length, 1);
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("memory refresh returns a plan without modifying stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-memory-"));

    const output = await memoryCommand(root, "refresh", {
      agent: "hermes",
      target: "instruction-snippet",
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.plan.writes_native_memory, false);
    assert.ok(parsed.plan.outputs.some((item: { kind: string }) => item.kind === "install_snippet"));
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("context get returns JSON warnings when context is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-context-"));

    const output = await contextCommand(root, "get", {
      agent: "codex",
      stage: "diagnosis",
      query: "new issue",
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.context.stage, "diagnosis");
    assert.ok(parsed.context.warnings.includes("context_unavailable"));
  });

  it("distill run returns JSON report without writing stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-distill-"));
    await captureFinishCommand(root, {
      agent: "codex",
      result: "success",
      sourceRef: "raw-vault://codex/session-1",
      sourceHash: "sha256:session1",
      summary: "Fixed a project issue and tests passed.",
      json: true,
    });

    const output = await distillCommand(root, "run", { json: true });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.changed_stable_knowledge, false);
    assert.equal(parsed.report.proposal_candidates, 1);
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("watch once returns warning when no watchable path exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-watch-"));

    const output = await watchCommand(root, {
      agent: "claude-code",
      workspace: root,
      once: true,
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.warnings.includes("watch_path_unavailable"));
  });
});
