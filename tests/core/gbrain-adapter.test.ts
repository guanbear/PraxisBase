import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGBrainBackendFromConfig } from "@praxisbase/core/experience/gbrain-adapter.js";
import { GBrainClient as LocalGBrainClient } from "@praxisbase/core/experience/gbrain-client.js";

describe("GBrainClient local CLI adapter", () => {
  it("normalizes doctor --json output", async () => {
    const client = new LocalGBrainClient({
      runCommand: async (command, args) => {
        assert.equal(command, "gbrain");
        assert.deepEqual(args, ["doctor", "--fast", "--json"]);
        return {
          stdout: JSON.stringify({ ok: true, checks: [{ id: "database", status: "pass", message: "ready" }] }),
          stderr: "",
        };
      },
    });

    const result = await client.doctor();

    assert.equal(result.ok, true);
    assert.equal(result.checks[0].id, "gbrain_doctor");
    assert.equal(result.checks[0].ok, true);
    const details = result.checks[0].details as { checks: Array<{ id: string }> };
    assert.equal(details.checks[0].id, "database");
  });

  it("adds version, source availability, and publish readiness checks from doctor JSON", async () => {
    const client = new LocalGBrainClient({
      runCommand: async () => ({
        stdout: JSON.stringify({
          ok: true,
          version: "1.2.3",
          sources: [{ id: "praxisbase" }],
          publish_ready: true,
        }),
        stderr: "",
      }),
    });

    const result = await client.doctor({ sourceId: "praxisbase" });

    assert.equal(result.ok, true);
    assert.ok(result.checks.some((check) => check.id === "gbrain_version" && check.ok && check.message.includes("1.2.3")));
    assert.ok(result.checks.some((check) => check.id === "gbrain_source" && check.ok));
    assert.ok(result.checks.some((check) => check.id === "gbrain_publish_ready" && check.ok));
  });

  it("returns setup guidance when the gbrain binary is missing", async () => {
    const client = new LocalGBrainClient({
      runCommand: async () => {
        const error = new Error("spawn gbrain ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      },
    });

    const result = await client.doctor();

    assert.equal(result.ok, false);
    assert.equal(result.checks[0].ok, false);
    assert.match(result.checks[0].message, /not installed/i);
    assert.match(result.checks[0].hint ?? "", /bun install -g/);
  });

  it("parses bounded query output from gbrain text rows", async () => {
    const client = new LocalGBrainClient({
      runCommand: async (_command, args) => {
        assert.deepEqual(args, ["query", "openclaw auth refresh", "--limit", "2"]);
        return {
          stdout: [
            "[0.9100] openclaw-auth -- Refresh the OpenClaw login and retry memory sync.",
            "[0.7200] codex-proxy -- codex-cliproxyapi keeps GLM credentials in local config.",
          ].join("\n"),
          stderr: "",
        };
      },
    });

    const result = await client.query("openclaw auth refresh", { limit: 2 });

    assert.equal(result.ok, true);
    assert.equal(result.hits.length, 2);
    assert.equal(result.hits[0].slug, "openclaw-auth");
    assert.equal(result.hits[0].score, 0.91);
    assert.match(result.hits[0].chunk_text, /Refresh the OpenClaw login/);
  });

  it("passes explicit source id to query when configured", async () => {
    const client = new LocalGBrainClient({
      runCommand: async (_command, args) => {
        assert.deepEqual(args, ["query", "openclaw auth refresh", "--limit", "2", "--source", "praxisbase"]);
        return {
          stdout: "[0.9100] openclaw-auth -- Refresh the OpenClaw login and retry memory sync.",
          stderr: "",
        };
      },
    });

    const result = await client.query("openclaw auth refresh", { limit: 2, sourceId: "praxisbase" });

    assert.equal(result.ok, true);
  });

  it("passes explicit source id to capture when publishing", async () => {
    const client = new LocalGBrainClient({
      runCommand: async (_command, args) => {
        assert.deepEqual(args, [
          "capture",
          "# OpenClaw auth refresh",
          "--slug",
          "praxisbase/wiki/openclaw-auth-refresh",
          "--json",
          "--type",
          "procedure",
          "--source",
          "praxisbase",
        ]);
        return {
          stdout: JSON.stringify({ slug: "praxisbase/wiki/openclaw-auth-refresh" }),
          stderr: "",
        };
      },
    });

    const result = await client.capture("# OpenClaw auth refresh", {
      slug: "praxisbase/wiki/openclaw-auth-refresh",
      type: "procedure",
      sourceId: "praxisbase",
    });

    assert.equal(result.ok, true);
  });

  it("reports invalid JSON query output without throwing when JSON mode is requested", async () => {
    const client = new LocalGBrainClient({
      preferJson: true,
      runCommand: async () => ({ stdout: "{not json", stderr: "" }),
    });

    const result = await client.query("openclaw auth refresh", { limit: 1 });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /invalid_json/i);
  });

  it("creates a local backend from persisted config values", async () => {
    const backend = createGBrainBackendFromConfig({
      mode: "local",
      executable: "/opt/gbrain",
      source_id: "praxisbase",
      timeout_ms: 7000,
      publish_mode: "capture",
    }, {
      runCommand: async (command, args, options) => {
        assert.equal(command, "/opt/gbrain");
        assert.equal(options?.timeoutMs, 7000);
        assert.deepEqual(args, ["query", "openclaw auth", "--limit", "2", "--source", "praxisbase"]);
        return { stdout: "[0.9100] openclaw-auth -- Refresh OpenClaw auth.", stderr: "" };
      },
    });

    const result = await backend.retrieve({ query: "openclaw auth", stage: "repair", limit: 2 });

    assert.equal(result.backend, "gbrain");
    assert.equal(result.candidates.length, 1);
  });

  it("prefers persisted cli_path when local config has one", async () => {
    const backend = createGBrainBackendFromConfig({
      mode: "local",
      cli_path: "/custom/bin/gbrain",
      executable: "gbrain",
      source_id: "praxisbase",
      timeout_ms: 7000,
      publish_mode: "capture",
    }, {
      runCommand: async (command) => {
        assert.equal(command, "/custom/bin/gbrain");
        return { stdout: "[0.9100] openclaw-auth -- Refresh OpenClaw auth.", stderr: "" };
      },
    });

    const result = await backend.retrieve({ query: "openclaw auth", stage: "repair", limit: 2 });

    assert.equal(result.backend, "gbrain");
    assert.equal(result.candidates.length, 1);
  });
});
