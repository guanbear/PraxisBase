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
  KnowledgeReferenceSchema,
  KnowledgeReferencePhaseSchema,
  KnowledgeReferenceEffectSchema,
  KnowledgeReferenceOutcomeSchema,
  KnowledgeTypeSchema,
  MaturitySchema,
  PitfallFrontmatterSchema,
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

  it("repair episode accepts knowledge_references", () => {
    const parsed = EpisodeSchema.parse({
      id: "episode_20260517_refs",
      protocol_version: "0.1",
      type: "repair_episode",
      scope: "team",
      agent_id: "openclaw-temp-xyz",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox-123",
      run_id: "run-456",
      idempotency_key: "episode_20260517_refs",
      problem_signature: "openclaw:claude-auth-expired",
      result: "success",
      source_refs: ["log://openclaw/sandbox-123/run-456"],
      summary: "Used known fix and skill.",
      knowledge_references: [
        {
          id: "openclaw-auth-expired",
          path: "kb/known-fixes/openclaw-auth-expired.md",
          used_in_phase: "diagnosis",
          effect: "helped_fix",
          outcome: "success",
        },
        {
          id: "openclaw-auth-repair",
          path: "skills/openclaw/auth-repair/SKILL.md",
          used_in_phase: "repair",
          effect: "guided_action",
          outcome: "success",
        },
      ],
      created_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(parsed.knowledge_references!.length, 2);
    assert.equal(parsed.knowledge_references![0].id, "openclaw-auth-expired");
    assert.equal(parsed.knowledge_references![0].used_in_phase, "diagnosis");
    assert.equal(parsed.knowledge_references![1].effect, "guided_action");
  });

  it("episode without knowledge_references is backward compatible", () => {
    const parsed = EpisodeSchema.parse({
      id: "ep_backward",
      protocol_version: "0.1",
      type: "repair_episode",
      scope: "team",
      agent_id: "a",
      agent_type: "temporary_repair_agent",
      environment_id: "sandbox",
      run_id: "r1",
      idempotency_key: "ep_backward",
      problem_signature: "openclaw:x",
      result: "success",
      source_refs: ["log://x"],
      summary: "No refs.",
      created_at: "2026-05-17T10:00:00Z",
    });

    assert.deepEqual(parsed.knowledge_references, []);
  });

  it("incident episode accepts knowledge_references", () => {
    const parsed = IncidentEpisodeSchema.parse({
      id: "incident_refs",
      protocol_version: "0.1",
      type: "incident_episode",
      scope: "team",
      agent_id: "sre",
      agent_type: "live_incident_analyzer",
      environment_id: "prod",
      run_id: "r1",
      idempotency_key: "incident_refs",
      problem_signature: "k8s:pod-oomkilled",
      result: "confirmed",
      source_refs: ["k8s://x"],
      evidence_summary: "Confirmed.",
      knowledge_references: [
        {
          id: "k8s-pod-oomkilled",
          path: "kb/known-fixes/k8s-pod-oomkilled.md",
          used_in_phase: "diagnosis",
          effect: "helped_fix",
          outcome: "success",
        },
      ],
      created_at: "2026-05-18T10:00:00Z",
    });

    assert.equal(parsed.knowledge_references!.length, 1);
  });

  it("knowledge_reference schema validates required fields", () => {
    const ref = KnowledgeReferenceSchema.parse({
      id: "test-fix",
      path: "kb/known-fixes/test.md",
      used_in_phase: "repair",
      effect: "guided_action",
      outcome: "success",
    });

    assert.equal(ref.id, "test-fix");
    assert.equal(ref.used_in_phase, "repair");

    assert.throws(() => KnowledgeReferenceSchema.parse({
      id: "missing-fields",
      path: "kb/test.md",
    }));
  });

  it("known_fix frontmatter accepts governance fields", () => {
    const parsed = KnownFixFrontmatterSchema.parse({
      id: "openclaw-auth-expired",
      protocol_version: "0.1",
      type: "known_fix",
      knowledge_type: "known_fix",
      scope: "team",
      risk: "medium",
      status: "published",
      maturity: "verified",
      signatures: ["openclaw:claude-auth-expired"],
      skills: ["skills/openclaw/auth-repair/SKILL.md"],
      sources: [{ uri: "log://x", hash: "sha256:abc" }],
      confidence: 0.84,
      reference_count: 3,
      last_referenced_at: "2026-05-17T12:00:00Z",
      supersedes: ["old-auth-fix"],
      superseded_by: null,
      updated_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(parsed.knowledge_type, "known_fix");
    assert.equal(parsed.maturity, "verified");
    assert.equal(parsed.reference_count, 3);
    assert.equal(parsed.last_referenced_at, "2026-05-17T12:00:00Z");
    assert.deepEqual(parsed.supersedes, ["old-auth-fix"]);
    assert.equal(parsed.superseded_by, null);
  });

  it("known_fix frontmatter backward compatible without governance fields", () => {
    const parsed = KnownFixFrontmatterSchema.parse({
      id: "minimal-fix",
      protocol_version: "0.1",
      type: "known_fix",
      scope: "team",
      risk: "medium",
      status: "draft",
      signatures: ["test:sig"],
      sources: [{ uri: "seed://test", hash: "sha256:seed" }],
      confidence: 0.5,
      updated_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(parsed.knowledge_type, "known_fix");
    assert.equal(parsed.maturity, "draft");
    assert.equal(parsed.reference_count, 0);
    assert.equal(parsed.last_referenced_at, null);
    assert.deepEqual(parsed.supersedes, []);
    assert.equal(parsed.superseded_by, null);
  });

  it("pitfall frontmatter validates with knowledge_type pitfall", () => {
    const parsed = PitfallFrontmatterSchema.parse({
      id: "do-not-force-delete-pods",
      protocol_version: "0.1",
      type: "pitfall",
      knowledge_type: "pitfall",
      scope: "team",
      risk: "high",
      status: "published",
      signatures: ["k8s:pod-force-delete"],
      summary: "Do not force-delete pods in production without drain.",
      forbidden_actions: ["force-delete production pods without drain"],
      maturity: "verified",
      reference_count: 5,
      last_referenced_at: "2026-05-15T08:00:00Z",
      supersedes: [],
      superseded_by: null,
      updated_at: "2026-05-01T10:00:00Z",
    });

    assert.equal(parsed.knowledge_type, "pitfall");
    assert.equal(parsed.type, "pitfall");
    assert.equal(parsed.risk, "high");
    assert.equal(parsed.maturity, "verified");
  });

  it("pitfall frontmatter rejects non-pitfall knowledge_type", () => {
    assert.throws(() => PitfallFrontmatterSchema.parse({
      id: "wrong-type",
      protocol_version: "0.1",
      type: "pitfall",
      knowledge_type: "known_fix",
      scope: "team",
      risk: "medium",
      status: "draft",
      signatures: ["test:sig"],
      summary: "Test.",
      forbidden_actions: ["do bad thing"],
      updated_at: "2026-05-17T10:00:00Z",
    }));
  });

  it("accepts pitfall frontmatter with governance fields", () => {
    const parsed = PitfallFrontmatterSchema.parse({
      id: "openclaw-dont-force-kill",
      protocol_version: "0.1",
      type: "pitfall",
      knowledge_type: "pitfall",
      scope: "team",
      risk: "medium",
      status: "draft",
      signatures: ["openclaw:force-kill-risk"],
      summary: "Do not force-kill the OpenClaw process; it corrupts workspace state.",
      forbidden_actions: ["force-kill openclaw process", "rm -rf workspace without backup"],
      maturity: "draft",
      reference_count: 0,
      last_referenced_at: null,
      supersedes: [],
      superseded_by: null,
      updated_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(parsed.knowledge_type, "pitfall");
    assert.equal(parsed.type, "pitfall");
    assert.equal(parsed.maturity, "draft");
    assert.deepEqual(parsed.forbidden_actions, ["force-kill openclaw process", "rm -rf workspace without backup"]);
  });

  it("pitfall governance fields default correctly", () => {
    const parsed = PitfallFrontmatterSchema.parse({
      id: "test-pitfall",
      protocol_version: "0.1",
      type: "pitfall",
      knowledge_type: "pitfall",
      scope: "team",
      risk: "medium",
      status: "draft",
      signatures: ["test:pitfall-sig"],
      summary: "Test pitfall.",
      forbidden_actions: ["do bad thing"],
      updated_at: "2026-05-17T10:00:00Z",
    });

    assert.equal(parsed.maturity, "draft");
    assert.equal(parsed.reference_count, 0);
    assert.equal(parsed.superseded_by, null);
    assert.deepEqual(parsed.supersedes, []);
  });

  it("accepts valid knowledge type and maturity enum values", () => {
    const kt = KnowledgeTypeSchema.parse("pitfall");
    assert.equal(kt, "pitfall");
    const m = MaturitySchema.parse("proven");
    assert.equal(m, "proven");
  });

  it("knowledge_reference used_in_phase accepts valid enum values", () => {
    for (const phase of ["diagnosis", "repair", "verification", "proposal"] as const) {
      const parsed = KnowledgeReferencePhaseSchema.parse(phase);
      assert.equal(parsed, phase);
    }
  });

  it("knowledge_reference used_in_phase rejects invalid values", () => {
    assert.throws(() => KnowledgeReferencePhaseSchema.parse("invalid_phase"));
    assert.throws(() => KnowledgeReferencePhaseSchema.parse(""));
  });

  it("knowledge_reference effect accepts valid enum values", () => {
    for (const effect of ["helped_fix", "guided_action"] as const) {
      const parsed = KnowledgeReferenceEffectSchema.parse(effect);
      assert.equal(parsed, effect);
    }
  });

  it("knowledge_reference effect rejects invalid values", () => {
    assert.throws(() => KnowledgeReferenceEffectSchema.parse("invalid_effect"));
    assert.throws(() => KnowledgeReferenceEffectSchema.parse("helped"));
  });

  it("knowledge_reference outcome accepts valid enum values from repair and incident results", () => {
    const validOutcomes = ["success", "failed", "partial", "unknown", "confirmed", "ruled_out", "inconclusive", "data_gap"] as const;
    for (const outcome of validOutcomes) {
      const parsed = KnowledgeReferenceOutcomeSchema.parse(outcome);
      assert.equal(parsed, outcome);
    }
  });

  it("knowledge_reference outcome rejects invalid values", () => {
    assert.throws(() => KnowledgeReferenceOutcomeSchema.parse("invalid_outcome"));
    assert.throws(() => KnowledgeReferenceOutcomeSchema.parse(""));
  });

  it("knowledge_reference rejects arbitrary string for used_in_phase", () => {
    assert.throws(() => KnowledgeReferenceSchema.parse({
      id: "test-fix",
      path: "kb/known-fixes/test.md",
      used_in_phase: "arbitrary_string",
      effect: "helped_fix",
      outcome: "success",
    }));
  });

  it("knowledge_reference rejects arbitrary string for effect", () => {
    assert.throws(() => KnowledgeReferenceSchema.parse({
      id: "test-fix",
      path: "kb/known-fixes/test.md",
      used_in_phase: "repair",
      effect: "arbitrary_effect",
      outcome: "success",
    }));
  });

  it("knowledge_reference rejects arbitrary string for outcome", () => {
    assert.throws(() => KnowledgeReferenceSchema.parse({
      id: "test-fix",
      path: "kb/known-fixes/test.md",
      used_in_phase: "repair",
      effect: "helped_fix",
      outcome: "arbitrary_outcome",
    }));
  });
});
