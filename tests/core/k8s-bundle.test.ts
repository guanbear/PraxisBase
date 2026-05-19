import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { buildStaticArtifacts } from "@praxisbase/core/build/build.js";
import { K8sIncidentManifestSchema } from "@praxisbase/core/protocol/schemas.js";

describe("K8s incident build", () => {
  it("creates k8s seed files on init", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-init-"));
    await initializeWorkspace(root);

    await assert.doesNotReject(stat(join(root, "skills/k8s/incident-triage/SKILL.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/k8s-pod-oomkilled.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/k8s-pod-crashloop-imagepull.md")));

    const skillContent = await readFile(join(root, "skills/k8s/incident-triage/SKILL.md"), "utf8");
    assert.ok(skillContent.includes("Do not automatically delete pods in production"));
    assert.ok(skillContent.includes("Do not change resource limits without owner approval"));
  });

  it("generates per-signature k8s incident bundle entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-build-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const manifestRaw = await readFile(join(root, "dist/repair-bundles/k8s-incident/manifest.json"), "utf8");
    const manifest = K8sIncidentManifestSchema.parse(JSON.parse(manifestRaw));

    assert.equal(manifest.bundle_id, "k8s-incident");
    assert.ok(manifest.entries.length >= 2, "expected at least 2 k8s entries");

    const oomEntry = manifest.entries.find((e) => e.signature === "k8s:pod-oomkilled");
    assert.ok(oomEntry, "missing k8s:pod-oomkilled entry");
    assert.ok(oomEntry.checksum.startsWith("sha256:"));
    assert.ok(oomEntry.path.includes("pod-oomkilled"));

    const crashEntry = manifest.entries.find((e) => e.signature === "k8s:pod-crashloop-imagepull");
    assert.ok(crashEntry, "missing k8s:pod-crashloop-imagepull entry");

    await assert.doesNotReject(
      stat(join(root, `dist/repair-bundles/${oomEntry.path}`)),
      "per-entry JSON file must exist"
    );
  });

  it("k8s bundle entries contain only matching signature content", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-content-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const manifestRaw = await readFile(join(root, "dist/repair-bundles/k8s-incident/manifest.json"), "utf8");
    const manifest = K8sIncidentManifestSchema.parse(JSON.parse(manifestRaw));
    const oomEntry = manifest.entries.find((e) => e.signature === "k8s:pod-oomkilled");
    assert.ok(oomEntry);

    const entryRaw = await readFile(join(root, `dist/repair-bundles/${oomEntry.path}`), "utf8");
    const entry = JSON.parse(entryRaw);

    assert.equal(entry.signature, "k8s:pod-oomkilled");
    assert.ok(Array.isArray(entry.known_fixes));
    assert.equal(entry.known_fixes.length, 1);

    const fix = entry.known_fixes[0] as Record<string, unknown>;
    assert.equal(fix.id, "k8s-pod-oomkilled");
    assert.ok(typeof fix.summary === "string" && fix.summary.length > 0);
    assert.ok(Array.isArray(fix.diagnosis_steps));
    assert.ok(Array.isArray(fix.remediation_guidance));
    assert.ok(fix.remediation_guidance.some((s: string) => s.toLowerCase().includes("recommendation") || s.toLowerCase().includes("owner approval")));
    assert.ok(Array.isArray(fix.verification_steps));
    assert.ok(Array.isArray(fix.forbidden_operations));
    assert.ok(Array.isArray(fix.source_refs));
    assert.ok(!fix.id.includes("crashloop"));
  });

  it("k8s bundles include forbidden operations for production safety", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-safety-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const manifestRaw = await readFile(join(root, "dist/repair-bundles/k8s-incident/manifest.json"), "utf8");
    const manifest = K8sIncidentManifestSchema.parse(JSON.parse(manifestRaw));
    const entry = manifest.entries[0];
    assert.ok(entry);

    const entryRaw = await readFile(join(root, `dist/repair-bundles/${entry.path}`), "utf8");
    const bundle = JSON.parse(entryRaw);

    assert.ok(
      bundle.forbidden_operations.some((op: string) => op.includes("delete pods in production")),
      "must forbid automatic pod deletion"
    );
    assert.ok(
      bundle.forbidden_operations.some((op: string) => op.includes("resource limits") && op.includes("owner approval")),
      "must require owner approval for resource changes"
    );
    assert.ok(Array.isArray(bundle.verification_steps));
    assert.ok(Array.isArray(bundle.source_refs));
    assert.equal(bundle.recommendation_only, true);
  });

  it("k8s bundles do not contain executable production write actions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-noexec-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const manifestRaw = await readFile(join(root, "dist/repair-bundles/k8s-incident/manifest.json"), "utf8");
    const manifest = K8sIncidentManifestSchema.parse(JSON.parse(manifestRaw));

    for (const entry of manifest.entries) {
      const entryRaw = await readFile(join(root, `dist/repair-bundles/${entry.path}`), "utf8");
      const bundle = JSON.parse(entryRaw);
      const entryStr = JSON.stringify(bundle).toLowerCase();
      assert.ok(
        !entryStr.includes("kubectl delete") && !entryStr.includes("kubectl apply"),
        `bundle for ${entry.signature} must not contain kubectl write commands`
      );
    }
  });
});
