import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addRemoteSource,
  listRemoteSources,
  readRemoteSource,
  removeRemoteSource,
} from "@praxisbase/core/experience/remote-sources.js";

describe("remote source registry", () => {
  it("adds, lists, reads, and removes remote source configs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-registry-"));
    const created = await addRemoteSource(root, {
      name: "openclaw-prod",
      sourceType: "git",
      agent: "openclaw",
      repo: "git@example.com:org/openclaw-export-private.git",
      path: "exports/prod/latest.json",
      now: "2026-05-20T00:00:00.000Z",
    });

    assert.equal(created.name, "openclaw-prod");
    assert.equal(created.source_type, "git");

    const listed = await listRemoteSources(root);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "openclaw-prod");

    const read = await readRemoteSource(root, "openclaw-prod");
    assert.equal(read.repo, "git@example.com:org/openclaw-export-private.git");

    await removeRemoteSource(root, "openclaw-prod");
    assert.deepEqual(await listRemoteSources(root), []);
    await assert.rejects(() => stat(join(root, ".praxisbase/remotes/remote_openclaw-prod.json")), { code: "ENOENT" });
  });

  it("rejects credentials in persisted remote config", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-secret-"));
    await assert.rejects(
      () => addRemoteSource(root, {
        name: "bad-http",
        sourceType: "http",
        agent: "openclaw",
        url: "https://token:secret@example.com/export.json",
        now: "2026-05-20T00:00:00.000Z",
      }),
      /REMOTE_CONFIG_SECRET_REJECTED/
    );
    await assert.rejects(() => readdir(join(root, ".praxisbase/remotes")), { code: "ENOENT" });
  });

  it("rejects authorization and bearer-looking config values", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-auth-secret-"));
    await assert.rejects(
      () => addRemoteSource(root, {
        name: "bad-auth",
        sourceType: "ssh",
        agent: "openclaw",
        host: "Authorization: Bearer abc123",
        path: "~/.openclaw/exports/latest.json",
      }),
      /REMOTE_CONFIG_SECRET_REJECTED/
    );
  });
});
