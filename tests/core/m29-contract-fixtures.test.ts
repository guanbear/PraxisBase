import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IncidentEpisodeSchema,
  K8sIncidentManifestSchema,
  ProposalSchema,
} from "@praxisbase/core/protocol/schemas.js";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("M29 K8s incident contract fixtures", () => {
  it("keeps the manifest fixture aligned with the sre-autopilot contract", async () => {
    const manifest = K8sIncidentManifestSchema.parse(
      await readJson("tests/fixtures/k8s-incident/manifest.json")
    );

    assert.equal(manifest.bundle_id, "k8s-incident");
    assert.equal(manifest.compatible_cli, ">=0.1.0");
    assert.equal(manifest.entries[0].signature, "k8s:pod-oomkilled");
    assert.ok(manifest.entries[0].checksum.startsWith("sha256:"));
  });

  it("keeps the bundle entry fixture compact, read-only, and signature-scoped", async () => {
    const entry = await readJson("tests/fixtures/k8s-incident/pod-oomkilled.json") as Record<string, unknown>;

    assert.equal(entry.protocol_version, "0.1");
    assert.equal(entry.signature, "k8s:pod-oomkilled");
    assert.equal(entry.domain, "k8s");
    assert.equal(entry.recommendation_only, true);
    assert.ok(Array.isArray(entry.known_fixes));
    assert.ok(Array.isArray(entry.forbidden_operations));
    assert.ok(Array.isArray(entry.verification_steps));
    assert.ok(Array.isArray(entry.source_refs));
    assert.ok(JSON.stringify(entry).includes("Do not delete production pods automatically."));
    assert.ok(!JSON.stringify(entry).toLowerCase().includes("kubectl delete"));
  });

  it("keeps the incident episode fixture on the shared team schema", async () => {
    const episode = IncidentEpisodeSchema.parse(
      await readJson("tests/fixtures/k8s-incident/incident-episode.json")
    );

    assert.equal(episode.type, "incident_episode");
    assert.equal(episode.scope, "team");
    assert.equal(episode.problem_signature, "k8s:pod-oomkilled");
    assert.equal(episode.knowledge_references[0].outcome, "confirmed");
  });

  it("keeps the proposal fixture in the shared team review/promote schema", async () => {
    const proposal = ProposalSchema.parse(
      await readJson("tests/fixtures/k8s-incident/proposal.json")
    );

    assert.equal(proposal.scope, "team");
    assert.equal(proposal.target_type, "known_fix");
    assert.equal(proposal.patch.path, "kb/known-fixes/k8s-pod-oomkilled.md");
    assert.equal(proposal.evidence.source_refs?.[0].hash, "sha256:prom-hash");
  });
});
