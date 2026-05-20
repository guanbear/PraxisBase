import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addRemoteSource } from "@praxisbase/core/experience/remote-sources.js";
import { resolveRemoteSource } from "@praxisbase/core/experience/remote-adapters.js";

describe("remote transport adapters", () => {
  it("resolves file remotes to local export paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-file-"));
    const exportPath = join(root, "openclaw-export.json");
    await writeFile(exportPath, JSON.stringify({ items: [{ id: "one", summary: "Safe summary" }] }));
    const config = await addRemoteSource(root, {
      name: "file-prod",
      sourceType: "file",
      agent: "openclaw",
      path: exportPath,
      now: "2026-05-20T00:00:00.000Z",
    });

    const resolved = await resolveRemoteSource(root, config);
    assert.equal(resolved.kind, "exported-json");
    assert.equal(resolved.sources[0], exportPath);
  });

  it("downloads http remotes into ignored remote-import staging", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-http-"));
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ items: [{ id: "http-1", summary: "HTTP export summary" }] }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");

    try {
      const config = await addRemoteSource(root, {
        name: "http-prod",
        sourceType: "http",
        agent: "openclaw",
        url: `http://127.0.0.1:${address.port}/export.json`,
        now: "2026-05-20T00:00:00.000Z",
      });
      const resolved = await resolveRemoteSource(root, config);
      assert.equal(resolved.kind, "exported-json");
      assert.match(resolved.sources[0], /\.praxisbase\/staging\/remote-imports\/http-prod\.json$/);
      const raw = await readFile(join(root, resolved.sources[0]), "utf8");
      assert.ok(raw.includes("HTTP export summary"));
    } finally {
      server.close();
    }
  });

  it("resolves ssh remotes through an injected command runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-ssh-"));
    const config = await addRemoteSource(root, {
      name: "ssh-prod",
      sourceType: "ssh",
      agent: "openclaw",
      host: "user@example.com",
      path: "~/.openclaw/exports/latest.json",
      now: "2026-05-20T00:00:00.000Z",
    });
    const resolved = await resolveRemoteSource(root, config, {
      runCommand: async () => JSON.stringify({ items: [{ id: "ssh-1", summary: "SSH export summary" }] }),
    });
    assert.equal(resolved.kind, "exported-json");
    const raw = await readFile(join(root, resolved.sources[0]), "utf8");
    assert.ok(raw.includes("SSH export summary"));
  });

  it("resolves git remotes through an injected command runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-git-"));
    const config = await addRemoteSource(root, {
      name: "git-prod",
      sourceType: "git",
      agent: "openclaw",
      repo: "git@example.com:org/export.git",
      path: "exports/latest.json",
      now: "2026-05-20T00:00:00.000Z",
    });
    const cachePath = join(root, ".praxisbase/cache/remotes/git-prod");
    await mkdir(join(cachePath, "exports"), { recursive: true });
    await writeFile(join(cachePath, "exports/latest.json"), JSON.stringify({ items: [{ id: "git-1", summary: "Git export summary" }] }));
    const commands: string[] = [];
    const resolved = await resolveRemoteSource(root, config, {
      runCommand: async (command, args) => {
        commands.push([command, ...args].join(" "));
        return "";
      },
    });
    assert.equal(resolved.kind, "exported-json");
    assert.ok(commands.some((cmd) => cmd.includes("git")));
    const raw = await readFile(join(root, resolved.sources[0]), "utf8");
    assert.ok(raw.includes("Git export summary"));
  });

  it("resolves openclaw-api remotes for M12.1 fetch delegation", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-remote-openclaw-api-"));
    const config = await addRemoteSource(root, {
      name: "openclaw-prod",
      sourceType: "openclaw-api",
      agent: "openclaw",
      remote: "prod",
      now: "2026-05-20T00:00:00.000Z",
    });

    const resolved = await resolveRemoteSource(root, config);
    assert.equal(resolved.kind, "openclaw-api");
    assert.equal(resolved.remote, "prod");
  });
});
