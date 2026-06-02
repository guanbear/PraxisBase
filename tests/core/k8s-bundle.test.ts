import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { buildStaticArtifacts } from "@praxisbase/core/build/build.js";
import { K8sIncidentManifestSchema } from "@praxisbase/core/protocol/schemas.js";
import { detectK8sProblemSignature } from "@praxisbase/core/repair/signature.js";

describe("K8s incident build", () => {
  it("creates k8s seed files on init", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-init-"));
    await initializeWorkspace(root);

    await assert.doesNotReject(stat(join(root, "skills/k8s/incident-triage/SKILL.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/k8s-pod-oomkilled.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/k8s-pod-crashloop-imagepull.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/k8s-ingress-5xx-upstream-timeout.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/k8s-pvc-pending.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/k8s-node-notready.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/k8s-dns-resolution-failure.md")));

    const skillContent = await readFile(join(root, "skills/k8s/incident-triage/SKILL.md"), "utf8");
    assert.ok(skillContent.includes("Do not automatically delete pods in production"));
    assert.ok(skillContent.includes("Do not change resource limits without owner approval"));
  });

  it("detects common K8s incident signatures from events and alert text", () => {
    assert.equal(
      detectK8sProblemSignature("Last State: Terminated Reason: OOMKilled exit code 137"),
      "k8s:pod-oomkilled"
    );
    assert.equal(
      detectK8sProblemSignature("Warning Failed Error: ImagePullBackOff for container app"),
      "k8s:pod-crashloop-imagepull"
    );
    assert.equal(
      detectK8sProblemSignature("nginx ingress reports 504 upstream timed out while reading response header"),
      "k8s:ingress-5xx-upstream-timeout"
    );
    assert.equal(
      detectK8sProblemSignature("PersistentVolumeClaim is Pending waiting for a volume to be created"),
      "k8s:pvc-pending"
    );
    assert.equal(
      detectK8sProblemSignature("NodeReady status is False and node NotReady after kubelet stopped posting status"),
      "k8s:node-notready"
    );
    assert.equal(
      detectK8sProblemSignature("CoreDNS returns NXDOMAIN and pods cannot resolve service DNS names"),
      "k8s:dns-resolution-failure"
    );
  });

  it("generates per-signature k8s incident bundle entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-build-"));
    await initializeWorkspace(root);
    await buildStaticArtifacts(root);

    const manifestRaw = await readFile(join(root, "dist/repair-bundles/k8s-incident/manifest.json"), "utf8");
    const manifest = K8sIncidentManifestSchema.parse(JSON.parse(manifestRaw));

    assert.equal(manifest.bundle_id, "k8s-incident");
    assert.ok(manifest.entries.length >= 6, "expected at least 6 k8s entries");

    const oomEntry = manifest.entries.find((e) => e.signature === "k8s:pod-oomkilled");
    assert.ok(oomEntry, "missing k8s:pod-oomkilled entry");
    assert.ok(oomEntry.checksum.startsWith("sha256:"));
    assert.ok(oomEntry.path.includes("pod-oomkilled"));

    const crashEntry = manifest.entries.find((e) => e.signature === "k8s:pod-crashloop-imagepull");
    assert.ok(crashEntry, "missing k8s:pod-crashloop-imagepull entry");
    assert.ok(manifest.entries.some((e) => e.signature === "k8s:ingress-5xx-upstream-timeout"));
    assert.ok(manifest.entries.some((e) => e.signature === "k8s:pvc-pending"));
    assert.ok(manifest.entries.some((e) => e.signature === "k8s:node-notready"));
    assert.ok(manifest.entries.some((e) => e.signature === "k8s:dns-resolution-failure"));

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
      assert.equal(bundle.recommendation_only, true);
      assert.ok(bundle.escalation_conditions.length > 0);
      assert.ok(bundle.known_fixes.every((fix: Record<string, unknown>) =>
        Array.isArray(fix.forbidden_operations) && (fix.forbidden_operations as unknown[]).length > 0
      ));
    }
  });
});
