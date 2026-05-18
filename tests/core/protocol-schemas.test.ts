import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EpisodeSchema,
  IncidentEpisodeSchema,
  AnyEpisodeSchema,
  EvidenceSchema,
  K8sIncidentManifestEntrySchema,
  K8sIncidentManifestSchema,
  KnownFixFrontmatterSchema,
  ProposalSchema,
  ReviewSchema,
} from "@praxisbase/core/protocol/schemas.js";

describe("protocol schemas", () => {
  it("accepts a valid repair episode", () => {
    const parsed = EpisodeSchema.parse({
      id: "episode_20260517_abc",
      protocol_version: "0.1",
      type: "repair_episode",
      scope: "team",
      agent_id: "openclaw-temp-xyz",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox-123",
      run_id: "run-456",
      idempotency_key: "episode_20260517_abc",
      problem_signature: "openclaw:claude-auth-expired",
      result: "success",
      used_skills: ["skills/openclaw/auth-repair/SKILL.md"],
      used_objects: ["kb/known-fixes/openclaw-auth-expired.md"],
      source_refs: ["log://openclaw/sandbox-123/run-456"],
      summary: "Refreshed auth state and restarted the session.",
      created_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(parsed.scope, "team");
    assert.equal(parsed.type, "repair_episode");
    assert.equal(parsed.idempotency_key, parsed.id);
  });

  it("rejects an episode without provenance", () => {
    const result = EpisodeSchema.safeParse({
      id: "episode_20260517_abc",
      protocol_version: "0.1",
      type: "repair_episode",
      scope: "team",
      agent_id: "openclaw-temp-xyz",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox-123",
      run_id: "run-456",
      idempotency_key: "episode_20260517_abc",
      problem_signature: "openclaw:claude-auth-expired",
      result: "success",
      used_skills: [],
      used_objects: [],
      source_refs: [],
      summary: "Missing provenance.",
      created_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(result.success, false);
  });

  it("accepts a valid incident episode", () => {
    const parsed = IncidentEpisodeSchema.parse({
      id: "episode_20260518_incident",
      protocol_version: "0.1",
      type: "incident_episode",
      scope: "team",
      agent_id: "sre-autopilot-cp",
      agent_type: "live_incident_analyzer",
      environment_id: "prod",
      run_id: "trace-123",
      idempotency_key: "episode_20260518_incident",
      problem_signature: "k8s:pod-oomkilled",
      result: "confirmed",
      used_skills: [],
      used_objects: [],
      source_refs: ["prometheus://cluster-a/prod"],
      evidence_summary: "Pod OOMKilled.",
      created_at: "2026-05-18T10:00:00Z",
    });

    assert.equal(parsed.type, "incident_episode");
    assert.equal(parsed.result, "confirmed");
  });

  it("any episode union accepts both repair and incident episodes", () => {
    const repair = AnyEpisodeSchema.parse({
      id: "ep1",
      protocol_version: "0.1",
      type: "repair_episode",
      scope: "team",
      agent_id: "a",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox",
      run_id: "r1",
      idempotency_key: "ep1",
      problem_signature: "openclaw:x",
      result: "success",
      source_refs: ["log://x"],
      summary: "ok",
      created_at: "2026-05-17T10:00:00Z",
    });

    const incident = AnyEpisodeSchema.parse({
      id: "ep2",
      protocol_version: "0.1",
      type: "incident_episode",
      scope: "team",
      agent_id: "b",
      agent_type: "live_incident_analyzer",
      environment_id: "prod",
      run_id: "r2",
      idempotency_key: "ep2",
      problem_signature: "k8s:x",
      result: "ruled_out",
      source_refs: ["k8s://x"],
      evidence_summary: "Not reproducible",
      created_at: "2026-05-18T10:00:00Z",
    });

    assert.equal(repair.type, "repair_episode");
    assert.equal(incident.type, "incident_episode");
  });

  it("accepts a proposal with evidence", () => {
    const parsed = ProposalSchema.parse({
      id: "proposal_20260517_known_fix",
      protocol_version: "0.1",
      type: "knowledge_proposal",
      scope: "team",
      action: "create",
      target_type: "known_fix",
      target_id: "openclaw-auth-expired",
      agent_id: "openclaw-temp-xyz",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox-123",
      run_id: "run-456",
      idempotency_key: "proposal_20260517_known_fix",
      evidence: {
        source_uri: "log://openclaw/sandbox-123/run-456",
        source_hash: "sha256:abc",
        excerpt: "Claude auth expired; refresh fixed it.",
        repair_result: "success",
        verification: "Minimal model call completed.",
      },
      patch: {
        path: "kb/known-fixes/openclaw-auth-expired.md",
        content: "# OpenClaw auth expired",
      },
      created_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(parsed.target_type, "known_fix");
  });

  it("accepts a medium-risk review approval", () => {
    const parsed = ReviewSchema.parse({
      id: "review_20260517_known_fix",
      protocol_version: "0.1",
      proposal_id: "proposal_20260517_known_fix",
      reviewer_id: "reviewer-agent",
      reviewer_model: "configured-reviewer",
      prompt_version: "review-v0.1",
      decision: "approve",
      risk: "medium",
      confidence: 0.82,
      reasons: ["Evidence references a successful repair episode."],
      required_checks: ["praxisbase check"],
      created_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(parsed.decision, "approve");
  });

  it("accepts known fix frontmatter", () => {
    const parsed = KnownFixFrontmatterSchema.parse({
      id: "openclaw-auth-expired",
      protocol_version: "0.1",
      type: "known_fix",
      scope: "team",
      risk: "medium",
      status: "published",
      signatures: ["openclaw:claude-auth-expired"],
      skills: ["skills/openclaw/auth-repair/SKILL.md"],
      sources: [{ uri: "log://openclaw/sandbox-123/run-456", hash: "sha256:abc" }],
      confidence: 0.84,
      updated_at: "2026-05-17T10:00:00Z",
    });

    assert.ok(parsed.signatures.includes("openclaw:claude-auth-expired"));
  });

  it("accepts evidence with optional source_refs", () => {
    const parsed = EvidenceSchema.parse({
      source_uri: "log://openclaw/sandbox/run-1",
      source_hash: "sha256:abc",
      excerpt: "Auth expired.",
      repair_result: "success",
      verification: "Model call completed.",
      source_refs: [
        { uri: "k8s://pod-logs/prod", hash: "sha256:def" },
        { uri: "prometheus://metrics/cpu", hash: "sha256:ghi" },
      ],
    });
    assert.equal(parsed.source_refs!.length, 2);
    assert.equal(parsed.source_refs![0].uri, "k8s://pod-logs/prod");
  });

  it("accepts evidence with optional redacted_summary", () => {
    const parsed = EvidenceSchema.parse({
      source_uri: "log://sensitive",
      source_hash: "sha256:abc",
      excerpt: "Contains [REDACTED] data.",
      repair_result: "success",
      verification: "Verified.",
      redacted_summary: "Auth token rotation succeeded; secrets redacted.",
    });
    assert.equal(parsed.redacted_summary, "Auth token rotation succeeded; secrets redacted.");
  });

  it("accepts evidence without new fields (backward compat)", () => {
    const parsed = EvidenceSchema.parse({
      source_uri: "log://x",
      source_hash: "sha256:abc",
      excerpt: "ok",
      repair_result: "success",
      verification: "done",
    });
    assert.equal(parsed.source_refs, undefined);
    assert.equal(parsed.redacted_summary, undefined);
  });

  it("proposal with extended evidence round-trips through schema", () => {
    const parsed = ProposalSchema.parse({
      id: "proposal_ext_test",
      protocol_version: "0.1",
      type: "knowledge_proposal",
      scope: "team",
      action: "create",
      target_type: "known_fix",
      target_id: "k8s-oom-fix",
      agent_id: "sre-agent",
      agent_type: "live_incident_analyzer",
      environment_id: "prod",
      run_id: "run-1",
      idempotency_key: "proposal_ext_test",
      evidence: {
        source_uri: "k8s://pod-logs",
        source_hash: "sha256:xyz",
        excerpt: "OOMKilled event.",
        repair_result: "success",
        verification: "Pod restarted successfully.",
        source_refs: [{ uri: "k8s://events", hash: "sha256:evt" }],
        redacted_summary: "Memory limit increased.",
      },
      patch: { path: "kb/known-fixes/k8s-oom.md", content: "# K8s OOM" },
      created_at: "2026-05-18T10:00:00Z",
    });
    assert.equal(parsed.evidence.source_refs!.length, 1);
    assert.equal(parsed.evidence.redacted_summary, "Memory limit increased.");
  });

  it("accepts a k8s incident manifest with per-signature entries", () => {
    const entry = K8sIncidentManifestEntrySchema.parse({
      signature: "k8s:pod-oomkilled",
      path: "k8s-incident/k8s-pod-oomkilled.json",
      checksum: "sha256:example",
      risk: "medium",
    });

    const manifest = K8sIncidentManifestSchema.parse({
      protocol_version: "0.1",
      bundle_id: "k8s-incident",
      generated_at: "2026-05-18T10:00:00Z",
      commit_sha: "abc123",
      compatible_cli: ">=0.1.0",
      entries: [entry],
    });

    assert.equal(manifest.bundle_id, "k8s-incident");
    assert.equal(manifest.entries[0].signature, "k8s:pod-oomkilled");
  });
});
