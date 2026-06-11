import { mkdtemp, rename, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { buildStaticArtifacts } from "@praxisbase/core/build/build.js";
import { fetchRepairBundle } from "@praxisbase/core/bundles/fetch.js";

describe("K8s incident bundle fetch", () => {
  it("fetches matching k8s incident entry by signature", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-fetch-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const result = await fetchRepairBundle(root, "k8s-incident", "k8s:pod-oomkilled");
    assert.equal(result.warning, undefined);
    assert.ok(result.bundle);

    const bundle = result.bundle as Record<string, unknown>;
    assert.equal(bundle.signature, "k8s:pod-oomkilled");
    assert.ok(Array.isArray(bundle.known_fixes));
    assert.equal((bundle.known_fixes as unknown[]).length, 1);
    const fix = (bundle.known_fixes as Array<Record<string, unknown>>)[0];
    assert.equal(fix.id, "k8s-pod-oomkilled");
    assert.ok(typeof fix.summary === "string" && (fix.summary as string).length > 0);
    assert.ok(Array.isArray(fix.remediation_guidance));
    assert.ok(Array.isArray(bundle.forbidden_operations));
    assert.ok((bundle.forbidden_operations as string[]).some((op) => op.includes("owner approval")));
    assert.equal(bundle.recommendation_only, true);
  });

  it("returns empty bundle when signature not found", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-nosig-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const result = await fetchRepairBundle(root, "k8s-incident", "k8s:nonexistent");
    assert.equal(result.warning, "bundle_unavailable");
    assert.ok(result.bundle);

    const bundle = result.bundle as Record<string, unknown>;
    assert.ok(Array.isArray(bundle.known_fixes));
    assert.equal((bundle.known_fixes as unknown[]).length, 0);
  });

  it("returns empty bundle when manifest is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-nobundle-"));
    await initializeWorkspace(root);

    const result = await fetchRepairBundle(root, "k8s-incident", "k8s:pod-oomkilled");
    assert.equal(result.warning, "bundle_unavailable");
    assert.ok(result.bundle);
  });

  it("falls back to cache on checksum mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-cache-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const good = await fetchRepairBundle(root, "k8s-incident", "k8s:pod-oomkilled");
    assert.equal(good.warning, undefined);

    const manifestPath = join(root, "dist/repair-bundles/k8s-incident/manifest.json");
    const raw = await import("node:fs/promises").then((m) => m.readFile(manifestPath, "utf8"));
    const manifest = JSON.parse(raw);
    const target = manifest.entries.find((e: { signature: string }) => e.signature === "k8s:pod-oomkilled");
    target.checksum = "sha256:invalid";
    await import("node:fs/promises").then((m) => m.writeFile(manifestPath, JSON.stringify(manifest, null, 2)));

    const cached = await fetchRepairBundle(root, "k8s-incident", "k8s:pod-oomkilled");
    assert.equal(cached.warning, "latest_unavailable_using_cache");
    assert.ok(cached.bundle);
  });

  it("keeps openclaw fetch behavior unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-occompat-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const result = await fetchRepairBundle(root, "openclaw", "openclaw:claude-auth-expired");
    assert.equal(result.warning, undefined);
    assert.ok(result.bundle);

    const bundle = result.bundle as Record<string, unknown>;
    assert.equal(bundle.scenario, "openclaw");
  });
});
