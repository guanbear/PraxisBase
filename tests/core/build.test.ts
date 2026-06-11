import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
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
    await assert.doesNotReject(stat(join(root, "dist/pages")));
    await assert.doesNotReject(stat(join(root, "dist/graph.json")));
    await assert.doesNotReject(stat(join(root, "dist/graph.jsonld")));
    await assert.doesNotReject(stat(join(root, "dist/llms-full.txt")));
    await assert.doesNotReject(stat(join(root, "dist/ai-readme.md")));
    await assert.doesNotReject(stat(join(root, "dist/style.css")));
    await assert.doesNotReject(stat(join(root, "dist/site.js")));
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

  it("honors an OpenClaw-only workspace profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-build-openclaw-"));
    await initializeWorkspace(root, { profile: "openclaw" });
    const result = await buildStaticArtifacts(root);

    assert.deepEqual(result.bundles, ["dist/repair-bundles/openclaw-sandbox.json"]);
    await assert.doesNotReject(stat(join(root, "dist/repair-bundles/openclaw-sandbox.json")));
    await assert.rejects(stat(join(root, "dist/repair-bundles/k8s-incident/manifest.json")));

    const manifest = JSON.parse(await readFile(join(root, "dist/repair-bundles/manifest.json"), "utf8"));
    assert.equal(manifest.profile, "openclaw");
    assert.equal(manifest.bundles.length, 1);
    assert.equal(manifest.bundles[0].id, "openclaw-sandbox");
  });

  it("honors a K8s-only workspace profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-build-k8s-"));
    await initializeWorkspace(root, { profile: "k8s" });
    const result = await buildStaticArtifacts(root);

    assert.deepEqual(result.bundles, ["dist/repair-bundles/k8s-incident/manifest.json"]);
    await assert.doesNotReject(stat(join(root, "dist/repair-bundles/k8s-incident/manifest.json")));
    await assert.rejects(stat(join(root, "dist/repair-bundles/openclaw-sandbox.json")));

    const manifest = JSON.parse(await readFile(join(root, "dist/repair-bundles/manifest.json"), "utf8"));
    assert.equal(manifest.profile, "k8s");
    assert.equal(manifest.bundles.length, 1);
    assert.equal(manifest.bundles[0].id, "k8s-incident");
  });

  it("writes a build run record", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-build-run-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const runDir = join(root, ".praxisbase/runs/build");
    const runFiles = await readdir(runDir);
    assert.ok(runFiles.length >= 1, "expected at least one build run record");

    const run = JSON.parse(
      await readFile(join(runDir, runFiles[0]), "utf8")
    );
    assert.equal(run.command, "build");
    assert.equal(run.protocol_version, "0.1");
    assert.equal(run.status, "completed");
    assert.ok(run.started_at);
    assert.ok(run.finished_at);
    assert.equal(typeof run.counts.bundles, "number");
    assert.equal(typeof run.counts.kb_objects, "number");
    assert.ok(Array.isArray(run.errors));
    assert.ok(run.errors.length === 0);
  });

  it("writes a failed build run record when build fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-build-fail-"));
    await initializeWorkspace(root);

    await writeFile(join(root, "dist/repair-bundles"), "blocker");

    await assert.rejects(buildStaticArtifacts(root));

    const runDir = join(root, ".praxisbase/runs/build");
    const runFiles = await readdir(runDir);
    assert.ok(runFiles.length >= 1, "expected at least one build run record after failure");

    const run = JSON.parse(
      await readFile(join(runDir, runFiles[0]), "utf8")
    );
    assert.equal(run.command, "build");
    assert.equal(run.protocol_version, "0.1");
    assert.equal(run.status, "failed", `expected failed status, got ${run.status}`);
    assert.ok(run.errors.length >= 1, "expected at least one error");
    assert.ok(run.started_at);
    assert.ok(run.finished_at);
  });

});
