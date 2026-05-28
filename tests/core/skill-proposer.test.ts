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
});
