import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { captureFinishCommand, captureSubmitCommand } from "@praxisbase/cli/commands/capture.js";
import { installCommand } from "@praxisbase/cli/commands/install.js";
import { memoryCommand } from "@praxisbase/cli/commands/memory.js";
import { contextCommand } from "@praxisbase/cli/commands/context.js";
import { distillCommand } from "@praxisbase/cli/commands/distill.js";
import { watchCommand } from "@praxisbase/cli/commands/watch.js";
import { PROTOCOL_VERSION } from "@praxisbase/core";

const execFileAsync = promisify(execFile);

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

  it("capture submit validates a structured capture file and writes it to the outbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-capture-submit-"));
    const capturePath = join(root, "capture.json");
    await writeFile(capturePath, JSON.stringify({
      id: "capture_submitted",
      protocol_version: PROTOCOL_VERSION,
      type: "capture_record",
      agent: "codex",
      workspace: root,
      scope_hint: "personal",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [
        {
          kind: "transcript",
          source_ref: "raw-vault://codex/submitted-session",
          source_hash: "sha256:submitted",
          redacted_summary: "Submitted capture file.",
        },
      ],
      created_at: new Date().toISOString(),
    }));

    const output = await captureSubmitCommand(root, capturePath, { json: true });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.id, "capture_submitted");
    assert.equal(parsed.path, ".praxisbase/outbox/captures/capture_submitted.json");

    const saved = JSON.parse(await readFile(join(root, parsed.path), "utf8"));
    assert.equal(saved.id, "capture_submitted");
    assert.equal(saved.artifacts[0].source_ref, "raw-vault://codex/submitted-session");
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

  it("memory scan returns Codex candidates without writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-memory-scan-"));
    const sessions = join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.txt"), "Implemented wiki retrieval and pnpm check passed.");

    const output = await memoryCommand(root, "scan", {
      agent: "codex",
      sources: [sessions],
      limit: 5,
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.candidates.length, 1);
    await assert.rejects(() => stat(join(root, ".praxisbase/raw-vault/refs")), { code: "ENOENT" });
  });

  it("memory ingest writes protocol evidence only", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-memory-ingest-"));
    const source = join(root, "session-1.txt");
    await writeFile(source, "Implemented wiki health lint and tests passed.");

    const output = await memoryCommand(root, "ingest", {
      agent: "codex",
      sources: [source],
      write: true,
      limit: 5,
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.imported, 1);
    await assert.doesNotReject(() => stat(join(root, ".praxisbase/raw-vault/refs")));
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("memory fetch stages OpenClaw exported JSON through PraxisBase CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-memory-fetch-"));
    const source = join(root, "openclaw-export.json");
    await writeFile(source, JSON.stringify({
      items: [{
        id: "remote-auth-expired-1",
        summary: "OpenClaw detected Claude auth expired.",
        signature: "openclaw:claude-auth-expired",
        raw_log: "RAW REMOTE LOG SHOULD NOT BE STAGED",
      }],
    }));

    const output = await memoryCommand(root, "fetch", {
      agent: "openclaw",
      sources: [source],
      provider: "exported-json",
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.staged, 1);
    const staged = await readdir(join(root, ".praxisbase/staging/openclaw"));
    assert.equal(staged.length, 1);
    const stagedRaw = await readFile(join(root, ".praxisbase/staging/openclaw", staged[0]), "utf8");
    assert.equal(stagedRaw.includes("RAW REMOTE LOG SHOULD NOT BE STAGED"), false);
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("memory fetch output can be ingested from the OpenClaw staging directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-fetch-ingest-"));
    const source = join(root, "openclaw-export.json");
    await writeFile(source, JSON.stringify({
      items: [{
        id: "remote-lock-1",
        summary: "OpenClaw workspace lock was detected and cleared.",
        signature: "openclaw:workspace-lock-stuck",
        raw_log: "RAW REMOTE LOG SHOULD NOT BE INGESTED",
      }],
    }));

    await memoryCommand(root, "fetch", {
      agent: "openclaw",
      sources: [source],
      provider: "exported-json",
      json: true,
    });
    const ingestOutput = await memoryCommand(root, "ingest", {
      agent: "openclaw",
      sources: [join(root, ".praxisbase/staging/openclaw")],
      write: true,
      json: true,
    });

    const parsed = JSON.parse(ingestOutput);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.imported, 1);
    const refs = await readdir(join(root, ".praxisbase/raw-vault/refs"));
    const refRaw = await readFile(join(root, ".praxisbase/raw-vault/refs", refs[0]), "utf8");
    assert.equal(refRaw.includes("RAW REMOTE LOG SHOULD NOT BE INGESTED"), false);
    assert.equal(refRaw.includes("OpenClaw workspace lock was detected and cleared."), true);
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

  it("memory refresh preserves source refs passed through the CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-memory-"));

    const output = await memoryCommand(root, "refresh", {
      agent: "hermes",
      target: "patch-proposal",
      sourceRefs: ["kb/known-fixes/openclaw-auth-expired.md", "skills/openclaw/auth.md"],
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.plan.agent, "hermes");
    assert.equal(parsed.plan.outputs[0].kind, "patch_proposal");
    assert.deepEqual(parsed.plan.outputs[0].source_refs, [
      "kb/known-fixes/openclaw-auth-expired.md",
      "skills/openclaw/auth.md",
    ]);
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

  it("distill suggests project scope when the capture workspace has a configured marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-distill-project-"));
    await mkdir(join(root, ".git"), { recursive: true });
    await captureFinishCommand(root, {
      agent: "codex",
      result: "success",
      sourceRef: "raw-vault://codex/session-project",
      sourceHash: "sha256:session-project",
      summary: "Fixed a project-specific issue and tests passed.",
      json: true,
    });

    await distillCommand(root, "run", { json: true });

    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposalFiles[0]), "utf8"));
    assert.equal(proposal.scope_hint, "project");
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

  it("watch once emits a capture when a configured local transcript path has content", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-watch-"));
    const home = await mkdtemp(join(tmpdir(), "praxisbase-home-"));
    const sessions = join(home, ".codex/archived_sessions");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "session-1.log"), "Fixed auth and ran tests.\n");
    const originalHome = process.env.HOME;
    process.env.HOME = home;

    try {
      const output = await watchCommand(root, {
        agent: "codex",
        workspace: root,
        once: true,
        json: true,
      });

      const parsed = JSON.parse(output);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.warnings.length, 0);
      assert.equal(parsed.captures.length, 1);
      assert.match(parsed.captures[0].path, /^\.praxisbase\/outbox\/captures\/capture_/);

      const saved = JSON.parse(await readFile(join(root, parsed.captures[0].path), "utf8"));
      assert.equal(saved.agent, "codex");
      assert.equal(saved.triggers[0], "watch_once");
      assert.equal(saved.artifacts[0].source_ref, `file-ref://${join(sessions, "session-1.log")}`);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("CLI emits structured JSON errors when --json is requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-error-"));

    await assert.rejects(
      () => execFileAsync(process.execPath, [join(process.cwd(), "packages/cli/dist/index.js"), "install", "unknown-agent", "--json"], { cwd: root }),
      (error: unknown) => {
        const stderr = (error as { stderr?: string }).stderr ?? "";
        const parsed = JSON.parse(stderr);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.code, "UNKNOWN_ADAPTER_PROFILE");
        assert.ok(parsed.details.supported_agents.includes("codex"));
        return true;
      }
    );
  });
});
