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
  AgentContextBundleSchema,
  ContextJuiceBudgetResultSchema,
  ContextJuiceReportSchema,
  ExperienceEnvelopeSchema,
  LifecycleDecisionSchema,
  LifecycleObservationSchema,
  LifecycleProposalSchema,
  KnowledgeLifecycleReportSchema,
  CatalogEntrySchema,
  KnowledgeCatalogSchema,
  PersonalLearningFacetSchema,
  PersonalLearningReportSchema,
  SkillValidationReportSchema,
  SkillValidationDecisionSchema,
  SkillValidationModeSchema,
  SkillInjectionDecisionSchema,
  TrajectoryMicrocompactResultSchema,
  TrustBoundaryItemSchema,
  TrustTierSchema,
} from "@praxisbase/core/protocol/schemas.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";

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

  it("MaturitySchema accepts stale and archived values", () => {
    assert.equal(MaturitySchema.parse("stale"), "stale");
    assert.equal(MaturitySchema.parse("archived"), "archived");
    assert.equal(MaturitySchema.parse("draft"), "draft");
    assert.equal(MaturitySchema.parse("verified"), "verified");
    assert.equal(MaturitySchema.parse("proven"), "proven");
  });

  it("ExperienceEnvelope parses without trajectory metadata (backward compat)", () => {
    const parsed = ExperienceEnvelopeSchema.parse({
      id: "env-1",
      protocol_version: "0.1",
      type: "experience_envelope",
      source_id: "src-1",
      agent: "codex",
      channel: "local",
      source_ref: "log://session-1",
      source_hash: "sha256:abc",
      scope_hint: "personal",
      redacted_summary: "Fixed auth issue.",
      fetched_at: "2026-05-28T10:00:00Z",
      privacy: { mode: "personal-local", verdict: "allow", reasons: [] },
    });
    assert.equal(parsed.trajectory_steps, undefined);
    assert.equal(parsed.tool_outcomes, undefined);
    assert.equal(parsed.read_skills, undefined);
    assert.equal(parsed.skill_effectiveness_hints, undefined);
  });

  it("ExperienceEnvelope parses with trajectory metadata", () => {
    const parsed = ExperienceEnvelopeSchema.parse({
      id: "env-2",
      protocol_version: "0.1",
      type: "experience_envelope",
      source_id: "src-2",
      agent: "opencode",
      channel: "terminal",
      source_ref: "log://session-2",
      source_hash: "sha256:def",
      scope_hint: "project",
      redacted_summary: "Repaired build pipeline.",
      trajectory_steps: [
        { goal: "fix build", action: "ran make", tool: "bash", outcome: "success" },
      ],
      tool_outcomes: [
        { tool: "bash", result_category: "success" },
      ],
      read_skills: ["skills/openclaw/build-repair/SKILL.md"],
      modified_skills: [],
      injected_context: ["ctx-123"],
      verification_events: ["test_pass"],
      skill_effectiveness_hints: ["helped"],
      fetched_at: "2026-05-28T10:00:00Z",
      privacy: { mode: "personal-local", verdict: "allow", reasons: [] },
    });
    assert.equal(parsed.trajectory_steps!.length, 1);
    assert.equal(parsed.tool_outcomes![0].tool, "bash");
    assert.deepEqual(parsed.read_skills, ["skills/openclaw/build-repair/SKILL.md"]);
    assert.deepEqual(parsed.skill_effectiveness_hints, ["helped"]);
  });

  it("ExperienceEnvelope rejects raw_transcript field", () => {
    assert.throws(() => ExperienceEnvelopeSchema.parse({
      id: "env-bad",
      protocol_version: "0.1",
      type: "experience_envelope",
      source_id: "src-1",
      agent: "codex",
      channel: "local",
      source_ref: "log://s",
      source_hash: "sha256:x",
      scope_hint: "personal",
      redacted_summary: "Has raw data.",
      raw_transcript: "full transcript here",
      fetched_at: "2026-05-28T10:00:00Z",
      privacy: { mode: "personal-local", verdict: "allow", reasons: [] },
    }), /raw_transcript/);
  });

  it("ExperienceEnvelope rejects raw_log field", () => {
    assert.throws(() => ExperienceEnvelopeSchema.parse({
      id: "env-bad2",
      protocol_version: "0.1",
      type: "experience_envelope",
      source_id: "src-1",
      agent: "codex",
      channel: "local",
      source_ref: "log://s",
      source_hash: "sha256:x",
      scope_hint: "personal",
      redacted_summary: "Has raw log.",
      raw_log: "full log content",
      fetched_at: "2026-05-28T10:00:00Z",
      privacy: { mode: "personal-local", verdict: "allow", reasons: [] },
    }), /raw_log/);
  });

  it("ExperienceEnvelope safeParse reports raw log fields without throwing", () => {
    const parsed = ExperienceEnvelopeSchema.safeParse({
      id: "env-bad-safe",
      protocol_version: "0.1",
      type: "experience_envelope",
      source_id: "src-1",
      agent: "codex",
      channel: "local",
      source_ref: "log://s",
      source_hash: "sha256:x",
      scope_hint: "personal",
      redacted_summary: "Has raw log.",
      raw_log: "full log content",
      fetched_at: "2026-05-28T10:00:00Z",
      privacy: { mode: "personal-local", verdict: "allow", reasons: [] },
    });

    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0].path.join("."), "raw_log");
      assert.match(parsed.error.issues[0].message, /raw_log is not allowed/);
    }
  });

  it("protocol paths include M23 lifecycle, validation, and catalog paths", () => {
    assert.equal(protocolPaths.reportsLifecycle, ".praxisbase/reports/lifecycle");
    assert.equal(protocolPaths.reportsSkillValidation, ".praxisbase/reports/skill-validation");
    assert.equal(protocolPaths.catalog, ".praxisbase/catalog");
  });

  it("LifecycleDecisionSchema accepts all decision values", () => {
    for (const d of ["promote", "decay", "archive", "conflict", "no_op"] as const) {
      assert.equal(LifecycleDecisionSchema.parse(d), d);
    }
  });

  it("KnowledgeLifecycleReportSchema validates", () => {
    const parsed = KnowledgeLifecycleReportSchema.parse({
      id: "lr-1",
      protocol_version: "0.1",
      type: "knowledge_lifecycle_report",
      observations: [{
        page_id: "page-1",
        page_path: "kb/known-fixes/test.md",
        maturity: "draft",
        source_refs: ["src-1"],
        source_hashes: ["sha256:abc"],
      }],
      proposals: [{
        page_id: "page-1",
        page_path: "kb/known-fixes/test.md",
        decision: "promote",
        reasons: ["Two provenance refs"],
        current_maturity: "draft",
        proposed_maturity: "verified",
      }],
      changed_stable_knowledge: false,
      created_at: "2026-05-28T10:00:00Z",
    });
    assert.equal(parsed.changed_stable_knowledge, false);
    assert.equal(parsed.proposals[0].decision, "promote");
  });

  it("KnowledgeCatalogSchema validates", () => {
    const parsed = KnowledgeCatalogSchema.parse({
      id: "cat-1",
      protocol_version: "0.1",
      type: "knowledge_catalog",
      entries: [{
        page_id: "p1",
        page_path: "kb/test.md",
        title: "Test Page",
        maturity: "verified",
        source_hashes: ["sha256:abc"],
      }],
      changed_stable_knowledge: false,
      created_at: "2026-05-28T10:00:00Z",
    });
    assert.equal(parsed.entries.length, 1);
    assert.equal(parsed.changed_stable_knowledge, false);
  });

  it("SkillValidationReportSchema validates", () => {
    const parsed = SkillValidationReportSchema.parse({
      id: "sv-1",
      protocol_version: "0.1",
      type: "skill_validation_report",
      candidate_id: "cand-1",
      mode: "static",
      checks: [
        { check: "safe_path", passed: true },
        { check: "required_sections", passed: true },
      ],
      decision: "pass",
      reason: "All static checks passed.",
      created_at: "2026-05-28T10:00:00Z",
    });
    assert.equal(parsed.decision, "pass");
    assert.equal(parsed.mode, "static");
  });

  it("SkillValidationModeSchema and DecisionSchema accept valid values", () => {
    assert.equal(SkillValidationModeSchema.parse("static"), "static");
    assert.equal(SkillValidationModeSchema.parse("evidence_simulation"), "evidence_simulation");
    assert.equal(SkillValidationModeSchema.parse("replay"), "replay");
    assert.equal(SkillValidationDecisionSchema.parse("pass"), "pass");
    assert.equal(SkillValidationDecisionSchema.parse("fail"), "fail");
    assert.equal(SkillValidationDecisionSchema.parse("needs_human"), "needs_human");
  });
});

describe("M24 agent context juice and personal learning schemas", () => {
  it("TrustTierSchema accepts all 7 valid tier values", () => {
    const tiers = [
      "pb_stable",
      "pb_personal_facet",
      "pb_candidate",
      "gbrain_sidecar",
      "agentmemory_sidecar",
      "remote_personal_agent",
      "external_untrusted",
    ] as const;

    for (const tier of tiers) {
      assert.equal(TrustTierSchema.parse(tier), tier);
    }
  });

  it("TrustTierSchema rejects invalid tier values", () => {
    assert.throws(() => TrustTierSchema.parse("pb_unknown"));
    assert.throws(() => TrustTierSchema.parse(""));
  });

  it("TrustBoundaryItemSchema accepts a valid item with pb_stable tier", () => {
    const parsed = TrustBoundaryItemSchema.parse({
      source_kind: "kb",
      authority: "praxisbase",
      tier: "pb_stable",
      injectable: true,
      source_hint: "kb/known-fixes/auth.md",
      metadata: { reviewed: true },
    });

    assert.equal(parsed.tier, "pb_stable");
    assert.equal(parsed.injectable, true);
  });

  it("TrustBoundaryItemSchema defaults unknown to external_untrusted", () => {
    const parsed = TrustBoundaryItemSchema.parse({
      source_kind: "unknown",
      authority: "unreviewed",
      tier: "external_untrusted",
      injectable: false,
    });

    assert.equal(parsed.tier, "external_untrusted");
  });

  it("ContextJuiceBudgetResultSchema accepts valid budget result", () => {
    const parsed = ContextJuiceBudgetResultSchema.parse({
      source_ref: "session://codex/1",
      source_hash: "sha256:abc",
      budget_id: "budget-1",
      original_bytes: 1200,
      kept_bytes: 800,
      saved_bytes: 400,
      truncated: true,
      marker: "[truncated]",
    });

    assert.equal(parsed.saved_bytes, 400);
    assert.deepEqual(parsed.warnings, []);
  });

  it("ContextJuiceBudgetResultSchema rejects missing source_ref", () => {
    assert.throws(() => ContextJuiceBudgetResultSchema.parse({
      source_hash: "sha256:abc",
      budget_id: "budget-1",
      original_bytes: 1200,
      kept_bytes: 800,
      saved_bytes: 400,
      truncated: true,
    }));
  });

  it("TrajectoryMicrocompactResultSchema accepts valid microcompact result", () => {
    const parsed = TrajectoryMicrocompactResultSchema.parse({
      source_ref: "session://codex/trajectory",
      source_hash: "sha256:def",
      budget_id: "budget-1",
      original_entries: 20,
      kept_entries: 8,
      cleared_entries: 12,
      protected_signal_count: 3,
      recent_results_kept: 5,
      idempotent: true,
    });

    assert.equal(parsed.cleared_entries, 12);
    assert.deepEqual(parsed.warnings, []);
  });

  it("ContextJuiceReportSchema accepts valid report with budget results", () => {
    const parsed = ContextJuiceReportSchema.parse({
      id: "context-juice-1",
      protocol_version: "0.1",
      type: "context_juice_report",
      budget_id: "budget-1",
      items_seen: 10,
      items_budgeted: 6,
      items_microcompacted: 2,
      original_bytes: 5000,
      kept_bytes: 3000,
      saved_bytes: 2000,
      warnings: 0,
      protected_signal_count: 4,
      budget_results: [{
        source_ref: "session://codex/1",
        source_hash: "sha256:abc",
        budget_id: "budget-1",
        original_bytes: 1200,
        kept_bytes: 800,
        saved_bytes: 400,
        truncated: true,
      }],
      created_at: "2026-05-28T10:00:00Z",
    });

    assert.equal(parsed.type, "context_juice_report");
    assert.equal(parsed.budget_results.length, 1);
    assert.deepEqual(parsed.microcompact_results, []);
  });

  it("ContextJuiceReportSchema rejects raw transcript fields", () => {
    assert.throws(() => ContextJuiceReportSchema.strict().parse({
      id: "context-juice-raw",
      protocol_version: "0.1",
      type: "context_juice_report",
      budget_id: "budget-1",
      items_seen: 1,
      items_budgeted: 1,
      items_microcompacted: 0,
      original_bytes: 100,
      kept_bytes: 100,
      saved_bytes: 0,
      warnings: 0,
      protected_signal_count: 0,
      raw_transcript: "secret raw content",
      created_at: "2026-05-28T10:00:00Z",
    }));
  });

  it("SkillInjectionDecisionSchema accepts matched decision with reason", () => {
    const parsed = SkillInjectionDecisionSchema.parse({
      skill_id: "skills/openclaw/auth-repair",
      decision: "matched",
      reason: "Problem signature matched auth expiration.",
      injected_bytes: 2048,
      truncated: false,
      scope: "team",
      authority: "pb_stable",
      promotion_id: "promotion-1",
      audit_id: "audit-1",
    });

    assert.equal(parsed.decision, "matched");
    assert.equal(parsed.reason, "Problem signature matched auth expiration.");
  });

  it("SkillInjectionDecisionSchema accepts skipped decision", () => {
    const parsed = SkillInjectionDecisionSchema.parse({
      skill_id: "skills/k8s/oom",
      decision: "skipped",
      reason: "Query did not mention Kubernetes.",
      injected_bytes: 0,
      truncated: false,
      scope: "team",
      authority: "pb_stable",
    });

    assert.equal(parsed.decision, "skipped");
    assert.equal(parsed.injected_bytes, 0);
  });

  it("PersonalLearningFacetSchema accepts all 6 facet class values", () => {
    const facetClasses = ["style", "tooling", "veto", "goal", "identity", "channel"] as const;

    for (const facetClass of facetClasses) {
      const parsed = PersonalLearningFacetSchema.parse({
        id: `facet-${facetClass}`,
        facet_class: facetClass,
        key: "prefers_concise_status",
        value: "true",
        state: "active",
        stability: 0.9,
        evidence_count: 3,
        first_seen: "2026-05-01T10:00:00Z",
        last_seen: "2026-05-28T10:00:00Z",
      });

      assert.equal(parsed.facet_class, facetClass);
    }
  });

  it("PersonalLearningFacetSchema accepts all 6 state values", () => {
    const states = ["active", "provisional", "candidate", "dropped", "pinned", "forgotten"] as const;

    for (const state of states) {
      const parsed = PersonalLearningFacetSchema.parse({
        id: `facet-${state}`,
        facet_class: "style",
        key: "status_style",
        value: "dense",
        state,
        stability: 0.5,
        evidence_count: 1,
        first_seen: "2026-05-01T10:00:00Z",
        last_seen: "2026-05-28T10:00:00Z",
      });

      assert.equal(parsed.state, state);
    }
  });

  it("PersonalLearningFacetSchema accepts user_override states", () => {
    for (const userOverride of ["none", "pinned", "forgotten"] as const) {
      const parsed = PersonalLearningFacetSchema.parse({
        id: `facet-override-${userOverride}`,
        facet_class: "tooling",
        key: "preferred_shell",
        value: "zsh",
        state: "active",
        stability: 1,
        evidence_count: 5,
        first_seen: "2026-05-01T10:00:00Z",
        last_seen: "2026-05-28T10:00:00Z",
        user_override: userOverride,
      });

      assert.equal(parsed.user_override, userOverride);
    }
  });

  it("PersonalLearningReportSchema accepts valid report", () => {
    const parsed = PersonalLearningReportSchema.parse({
      id: "personal-learning-1",
      protocol_version: "0.1",
      type: "personal_learning_report",
      active_count: 1,
      provisional_count: 1,
      candidate_count: 1,
      pinned_count: 1,
      forgotten_count: 0,
      facets: [{
        id: "facet-1",
        facet_class: "style",
        key: "verbosity",
        value: "dense",
        state: "active",
        stability: 0.8,
        evidence_count: 4,
        first_seen: "2026-05-01T10:00:00Z",
        last_seen: "2026-05-28T10:00:00Z",
      }],
      created_at: "2026-05-28T10:00:00Z",
    });

    assert.equal(parsed.type, "personal_learning_report");
    assert.equal(parsed.facets.length, 1);
  });

  it("AgentContextBundleSchema accepts valid bundle", () => {
    const parsed = AgentContextBundleSchema.parse({
      id: "agent-context-1",
      protocol_version: "0.1",
      type: "agent_context_bundle",
      mode: "personal",
      query: "openclaw auth",
      total_bytes: 4096,
      budget_bytes: 8192,
      sections: [{
        kind: "stable_knowledge",
        tier: "pb_stable",
        items: 2,
        bytes: 2048,
      }],
      skill_decisions: [{
        skill_id: "skills/openclaw/auth-repair",
        decision: "matched",
        reason: "Relevant skill.",
        injected_bytes: 1024,
        truncated: false,
        scope: "team",
        authority: "pb_stable",
      }],
      created_at: "2026-05-28T10:00:00Z",
    });

    assert.equal(parsed.type, "agent_context_bundle");
    assert.equal(parsed.sections[0].tier, "pb_stable");
    assert.equal(parsed.omitted_item_count, 0);
  });

  it("AgentContextBundleSchema includes trust_summary with tier counts", () => {
    const parsed = AgentContextBundleSchema.parse({
      id: "agent-context-trust",
      protocol_version: "0.1",
      type: "agent_context_bundle",
      mode: "team",
      total_bytes: 2048,
      budget_bytes: 4096,
      sections: [{
        kind: "personal_facets",
        tier: "pb_personal_facet",
        items: 3,
        bytes: 512,
      }],
      trust_summary: {
        pb_personal_facet: 3,
        external_untrusted: 1,
      },
      created_at: "2026-05-28T10:00:00Z",
    });

    assert.equal(parsed.trust_summary.pb_personal_facet, 3);
    assert.equal(parsed.trust_summary.external_untrusted, 1);
  });
});
