import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSkillDraft, generateSkillDraftsFromDistilledExperiences } from "@praxisbase/core/synthesis/skill.js";
import { ProposalSchema } from "@praxisbase/core/protocol/schemas.js";
import type { DistilledExperience } from "@praxisbase/core/ai/distill.js";

const confirmedEpisodes = [
  {
    summary: "Pod OOMKilled; memory limit 256Mi exceeded.",
    result: "confirmed",
    used_skills: ["skills/k8s/incident-triage/SKILL.md"],
    used_objects: [],
    source_refs: ["k8s-event://cluster-a/prod/order-api-123/OOMKilling"],
  },
  {
    summary: "Pod OOMKilled; same container hit memory ceiling.",
    result: "confirmed",
    used_skills: ["skills/k8s/incident-triage/SKILL.md"],
    used_objects: [],
    source_refs: ["k8s-event://cluster-a/prod/order-api-456/OOMKilling"],
  },
  {
    summary: "Pod OOMKilled after traffic spike.",
    result: "confirmed",
    used_skills: [],
    used_objects: [],
    source_refs: ["k8s-event://cluster-a/prod/order-api-789/OOMKilling"],
  },
];

describe("Skill synthesis", () => {
  it("generates a valid skill proposal from confirmed episodes", () => {
    const proposal = generateSkillDraft({
      signature: "k8s:pod-oomkilled",
      episodes: confirmedEpisodes,
    });

    const validated = ProposalSchema.parse(proposal);
    assert.equal(validated.target_type, "skill");
    assert.equal(validated.action, "create");
    assert.ok(validated.patch.path.startsWith("skills/"));
    assert.ok(validated.patch.content.includes("k8s:pod-oomkilled"));
    assert.ok(validated.patch.content.includes("When To Use"));
    assert.ok(validated.evidence.excerpt.includes("3 confirmed episodes"));
    assert.ok(validated.evidence.source_hash.startsWith("sha256:"));
    assert.ok(validated.evidence.source_hash.length > 10);
  });

  it("source_hash is deterministic for same episodes", () => {
    const a = generateSkillDraft({ signature: "k8s:pod-oomkilled", episodes: confirmedEpisodes });
    const b = generateSkillDraft({ signature: "k8s:pod-oomkilled", episodes: confirmedEpisodes });
    assert.equal(a.evidence.source_hash, b.evidence.source_hash);
  });

  it("throws when not enough confirmed episodes", () => {
    assert.throws(
      () =>
        generateSkillDraft({
          signature: "k8s:pod-oomkilled",
          episodes: confirmedEpisodes.slice(0, 2),
          minEpisodes: 3,
        }),
      /Not enough confirmed episodes/
    );
  });

  it("respects custom minEpisodes threshold", () => {
    const proposal = generateSkillDraft({
      signature: "k8s:pod-oomkilled",
      episodes: confirmedEpisodes.slice(0, 2),
      minEpisodes: 2,
    });

    assert.equal(proposal.target_type, "skill");
  });

  it("filters out non-confirmed episodes", () => {
    const mixed = [
      ...confirmedEpisodes.slice(0, 2),
      { summary: "Failed attempt.", result: "failed", used_skills: [], used_objects: [], source_refs: ["k8s://fail"] },
      confirmedEpisodes[2],
    ];

    const proposal = generateSkillDraft({
      signature: "k8s:pod-oomkilled",
      episodes: mixed,
    });

    assert.ok(proposal.patch.content.includes("confirmed episodes"));
    assert.ok(!proposal.patch.content.includes("Failed attempt"));
  });

  it("generated content is recommendation-only", () => {
    const proposal = generateSkillDraft({
      signature: "k8s:pod-oomkilled",
      episodes: confirmedEpisodes,
    });

    const content = proposal.patch.content.toLowerCase();
    assert.ok(content.includes("recommendation-only") || content.includes("reviewed and promoted"));
  });

  it("groups repeated distilled skill candidates by trigger and procedure", () => {
    const base: DistilledExperience = {
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:distilled1",
      chunk_hashes: ["sha256:chunk1"],
      agent: "codex",
      scope_hint: "project",
      summary: "OpenClaw auth refresh repair.",
      problem: "Auth refresh failed.",
      actions: ["Added retry guard."],
      failed_attempts: [],
      outcome: "success",
      verification: ["pnpm test passed"],
      reusable_lessons: ["Add retry guards around auth refresh repair paths."],
      risks: [],
      suggested_tags: ["openclaw", "auth"],
      suggested_wiki_kind: "known_fix",
      skill_candidate: {
        should_create: true,
        title: "OpenClaw auth refresh repair",
        trigger: "OpenClaw auth refresh failures",
        procedure: ["Check auth state.", "Run the retry guarded repair path."],
      },
      confidence: 0.91,
    };

    const proposals = generateSkillDraftsFromDistilledExperiences({
      minEvidence: 2,
      now: "2026-05-21T00:00:00.000Z",
      experiences: [
        base,
        { ...base, source_ref: "raw-vault://codex/session-2", source_hash: "sha256:distilled2", chunk_hashes: ["sha256:chunk2"] },
        { ...base, outcome: "failed", source_ref: "raw-vault://codex/session-3", source_hash: "sha256:distilled3", chunk_hashes: ["sha256:chunk3"] },
      ],
    });

    assert.equal(proposals.length, 1);
    const validated = ProposalSchema.parse(proposals[0]);
    assert.equal(validated.target_type, "skill");
    assert.match(validated.patch.path, /skills\/synthesized\/openclaw-auth-refresh-repair\/SKILL.md/);
    assert.match(validated.patch.content, /OpenClaw auth refresh failures/);
    assert.match(validated.patch.content, /Based on 2 distilled successful experiences/);
    assert.ok(!validated.patch.content.includes("session-3"));
  });
});
