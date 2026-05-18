import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { buildStaticArtifacts } from "@praxisbase/core/build/build.js";
import { K8sIncidentManifestSchema } from "@praxisbase/core/protocol/schemas.js";

describe("static build", () => {
  it("generates bundles, indexes, manifest, llms.txt, and HTML", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-build-"));
    await initializeWorkspace(root);

    await buildStaticArtifacts(root);

    await assert.doesNotReject(stat(join(root, "dist/repair-bundles/manifest.json")));
    await assert.doesNotReject(stat(join(root, "dist/repair-bundles/openclaw-sandbox.json")));
    await assert.doesNotReject(stat(join(root, "dist/repair-bundles/k8s-incident/manifest.json")));
    await assert.doesNotReject(stat(join(root, "dist/kb-index.json")));
    await assert.doesNotReject(stat(join(root, "dist/search-index.json")));
    await assert.doesNotReject(stat(join(root, "dist/llms.txt")));
    await assert.doesNotReject(stat(join(root, "dist/index.html")));

    const manifest = await readFile(join(root, "dist/repair-bundles/manifest.json"), "utf8");
    assert.ok(manifest.includes("openclaw-sandbox"));
    assert.ok(manifest.includes("k8s-incident"));
    assert.ok(manifest.includes("checksum"));
    assert.ok(manifest.includes("compatible_cli_version"));
  });

  it("k8s-incident manifest has bundle_id and entries array matching schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-manifest-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const raw = await readFile(join(root, "dist/repair-bundles/k8s-incident/manifest.json"), "utf8");
    const parsed = K8sIncidentManifestSchema.parse(JSON.parse(raw));

    assert.equal(parsed.bundle_id, "k8s-incident");
    assert.equal(parsed.protocol_version, "0.1");
    assert.ok(Array.isArray(parsed.entries));
    assert.ok(parsed.compatible_cli.length > 0);
  });
});
