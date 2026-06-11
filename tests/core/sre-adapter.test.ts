import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adaptDirectionResult } from "@praxisbase/core/adapter/sre-autopilot.js";
import { IncidentEpisodeSchema, ProposalSchema } from "@praxisbase/core/protocol/schemas.js";

describe("SRE-autopilot adapter", () => {
  it("converts confirmed direction result to incident episode", () => {
    const result = adaptDirectionResult({
      problem_signature: "k8s:pod-oomkilled",
      environment_id: "prod",
      run_id: "trace-001",
      agent_id: "sre-autopilot-cp",
      confirmed: true,
      evidence_summary: "Pod OOMKilled; memory limit exceeded.",
      source_refs: ["k8s-event://cluster-a/prod/order-api/OOMKilling"],
    });

    const episode = IncidentEpisodeSchema.parse(result.episode);
    assert.equal(episode.type, "incident_episode");
    assert.equal(episode.scope, "team");
    assert.equal(episode.result, "confirmed");
    assert.equal(episode.problem_signature, "k8s:pod-oomkilled");
    assert.equal(episode.agent_type, "live_incident_analyzer");
    assert.ok(episode.source_refs.length > 0);
    assert.equal(result.proposal, undefined);
  });

  it("converts explicit incident result states correctly", () => {
    for (const expected of ["ruled_out", "inconclusive", "data_gap"] as const) {
      const result = adaptDirectionResult({
        problem_signature: "k8s:pod-crashloop-imagepull",
        environment_id: "staging",
        run_id: `trace-${expected}`,
        agent_id: "sre-agent",
        result: expected,
        evidence_summary: "Not reproducible.",
        source_refs: ["k8s://cluster-b/staging"],
      });

      assert.equal(result.episode.result, expected);
      assert.equal(result.episode.scope, "team");
    }
  });

  it("keeps boolean confirmed input backwards compatible", () => {
    const result = adaptDirectionResult({
      problem_signature: "k8s:pod-crashloop-imagepull",
      environment_id: "staging",
      run_id: "trace-002",
      agent_id: "sre-agent",
      confirmed: false,
      evidence_summary: "Not reproducible.",
      source_refs: ["k8s://cluster-b/staging"],
    });

    assert.equal(result.episode.result, "ruled_out");
  });

  it("generates proposal when patch fields provided", () => {
    const result = adaptDirectionResult({
      problem_signature: "k8s:pod-oomkilled",
      environment_id: "prod",
      run_id: "trace-003",
      agent_id: "sre-autopilot-cp",
      confirmed: true,
      evidence_summary: "OOMKilled pattern confirmed.",
      source_refs: ["k8s-event://cluster-a/prod/order-api/OOMKilling"],
      proposal_patch_path: "kb/known-fixes/k8s-pod-oomkilled.md",
      proposal_patch_content: "# K8s Pod OOMKilled\n",
    });

    assert.ok(result.proposal);
    const proposal = ProposalSchema.parse(result.proposal);
    assert.equal(proposal.scope, "team");
    assert.equal(proposal.target_type, "known_fix");
    assert.equal(proposal.evidence.source_uri, "k8s-event://cluster-a/prod/order-api/OOMKilling");
    assert.ok(proposal.evidence.source_hash.startsWith("sha256:"));
    assert.ok(proposal.evidence.source_hash.length > 10);
    assert.equal(proposal.evidence.source_refs?.[0].uri, "k8s-event://cluster-a/prod/order-api/OOMKilling");
    assert.ok(proposal.evidence.redacted_summary);
  });

  it("source_hash is deterministic for same input", () => {
    const input = {
      problem_signature: "k8s:pod-oomkilled",
      environment_id: "prod",
      run_id: "trace-determinism",
      agent_id: "sre-agent",
      confirmed: true,
      evidence_summary: "Same evidence.",
      source_refs: ["k8s://test"],
      proposal_patch_path: "kb/test.md",
      proposal_patch_content: "# Test\n",
    };
    const a = adaptDirectionResult({ ...input });
    const b = adaptDirectionResult({ ...input });
    assert.equal(a.proposal!.evidence.source_hash, b.proposal!.evidence.source_hash);
  });

  it("output episode passes schema validation", () => {
    const result = adaptDirectionResult({
      problem_signature: "k8s:pod-oomkilled",
      environment_id: "prod",
      run_id: "trace-004",
      agent_id: "sre-agent",
      confirmed: true,
      evidence_summary: "Confirmed.",
      source_refs: ["k8s://test"],
    });

    assert.doesNotThrow(() => IncidentEpisodeSchema.parse(result.episode));
  });
});
