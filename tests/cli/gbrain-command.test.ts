import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gbrainCommand } from "@praxisbase/cli/commands/gbrain.js";

describe("gbrain doctor command", () => {
  it("initializes persisted local GBrain config and uses it for doctor", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-gbrain-init-"));

    const initOutput = await gbrainCommand(root, "init", {
      json: true,
      executable: "/opt/bin/gbrain",
      source: "team-praxisbase",
      timeoutMs: 20_000,
    });
    const initialized = JSON.parse(initOutput);
    assert.equal(initialized.ok, true);
    assert.equal(initialized.config.cli_path, "/opt/bin/gbrain");
    assert.equal(initialized.config.source_id, "team-praxisbase");

    const calls: Array<{ command: string; args: string[] }> = [];
    const doctorOutput = await gbrainCommand(root, "doctor", {
      json: true,
      runCommand: async (command, args) => {
        calls.push({ command, args });
        return {
          stdout: JSON.stringify({
            ok: true,
            version: "0.1.0",
            sources: [{ id: "team-praxisbase" }],
            publish_ready: true,
          }),
          stderr: "",
        };
      },
    });
    const doctor = JSON.parse(doctorOutput);
    assert.equal(doctor.ok, true);
    assert.equal(doctor.config.executable, "/opt/bin/gbrain");
    assert.equal(calls[0].command, "/opt/bin/gbrain");
    assert.ok(doctor.checks.some((check: { id: string; ok: boolean }) => check.id === "gbrain_source" && check.ok));
  });

  it("initializes remote GBrain config and reports source diagnostics without secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-gbrain-remote-init-"));

    await gbrainCommand(root, "init", {
      json: true,
      remote: true,
      issuerUrl: "https://auth.example.com",
      mcpUrl: "https://gbrain.example.com/mcp",
      oauthClientId: "pb-client",
      secretEnv: "GBRAIN_SECRET",
      source: "team-praxisbase",
      federatedRead: ["other-source"],
    });
    const output = await gbrainCommand(root, "doctor", { json: true });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.config.secret_env, "GBRAIN_SECRET");
    assert.doesNotMatch(output, /pb-client/);
    assert.ok(parsed.checks.some((check: { id: string; ok: boolean }) => check.id === "gbrain_source_scope" && !check.ok));
  });

  it("returns machine-readable local CLI diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-gbrain-"));

    const output = await gbrainCommand(root, "doctor", {
      json: true,
      runCommand: async () => ({
        stdout: JSON.stringify({ ok: true, checks: [{ id: "database", status: "pass" }] }),
        stderr: "",
      }),
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.backend, "gbrain");
    assert.equal(parsed.checks[0].id, "gbrain_doctor");
    assert.equal(parsed.checks[0].ok, true);
  });

  it("returns JSON guidance when gbrain is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-gbrain-missing-"));

    const output = await gbrainCommand(root, "doctor", {
      json: true,
      runCommand: async () => {
        const error = new Error("spawn gbrain ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      },
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.backend, "gbrain");
    assert.match(parsed.checks[0].message, /not installed/i);
  });

  it("imports selected GBrain search hits as PraxisBase evidence only when written", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-gbrain-import-"));

    const dryRunOutput = await gbrainCommand(root, "import", {
      json: true,
      query: "openclaw auth",
      source: "praxisbase",
      limit: 1,
      runCommand: async (_command, args) => {
        assert.deepEqual(args, ["query", "openclaw auth", "--limit", "1", "--source-id", "praxisbase", "--json"]);
        return {
          stdout: JSON.stringify({
            results: [{
              slug: "openclaw-auth-refresh",
              chunk_text: "Refresh OpenClaw auth and retry memory sync.",
              score: 0.91,
            }],
          }),
          stderr: "",
        };
      },
    });
    const dryRun = JSON.parse(dryRunOutput);
    assert.equal(dryRun.imported, 0);
    assert.equal(dryRun.candidates, 1);

    const writeOutput = await gbrainCommand(root, "import", {
      json: true,
      write: true,
      query: "openclaw auth",
      source: "praxisbase",
      limit: 1,
      runCommand: async () => ({
        stdout: JSON.stringify({
          results: [{
            slug: "openclaw-auth-refresh",
            chunk_text: "Refresh OpenClaw auth and retry memory sync.",
            score: 0.91,
          }],
        }),
        stderr: "",
      }),
    });

    const written = JSON.parse(writeOutput);
    assert.equal(written.imported, 1);
    const files = await readdir(join(root, ".praxisbase/staging/experience-envelopes"));
    assert.equal(files.length, 1);
    const envelope = JSON.parse(await readFile(join(root, ".praxisbase/staging/experience-envelopes", files[0]), "utf8"));
    assert.equal(envelope.source_ref, "gbrain://praxisbase/openclaw-auth-refresh");
    assert.equal(envelope.privacy.verdict, "allow");
    assert.match(envelope.redacted_summary, /Refresh OpenClaw auth/);
  });

  it("imports from remote GBrain MCP when remote config is persisted", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-gbrain-remote-import-"));
    const previousSecret = process.env.PRAXISBASE_TEST_GBRAIN_IMPORT_SECRET;
    process.env.PRAXISBASE_TEST_GBRAIN_IMPORT_SECRET = "test-bearer-token-value";
    try {
      await gbrainCommand(root, "init", {
        json: true,
        remote: true,
        issuerUrl: "https://auth.example.com",
        mcpUrl: "https://gbrain.example.com/mcp",
        oauthClientId: "pb-client",
        secretEnv: "PRAXISBASE_TEST_GBRAIN_IMPORT_SECRET",
        source: "remote-praxisbase",
      });

      const output = await gbrainCommand(root, "import", {
        json: true,
        write: true,
        query: "openclaw auth",
        limit: 1,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init?.body as string);
          assert.equal(body.method, "search");
          assert.equal(body.params.source_id, "remote-praxisbase");
          return {
            ok: true,
            status: 200,
            json: async () => ({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                results: [{
                  slug: "remote-openclaw-auth",
                  text: "Remote OpenClaw should refresh auth before sync.",
                  score: 0.9,
                }],
              },
            }),
            text: async () => "",
          };
        },
      });

      const parsed = JSON.parse(output);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.imported, 1);
      assert.equal(parsed.source_id, "remote-praxisbase");

      const files = await readdir(join(root, ".praxisbase/staging/experience-envelopes"));
      assert.equal(files.length, 1);
      const envelope = JSON.parse(await readFile(join(root, ".praxisbase/staging/experience-envelopes", files[0]), "utf8"));
      assert.equal(envelope.source_ref, "gbrain://remote-praxisbase/remote-openclaw-auth");
      assert.match(envelope.redacted_summary, /Remote OpenClaw/);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.PRAXISBASE_TEST_GBRAIN_IMPORT_SECRET;
      } else {
        process.env.PRAXISBASE_TEST_GBRAIN_IMPORT_SECRET = previousSecret;
      }
    }
  });

  it("writes a durable export report for standalone GBrain publish", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-gbrain-export-report-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-dispatch-routing-failures.md"), [
      "---",
      "title: OpenClaw dispatch routing failures",
      "type: known_fix",
      "scope: personal",
      "---",
      "# OpenClaw dispatch routing failures",
      "",
      "Verify runner execution before reporting delegation success.",
    ].join("\n"), "utf8");

    const output = await gbrainCommand(root, "export", {
      json: true,
      write: true,
      source: "praxisbase",
      runCommand: async (_command, args) => {
        assert.equal(args[0], "capture");
        assert.ok(args.includes("--source"));
        assert.ok(args.includes("praxisbase"));
        return {
          stdout: JSON.stringify({ ok: true, slug: args[args.indexOf("--slug") + 1] }),
          stderr: "",
        };
      },
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.exported, 2);
    assert.match(parsed.report_ref, /^\.praxisbase\/reports\/gbrain-export\/gbrain-export_/);

    const report = JSON.parse(await readFile(join(root, parsed.report_ref), "utf8"));
    assert.equal(report.type, "gbrain_export_report");
    assert.equal(report.ok, true);
    assert.equal(report.exported, 2);
    assert.equal(report.source_id, "praxisbase");
  });
});
