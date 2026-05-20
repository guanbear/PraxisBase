import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAdapterProfile } from "../../packages/core/src/experience/profiles.js";
import { planInstall } from "../../packages/core/src/experience/install.js";

describe("getAdapterProfile", () => {
  const BUILT_IN_AGENTS = ["codex", "claude-code", "opencode", "openclaw", "hermes", "openhuman", "generic"] as const;

  for (const agent of BUILT_IN_AGENTS) {
    it(`returns a valid profile for built-in agent: ${agent}`, () => {
      const profile = getAdapterProfile(agent);
      assert.equal(profile.agent, agent);
      assert.ok(Array.isArray(profile.instruction_files), "instruction_files must be an array");
      assert.ok(Array.isArray(profile.workspace_markers), "workspace_markers must be an array");
      assert.ok(profile.capture, "must have capture config");
      assert.ok(profile.capture.default_triggers.length > 0, "capture.default_triggers must be non-empty");
      assert.ok(profile.context, "must have context config");
      assert.ok(profile.context.default_stages.length > 0, "context.default_stages must be non-empty");
      assert.ok(profile.privacy, "must have privacy config");
      assert.ok(profile.privacy.redaction_profile, "privacy.redaction_profile must be set");
    });
  }

  it("throws for unknown agent", () => {
    assert.throws(
      () => getAdapterProfile("unknown-agent" as any),
      /UNKNOWN_ADAPTER_PROFILE|not found|unsupported/i
    );
  });

  it("each profile has at least transcript_paths or raw_artifact_paths", () => {
    for (const agent of BUILT_IN_AGENTS) {
      const profile = getAdapterProfile(agent);
      const hasTranscripts = profile.transcript_paths && profile.transcript_paths.length > 0;
      const hasRawArtifacts = profile.raw_artifact_paths && profile.raw_artifact_paths.length > 0;
      assert.ok(
        hasTranscripts || hasRawArtifacts,
        `${agent} must have transcript_paths or raw_artifact_paths`
      );
    }
  });

  it("returns the documented codex install profile", () => {
    const profile = getAdapterProfile("codex");

    assert.ok(profile.instruction_files.includes("AGENTS.md"));
    assert.ok(profile.workspace_markers.includes("AGENTS.md"));
    assert.ok(profile.workspace_markers.includes(".git"));
    assert.ok(profile.transcript_paths.includes("~/.codex/archived_sessions"));
    assert.equal(profile.privacy.redaction_profile, "developer-default");
  });
});

describe("planInstall", () => {
  it("dry-run returns planned writes and commands without filesystem mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-install-"));

    const result = await planInstall(root, "codex", { dryRun: true });

    assert.ok(result, "planInstall should return a result");
    assert.equal(result.dry_run, true);
    assert.ok(Array.isArray(result.writes), "result.writes must be an array");
    assert.ok(result.writes.length > 0, "dry-run should plan at least one write");

    const adapterWrite = result.writes.find((w) => w.path.includes("adapters"));
    assert.ok(adapterWrite, "should plan adapter JSON write");

    for (const w of result.writes) {
      await assert.rejects(
        () => stat(join(root, w.path)),
        { code: "ENOENT" },
        `dry-run must not create file: ${w.path}`
      );
    }
  });

  it("dry-run includes commands to display", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-install-"));

    const result = await planInstall(root, "codex", { dryRun: true });

    assert.ok(Array.isArray(result.commands), "result.commands must be an array");
    assert.ok(
      result.commands.includes("praxisbase context get --agent codex --stage diagnosis --json")
    );
    assert.ok(
      result.commands.includes("praxisbase capture finish --agent codex --result success --json")
    );
  });

  it("non-dry-run writes .praxisbase/adapters/<agent>.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-install-"));

    await planInstall(root, "codex", { dryRun: false });

    const adapterPath = ".praxisbase/adapters/codex.json";
    const content = JSON.parse(await readFile(join(root, adapterPath), "utf8"));
    assert.equal(content.agent, "codex");
    assert.equal(content.type, "adapter_config");
    assert.ok(content.protocol_version, "should have protocol_version");
  });

  it("non-dry-run writes instruction snippets inside markers", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-install-"));

    const profile = getAdapterProfile("codex");

    if (profile.instruction_files.length > 0) {
      const result = await planInstall(root, "codex", { dryRun: false });

      assert.ok(result.writes.length > 0, "should have planned writes");

      const snippetWrites = result.writes.filter((w) =>
        profile.instruction_files.some((f) => w.path === f || w.path.endsWith(f))
      );

      if (snippetWrites.length > 0) {
        for (const sw of snippetWrites) {
          const writtenContent = await readFile(join(root, sw.path), "utf8");
          assert.ok(
            writtenContent.includes("<!-- PRAXISBASE:BEGIN -->"),
            `instruction snippet must have PRAXISBASE:BEGIN marker in ${sw.path}`
          );
          assert.ok(
            writtenContent.includes("<!-- PRAXISBASE:END -->"),
            `instruction snippet must have PRAXISBASE:END marker in ${sw.path}`
          );
        }
      }
    }
  });

  it("preserves existing content outside markers", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-install-"));

    const profile = getAdapterProfile("codex");
    if (profile.instruction_files.length === 0) return;

    const instructionFile = profile.instruction_files[0];
    const existingContent = `# My existing instructions\nSome important content\n`;

    await mkdir(join(root, dirname(instructionFile)), { recursive: true });
    await writeFile(join(root, instructionFile), existingContent, "utf8");

    await planInstall(root, "codex", { dryRun: false });

    const updatedContent = await readFile(join(root, instructionFile), "utf8");

    const beginIdx = updatedContent.indexOf("<!-- PRAXISBASE:BEGIN -->");
    assert.ok(beginIdx > 0, "markers should appear after existing content");

    const beforeMarker = updatedContent.slice(0, beginIdx);
    assert.ok(
      beforeMarker.includes("# My existing instructions"),
      "content before markers must be preserved"
    );
    assert.ok(
      beforeMarker.includes("Some important content"),
      "content before markers must be preserved"
    );
  });

  it("is idempotent - running twice produces same output", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-install-"));

    await planInstall(root, "codex", { dryRun: false });
    const firstAdapter = await readFile(join(root, ".praxisbase/adapters/codex.json"), "utf8");

    await planInstall(root, "codex", { dryRun: false });
    const secondAdapter = await readFile(join(root, ".praxisbase/adapters/codex.json"), "utf8");

    const firstParsed = JSON.parse(firstAdapter);
    const secondParsed = JSON.parse(secondAdapter);
    assert.equal(firstParsed.agent, secondParsed.agent);
    assert.deepEqual(firstParsed, secondParsed);
  });

  it("replaces existing marker content on re-run without duplicating markers", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-install-"));

    const profile = getAdapterProfile("codex");
    if (profile.instruction_files.length === 0) return;

    const instructionFile = profile.instruction_files[0];
    const existingContent = `# Header\n<!-- PRAXISBASE:BEGIN -->old snippet<!-- PRAXISBASE:END -->\nFooter\n`;

    await mkdir(join(root, dirname(instructionFile)), { recursive: true });
    await writeFile(join(root, instructionFile), existingContent, "utf8");

    await planInstall(root, "codex", { dryRun: false });

    const updated = await readFile(join(root, instructionFile), "utf8");

    assert.ok(updated.includes("# Header"), "header preserved");
    assert.ok(updated.includes("Footer"), "footer preserved");

    const beginCount = (updated.match(/<!-- PRAXISBASE:BEGIN -->/g) || []).length;
    const endCount = (updated.match(/<!-- PRAXISBASE:END -->/g) || []).length;
    assert.equal(beginCount, 1, "should have exactly one PRAXISBASE:BEGIN");
    assert.equal(endCount, 1, "should have exactly one PRAXISBASE:END");

    assert.ok(!updated.includes("old snippet"), "old marker content should be replaced");
  });

  it("throws for unknown agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-install-"));

    await assert.rejects(
      () => planInstall(root, "unknown-agent" as any, { dryRun: true }),
      /UNKNOWN_ADAPTER_PROFILE|not found|unsupported/i
    );
  });
});
