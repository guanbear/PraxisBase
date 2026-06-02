import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sourceCommand } from "@praxisbase/cli/commands/source.js";

describe("source CLI command", () => {
  it("adds and lists an OpenClaw Feishu-channel source", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-"));
    const addOutput = await sourceCommand(root, "add", {
      name: "openclaw-bot",
      agent: "openclaw",
      type: "openclaw-api",
      channel: "feishu",
      remote: "bot-prod",
      scope: "team",
      json: true,
    });

    const added = JSON.parse(addOutput);
    assert.equal(added.ok, true);
    assert.equal(added.source.agent, "openclaw");
    assert.equal(added.source.channel, "feishu");
    assert.equal(added.source.parser, "openclaw-export");

    const listOutput = await sourceCommand(root, "list", { json: true });
    const listed = JSON.parse(listOutput);
    assert.equal(listed.ok, true);
    assert.equal(listed.sources.length, 1);
    assert.equal(listed.sources[0].name, "openclaw-bot");
  });

  it("rejects credentials in source config fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-secret-"));
    const output = await sourceCommand(root, "add", {
      name: "bad",
      agent: "openclaw",
      type: "http",
      channel: "unknown",
      url: "https://token:secret@example.com/export.json",
      scope: "team",
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "SOURCE_CONFIG_CONTAINS_CREDENTIAL");
  });

  it("removes a source", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-remove-"));
    await sourceCommand(root, "add", {
      name: "local-codex",
      agent: "codex",
      type: "local",
      path: "~/.codex/archived_sessions",
      scope: "personal",
      json: true,
    });

    const removeOutput = await sourceCommand(root, "remove", { name: "local-codex", json: true });
    assert.equal(JSON.parse(removeOutput).ok, true);

    const listOutput = await sourceCommand(root, "list", { json: true });
    assert.equal(JSON.parse(listOutput).sources.length, 0);
  });

  it("adds an AgentMemory source with bearer token env config", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-agentmemory-"));
    const addOutput = await sourceCommand(root, "add", {
      name: "test-agentmemory",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:9090",
      bearerTokenEnv: "MY_AGENTMEMORY_TOKEN",
      json: true,
    });

    const added = JSON.parse(addOutput);
    assert.equal(added.ok, true);
    assert.equal(added.source.agent, "agentmemory");
    assert.equal(added.source.source_type, "agentmemory");
    assert.equal(added.source.bearer_token_env, "MY_AGENTMEMORY_TOKEN");

    const listOutput = await sourceCommand(root, "list", { json: true });
    const listed = JSON.parse(listOutput);
    assert.equal(listed.sources[0].name, "test-agentmemory");
  });

  it("adds a trusted personal remote OpenClaw source", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-trusted-remote-"));
    const addOutput = await sourceCommand(root, "add", {
      name: "remote-openclaw",
      agent: "openclaw",
      type: "ssh",
      channel: "unknown",
      host: "root@example.com",
      path: "/root/.openclaw/praxisbase/latest.json",
      scope: "personal",
      privacyTrust: "trusted_personal_remote",
      json: true,
    });

    const added = JSON.parse(addOutput);
    assert.equal(added.ok, true);
    assert.equal(added.source.privacy_trust, "trusted_personal_remote");
  });

  it("source doctor returns a healthy check for AgentMemory", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-agentmemory-doctor-"));
    await sourceCommand(root, "add", {
      name: "test-am-doctor",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:9090",
      json: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ status: "ok" }))) as typeof fetch;
    try {
      const doctorOutput = await sourceCommand(root, "doctor", { name: "test-am-doctor", json: true });
      const doctor = JSON.parse(doctorOutput);
      assert.equal(doctor.ok, true);
      assert.equal(doctor.checks[0].id, "agentmemory_health");
      assert.equal(doctor.checks[0].ok, true);
      assert.equal(doctor.checks[0].severity, "info");
      assert.match(doctor.checks[0].message, /healthy/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("source doctor returns an unhealthy warning for AgentMemory", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-agentmemory-down-"));
    await sourceCommand(root, "add", {
      name: "test-am-doctor2",
      agent: "agentmemory",
      type: "agentmemory",
      scope: "personal",
      url: "http://localhost:9090",
      json: true,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("error", { status: 500, statusText: "Internal Server Error" })) as typeof fetch;
    try {
      const doctorOutput = await sourceCommand(root, "doctor", { name: "test-am-doctor2", json: true });
      const doctor = JSON.parse(doctorOutput);
      assert.equal(doctor.ok, true);
      assert.equal(doctor.checks[0].id, "agentmemory_health");
      assert.equal(doctor.checks[0].ok, false);
      assert.equal(doctor.checks[0].severity, "warning");
      assert.match(doctor.checks[0].message, /unhealthy/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("adds an OpenCode source with correct parser inference", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-opencode-"));
    const addOutput = await sourceCommand(root, "add", {
      name: "local-opencode",
      agent: "opencode",
      type: "local",
      path: "~/.local/share/opencode/log",
      scope: "personal",
      json: true,
    });

    const added = JSON.parse(addOutput);
    assert.equal(added.ok, true);
    assert.equal(added.source.agent, "opencode");
    assert.equal(added.source.parser, "opencode-session");
    assert.equal(added.source.source_type, "local");
    assert.equal(added.source.scope_default, "personal");
  });

  it("adds a Claude Code source with correct parser inference", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-claude-"));
    const addOutput = await sourceCommand(root, "add", {
      name: "local-claude-code",
      agent: "claude-code",
      type: "local",
      path: "~/.claude/transcripts",
      scope: "personal",
      json: true,
    });

    const added = JSON.parse(addOutput);
    assert.equal(added.ok, true);
    assert.equal(added.source.agent, "claude-code");
    assert.equal(added.source.parser, "claude-code-session");
    assert.equal(added.source.source_type, "local");
  });

  it("accepts explicit parser override for opencode", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-source-opencode-parser-"));
    const addOutput = await sourceCommand(root, "add", {
      name: "opencode-custom",
      agent: "opencode",
      type: "local",
      parser: "opencode-session",
      path: "/tmp/opencode-sessions",
      scope: "personal",
      json: true,
    });

    const added = JSON.parse(addOutput);
    assert.equal(added.ok, true);
    assert.equal(added.source.parser, "opencode-session");
  });
});
