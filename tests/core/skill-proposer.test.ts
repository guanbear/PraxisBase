import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { proposeSkillCandidate } from "@praxisbase/core/synthesis/skill-proposer.js";
import type { SkillSignalCluster } from "@praxisbase/core/synthesis/skill-stability.js";
import type { StableSkillMatch } from "@praxisbase/core/synthesis/skill-inventory.js";

const now = "2026-05-26T00:00:00.000Z";
const cluster: SkillSignalCluster = {
  id: "skill_cluster_1",
  cluster_key: "key",
  title: "OpenClaw memory import operations",
  trigger: "Need to import OpenClaw memory into PraxisBase",
  procedure: ["Export memory JSON.", "Verify hash.", "Import with provenance."],
  source_refs: ["raw-vault://codex/1", "raw-vault://codex/2"],
  source_hashes: ["sha256:1", "sha256:2"],
  evidence_ids: ["sha256:c1", "sha256:c2"],
  source_count: 2,
  confidence: 0.91,
  scope: "personal",
  related_wiki_paths: ["kb/known-fixes/openclaw-memory-import.md"],
  cue_families: ["verified_fix"],
};

const match: StableSkillMatch = {
  strength: "strong",
  score: 0.8,
  reasons: ["same domain"],
  skill: {
    path: "skills/openclaw/openclaw-memory-operations/SKILL.md",
    slug: "openclaw-memory-operations",
    name: "OpenClaw memory operations",
    description: "Import memory.",
    scope: "personal",
    headings: [],
    when_to_use: "Import OpenClaw memory.",
    procedure: "Export and import.",
    pitfalls: "",
    provenance: "",
    related_wiki_paths: [],
    origin: "external_installed",
  },
};

describe("proposeSkillCandidate", () => {
  it("prefers updating an existing umbrella skill", async () => {
    const candidate = await proposeSkillCandidate({ cluster, matches: [match], now });
    assert.equal(candidate.action, "skill_update");
    assert.equal(candidate.existing_skill_path, match.skill.path);
  });

  it("creates class-level skills with required sections when no existing match exists", async () => {
    const candidate = await proposeSkillCandidate({ cluster, matches: [], now });
    assert.equal(candidate.action, "skill_create");
    assert.match(candidate.body_markdown, /## When To Use/);
    assert.match(candidate.body_markdown, /## Provenance/);
  });

  it("marks ambiguous strong matches for human merge/update review", async () => {
    const candidate = await proposeSkillCandidate({ cluster, matches: [match, { ...match, skill: { ...match.skill, path: "skills/openclaw/other/SKILL.md" } }], now });
    assert.ok(candidate.review_hint.risk_notes.includes("ambiguous_existing_skill_match"));
  });

  it("normalizes malformed generated procedure markdown before review", async () => {
    const candidate = await proposeSkillCandidate({
      cluster,
      matches: [],
      now,
      aiClient: {
        async generateJson() {
          return {
            ok: true as const,
            json: {
              action: "skill_create",
              title: "OpenClaw dispatch routing failures",
              body_markdown: [
                "---",
                "name: OpenClaw dispatch routing failures",
                "description: Fix dispatch failures",
                "scope: personal",
                "status: draft",
                "source_count: 2",
                "---",
                "# OpenClaw dispatch routing failures",
                "",
                "## When To Use",
                "Use when dispatch routing fails.",
                "",
                "## Procedure",
                "1. ### Diagnose the dispatch layer Check logs for stickyResult errors.",
                "2. Inspect route and transport metadata.",
                "3. Re-run the smoke test.",
                "",
                "## Verification",
                "- Smoke test passes.",
                "",
                "## Pitfalls",
                "- Do not debug product logic before dispatch health.",
                "",
                "## Do Not Use When",
                "- Failure is unrelated to dispatch.",
                "",
                "## Related Wiki Pages",
                "- [[kb/known-fixes/openclaw-dispatch-routing-failures.md]]",
                "",
                "## Provenance",
                "- raw-vault://codex/1 (sha256:1)",
              ].join("\n"),
            },
          };
        },
      },
    });

    assert.doesNotMatch(candidate.body_markdown, /^\d+\.\s+#{2,}/m);
    assert.match(candidate.body_markdown, /^### Diagnose the dispatch layer$/m);
    assert.match(candidate.body_markdown, /^\d+\.\s+Check logs for stickyResult errors\.$/m);
    assert.equal(candidate.review_hint.suggested_decision, "approve");
    assert.ok(!candidate.review_hint.risk_notes.some((note) => note.startsWith("skill_shape_invalid")));
  });

  it("classifies cause as skill_problem for durable fix patterns with confidence", async () => {
    const candidate = await proposeSkillCandidate({ cluster, matches: [match], now });
    assert.equal(candidate.action, "skill_update");
    assert.equal(candidate.cause_classification, "skill_problem");
  });

  it("classifies cause as agent_problem when trigger mentions agent misuse", async () => {
    const agentCluster: SkillSignalCluster = {
      ...cluster,
      trigger: "Agent failed to read correct guidance and misused tools",
      procedure: ["Agent ignored context overflow.", "Model hallucinated commands."],
      confidence: 0.91,
      source_count: 3,
    };
    const candidate = await proposeSkillCandidate({ cluster: agentCluster, matches: [], now });
    assert.equal(candidate.action, "skip");
    assert.equal(candidate.cause_classification, "agent_problem");
    assert.ok(candidate.review_hint.risk_notes.some((note) => note.includes("cause_classification:agent_problem")));
    assert.equal(candidate.review_hint.suggested_decision, "reject");
  });

  it("classifies cause as environment_problem for transient issues without reusable fix", async () => {
    const envCluster: SkillSignalCluster = {
      ...cluster,
      trigger: "Network timeout during API call",
      procedure: ["API call failed with timeout.", "Temporary outage."],
      confidence: 0.7,
      source_count: 2,
    };
    const candidate = await proposeSkillCandidate({ cluster: envCluster, matches: [], now });
    assert.equal(candidate.action, "skip");
    assert.equal(candidate.cause_classification, "environment_problem");
  });

  it("does not let AI create/update suggestions override skip classifications", async () => {
    const weakCluster: SkillSignalCluster = {
      ...cluster,
      confidence: 0.3,
      source_count: 1,
    };
    const candidate = await proposeSkillCandidate({
      cluster: weakCluster,
      matches: [match],
      now,
      aiClient: {
        async generateJson() {
          return {
            ok: true as const,
            json: {
              action: "skill_update",
              target_path: match.skill.path,
              title: "OpenClaw memory import operations",
              body_markdown: "# Should not be used",
            },
          };
        },
      },
    });

    assert.equal(candidate.action, "skip");
    assert.equal(candidate.cause_classification, "weak_signal");
    assert.equal(candidate.existing_skill_path, match.skill.path);
  });

  it("skips environment problems without reusable fixes even when an existing skill matches", async () => {
    const envCluster: SkillSignalCluster = {
      ...cluster,
      trigger: "Network timeout during API call",
      procedure: ["API call failed with timeout.", "Temporary outage."],
      confidence: 0.7,
      source_count: 2,
    };
    const candidate = await proposeSkillCandidate({ cluster: envCluster, matches: [match], now });
    assert.equal(candidate.action, "skip");
    assert.equal(candidate.cause_classification, "environment_problem");
  });

  it("classifies cause as weak_signal for low confidence or low source count", async () => {
    const weakCluster: SkillSignalCluster = {
      ...cluster,
      confidence: 0.3,
      source_count: 1,
    };
    const candidate = await proposeSkillCandidate({ cluster: weakCluster, matches: [], now });
    assert.equal(candidate.action, "skip");
    assert.equal(candidate.cause_classification, "weak_signal");
  });

  it("produces skill_optimize_description when AI suggests it", async () => {
    const candidate = await proposeSkillCandidate({
      cluster,
      matches: [match],
      now,
      aiClient: {
        async generateJson() {
          return {
            ok: true as const,
            json: {
              action: "skill_optimize_description",
              target_path: match.skill.path,
              title: "OpenClaw memory import operations",
              body_markdown: [
                "---",
                "name: OpenClaw memory import operations",
                "description: Import memory from OpenClaw exports into PraxisBase for durable experience capture",
                "scope: personal",
                "status: draft",
                "source_count: 2",
                "---",
                "# OpenClaw memory import operations",
                "",
                "## When To Use",
                "When importing OpenClaw memory.",
                "",
                "## Procedure",
                "1. Export memory JSON.",
                "2. Verify hash integrity.",
                "3. Import with provenance metadata.",
                "",
                "## Verification",
                "- Hash matches source.",
                "",
                "## Pitfalls",
                "- None known.",
                "",
                "## Do Not Use When",
                "- Memory is corrupted.",
                "",
                "## Related Wiki Pages",
                "- None",
                "",
                "## Provenance",
                "- raw-vault://codex/1 (sha256:1)",
              ].join("\n"),
            },
          };
        },
      },
    });
    assert.equal(candidate.action, "skill_optimize_description");
    assert.equal(candidate.ladder_choice, "skill_optimize_description");
    assert.equal(candidate.cause_classification, "skill_problem");
    assert.equal(candidate.existing_skill_path, match.skill.path);
  });

  it("allows environment_problem with reusable fix to become skill_update when matched", async () => {
    const envFixCluster: SkillSignalCluster = {
      ...cluster,
      trigger: "Network timeout during API call with retry fallback",
      procedure: ["API call failed with timeout.", "Applied retry with exponential backoff.", "Verified retry succeeds within 3 attempts."],
      confidence: 0.85,
      source_count: 3,
    };
    const candidate = await proposeSkillCandidate({ cluster: envFixCluster, matches: [match], now });
    assert.equal(candidate.action, "skill_update");
    assert.equal(candidate.cause_classification, "skill_problem");
  });

  it("skip candidate has empty body_markdown and minimal fields", async () => {
    const weakCluster: SkillSignalCluster = {
      ...cluster,
      confidence: 0.2,
      source_count: 1,
    };
    const candidate = await proposeSkillCandidate({ cluster: weakCluster, matches: [], now });
    assert.equal(candidate.action, "skip");
    assert.equal(candidate.body_markdown, "");
    assert.equal(candidate.ladder_choice, "skip");
    assert.match(candidate.summary, /Skipped:/);
  });
});
