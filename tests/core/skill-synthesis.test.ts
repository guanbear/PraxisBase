import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSkillDraft } from "@praxisbase/core/synthesis/skill.js";
import { ProposalSchema } from "@praxisbase/core/protocol/schemas.js";

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
});
