import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSkillDraft, generateSkillDraftsFromDistilledExperiences, synthesizeSkillCandidates } from "@praxisbase/core/synthesis/skill.js";
import { ProposalSchema } from "@praxisbase/core/protocol/schemas.js";
import type { DistilledExperience } from "@praxisbase/core/ai/distill.js";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("synthesizes reviewed skill candidates without writing stable skills", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-skill-synthesis-api-"));
    await mkdir(join(root, "skills"), { recursive: true });
    const base: DistilledExperience = {
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:distilled1",
      chunk_hashes: ["sha256:chunk1"],
      agent: "codex",
      scope_hint: "personal",
      summary: "OpenClaw memory import repair.",
      problem: "OpenClaw memory import needed provenance.",
      actions: ["Exported memory JSON.", "Verified hash.", "Imported with provenance."],
      failed_attempts: [],
      outcome: "success",
      verification: ["pnpm test passed"],
      reusable_lessons: ["Export memory, verify hash, then import with provenance."],
      risks: [],
      suggested_tags: ["openclaw"],
      suggested_wiki_kind: "procedure",
      skill_candidate: {
        should_create: true,
        title: "OpenClaw memory import operations",
        trigger: "Need to import OpenClaw memory into PraxisBase",
        procedure: ["Export memory JSON.", "Verify hash.", "Import with provenance."],
      },
      confidence: 0.91,
    };

    const result = await synthesizeSkillCandidates(root, {
      mode: "review",
      authorityMode: "personal-local",
      now: "2026-05-26T00:00:00.000Z",
      experiences: [
        base,
        { ...base, source_ref: "raw-vault://codex/session-2", source_hash: "sha256:distilled2", chunk_hashes: ["sha256:chunk2"] },
      ],
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "semantic_skill_review") {
            return {
              ok: true,
              json: {
                decision: "approve_candidate",
                quality_score: 0.91,
                class_level: true,
                actionable: true,
                reusable: true,
                safe_for_future_agents: true,
                evidence_support: "strong",
                should_update_existing: null,
                fatal_issues: [],
                missing_requirements: [],
                reason: "Durable class-level agent skill.",
                reviewed_at: "2026-05-26T00:00:00.000Z",
              },
            };
          }
          return { ok: true, json: {} };
        },
      },
    });

    assert.equal(result.report.signals, 2);
    assert.equal(result.report.candidates, 1);
    assert.equal(result.report.approved, 1);
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(await readdir(join(root, "skills")), []);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
    const reviewFiles = await readdir(join(root, ".praxisbase/inbox/reviews"));
    assert.equal(reviewFiles.length, 1);
    assert.match(reviewFiles[0], /^semantic_skill_review_/);
  });

  it("reports low-signal skill signals rejected by stability clustering", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-skill-synthesis-rejected-signals-"));
    const result = await synthesizeSkillCandidates(root, {
      mode: "dry-run",
      authorityMode: "personal-local",
      now: "2026-05-26T00:00:00.000Z",
      experiences: [{
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:distilled1",
        chunk_hashes: ["sha256:chunk1"],
        agent: "codex",
        scope_hint: "personal",
        summary: "OpenClaw memory import repair.",
        problem: "OpenClaw memory import needed provenance.",
        actions: ["Exported memory JSON.", "Verified hash.", "Imported with provenance."],
        failed_attempts: [],
        outcome: "success",
        verification: ["pnpm test passed"],
        reusable_lessons: ["Export memory, verify hash, then import with provenance."],
        risks: [],
        suggested_tags: ["openclaw"],
        suggested_wiki_kind: "procedure",
        skill_candidate: {
          should_create: true,
          title: "OpenClaw memory import operations",
          trigger: "Need to import OpenClaw memory into PraxisBase",
          procedure: ["Export memory JSON.", "Verify hash.", "Import with provenance."],
        },
        confidence: 0.8,
      }],
    });

    assert.equal(result.report.signals, 1);
    assert.equal(result.report.clusters, 0);
    assert.equal(result.report.rejected_signals, 1);
    assert.equal(result.report.candidates, 0);
  });

  it("keeps semantic skill review failure reason on human-required candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-skill-synthesis-unavailable-"));
    const base: DistilledExperience = {
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:distilled1",
      chunk_hashes: ["sha256:chunk1"],
      agent: "codex",
      scope_hint: "personal",
      summary: "OpenClaw memory import repair.",
      problem: "OpenClaw memory import needed provenance.",
      actions: ["Exported memory JSON.", "Verified hash.", "Imported with provenance."],
      failed_attempts: [],
      outcome: "success",
      verification: ["pnpm test passed"],
      reusable_lessons: ["Export memory, verify hash, then import with provenance."],
      risks: [],
      suggested_tags: ["openclaw"],
      suggested_wiki_kind: "procedure",
      skill_candidate: {
        should_create: true,
        title: "OpenClaw memory import operations",
        trigger: "Need to import OpenClaw memory into PraxisBase",
        procedure: ["Export memory JSON.", "Verify hash.", "Import with provenance."],
      },
      confidence: 0.91,
    };

    const result = await synthesizeSkillCandidates(root, {
      mode: "review",
      authorityMode: "personal-local",
      now: "2026-05-26T00:00:00.000Z",
      experiences: [
        base,
        { ...base, source_ref: "raw-vault://codex/session-2", source_hash: "sha256:distilled2", chunk_hashes: ["sha256:chunk2"] },
      ],
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "semantic_skill_review") {
            return { ok: false, error: "review model unavailable" };
          }
          return { ok: true, json: {} };
        },
      },
    });

    assert.equal(result.report.reviewed, 0);
    assert.equal(result.report.needs_human, 1);
    assert.ok(result.candidates[0].review_hint.risk_notes.includes("semantic_skill_review:unavailable"));
    assert.ok(result.candidates[0].review_hint.risk_notes.includes("semantic_skill_review_unavailable:provider_error:review model unavailable"));
  });

  it("uses stable wiki procedures as conservative skill synthesis signals", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-skill-synthesis-wiki-"));
    await mkdir(join(root, "kb/procedures"), { recursive: true });
    await writeFile(join(root, "kb/procedures/openclaw-memory-import.md"), `---
id: openclaw-memory-import
protocol_version: "0.1"
type: procedure
knowledge_type: procedure
scope: personal
maturity: verified
sources:
  - uri: raw-vault://codex/session-1
    hash: sha256:source1
  - uri: raw-vault://codex/session-2
    hash: sha256:source2
updated_at: "2026-05-26T00:00:00.000Z"
---
# OpenClaw memory import

## When To Use
Use when importing OpenClaw memory into PraxisBase.

## Procedure
1. Export memory JSON.
2. Verify hash.
3. Import with provenance.

## Verification
- Daily smoke passed.
`, "utf8");

    const result = await synthesizeSkillCandidates(root, {
      mode: "review",
      authorityMode: "personal-local",
      now: "2026-05-26T00:00:00.000Z",
      experiences: [],
      aiClient: {
        async generateJson(input) {
          if (input.schemaName === "semantic_skill_review") {
            return { ok: true, json: {
              decision: "approve_candidate",
              quality_score: 0.91,
              class_level: true,
              actionable: true,
              reusable: true,
              safe_for_future_agents: true,
              evidence_support: "strong",
              should_update_existing: null,
              fatal_issues: [],
              missing_requirements: [],
              reason: "Stable wiki procedure has repeated provenance.",
              reviewed_at: "2026-05-26T00:00:00.000Z",
            } };
          }
          return { ok: true, json: {} };
        },
      },
    });

    assert.equal(result.report.signals, 2);
    assert.equal(result.report.candidates, 1);
    assert.equal(result.candidates[0].related_wiki_paths[0], "kb/procedures/openclaw-memory-import.md");
  });
});
