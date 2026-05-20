import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { remoteCommand } from "@praxisbase/cli/commands/remote.js";

describe("remote CLI command", () => {
  it("adds and lists git remote configs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-remote-"));
    const addOutput = await remoteCommand(root, "add", {
      name: "openclaw-prod",
      type: "git",
      repo: "git@example.com:org/export.git",
      path: "exports/latest.json",
      json: true,
    });
    assert.equal(JSON.parse(addOutput).ok, true);

    const listOutput = await remoteCommand(root, "list", { json: true });
    const parsed = JSON.parse(listOutput);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.remotes.length, 1);
    assert.equal(parsed.remotes[0].name, "openclaw-prod");
  });
});
