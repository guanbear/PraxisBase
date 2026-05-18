import { mkdtemp, rename, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { buildStaticArtifacts } from "@praxisbase/core/build/build.js";
import { fetchRepairBundle } from "@praxisbase/core/bundles/fetch.js";

describe("bundle fetch", () => {
  it("reads latest bundle and writes last-known-good cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-bundle-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const result = await fetchRepairBundle(root, "openclaw", "openclaw:claude-auth-expired");
    assert.equal(result.warning, undefined);
    assert.ok(result.bundle);
    await assert.doesNotReject(stat(join(root, ".praxisbase/cache/last-known-good/openclaw-sandbox.json")));
  });

  it("falls back to last-known-good cache when latest bundle is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-bundle-cache-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);
    await fetchRepairBundle(root, "openclaw", "openclaw:claude-auth-expired");

    await rename(
      join(root, "dist/repair-bundles/openclaw-sandbox.json"),
      join(root, "dist/repair-bundles/openclaw-sandbox.missing")
    );

    const result = await fetchRepairBundle(root, "openclaw", "openclaw:claude-auth-expired");
    assert.equal(result.warning, "latest_unavailable_using_cache");
    assert.ok(result.bundle);
  });
});
