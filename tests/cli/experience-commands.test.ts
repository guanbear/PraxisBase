import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { captureFinishCommand } from "@praxisbase/cli/commands/capture.js";

const execFileAsync = promisify(execFile);

describe("M1 capture CLI", () => {
  it("capture finish writes to outbox and returns JSON with id and path", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-capture-"));
    const { ok, output } = await captureFinishCommand(root, {
      agent: "codex",
      result: "success",
      sourceRef: "raw-vault://codex/session-1",
      sourceHash: "sha256:session1",
      summary: "Fixed a project issue and tests passed.",
      json: true,
    });

    assert.equal(ok, true);
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.match(parsed.id, /^capture_/);
    assert.match(parsed.path, /\.praxisbase\/outbox\/captures\/capture_/);

    const capturePath = join(root, parsed.path);
    const saved = JSON.parse(await readFile(capturePath, "utf8"));
    assert.equal(saved.type, "capture_record");
    assert.equal(saved.agent, "codex");
    assert.equal(saved.result, "success");
  });

  it("capture finish rejects kb/ refs with RAW_ARTIFACT_REJECTED", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-capture-"));
    const { ok, output } = await captureFinishCommand(root, {
      agent: "codex",
      result: "success",
      sourceRef: "kb/raw-transcript.md",
      sourceHash: "sha256:bad",
      summary: "Raw transcript",
      json: true,
    });

    assert.equal(ok, false);
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "RAW_ARTIFACT_REJECTED");

    const captures = await readdir(join(root, ".praxisbase", "outbox", "captures")).catch(() => []);
    assert.equal(captures.length, 0);
  });

  it("capture finish does not write to kb/ or skills/", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-capture-"));
    await captureFinishCommand(root, {
      agent: "codex",
      result: "success",
      sourceRef: "raw-vault://codex/session-1",
      sourceHash: "sha256:session1",
      summary: "No stable knowledge mutation.",
      json: true,
    });

    await assert.rejects(() => stat(join(root, "kb")));
    await assert.rejects(() => stat(join(root, "skills")));
  });
});

describe("M1 capture CLI built binary", () => {
  it("capture finish exits nonzero on RAW_ARTIFACT_REJECTED with structured JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-built-"));
    const cliPath = join(process.cwd(), "packages", "cli", "dist", "index.js");

    let stdout = "";
    let exitCode = 0;
    try {
      const result = await execFileAsync("node", [
        cliPath,
        "capture", "finish",
        "--agent", "codex",
        "--result", "success",
        "--source-ref", "kb/raw-transcript.md",
        "--source-hash", "sha256:bad",
        "--summary", "Raw transcript",
        "--json",
      ], {
        cwd: root,
        env: { ...process.env },
        timeout: 10000,
      });
      stdout = result.stdout;
    } catch (e: unknown) {
      const execErr = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; status?: number };
      stdout = execErr.stdout ?? "";
      exitCode = execErr.status ?? 1;
    }

    assert.ok(exitCode !== 0, "expected nonzero exit code on RAW_ARTIFACT_REJECTED");
    assert.ok(stdout.length > 0, "expected JSON output on stdout");
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "RAW_ARTIFACT_REJECTED");
  });
});
