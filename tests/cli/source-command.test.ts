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
});
