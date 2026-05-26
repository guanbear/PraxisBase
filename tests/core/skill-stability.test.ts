import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clusterSkillSignals } from "@praxisbase/core/synthesis/skill-stability.js";
import type { SkillSignalCandidate } from "@praxisbase/core/synthesis/skill-signals.js";

function signal(id: string, overrides: Partial<SkillSignalCandidate> = {}): SkillSignalCandidate {
  return {
    id,
    scope: "personal",
    trigger: "Need to import OpenClaw memory into PraxisBase",
    procedure: ["Export memory JSON.", "Verify hash.", "Import with provenance."],
    title: "OpenClaw memory import operations",
    source_ref: `raw-vault://codex/${id}`,
    source_hash: `sha256:${id}`,
    evidence_id: `sha256:chunk-${id}`,
    confidence: 0.88,
    cue_family: "verified_fix",
    related_wiki_paths: [],
    ...overrides,
  };
}

describe("clusterSkillSignals", () => {
  it("forms eligible clusters from repeated verified signals", () => {
    const clusters = clusterSkillSignals([signal("one"), signal("two")]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].source_count, 2);
  });

  it("keeps weak singletons below threshold unless explicit user correction is strong", () => {
    assert.equal(clusterSkillSignals([signal("one", { confidence: 0.7 })]).length, 0);
    assert.equal(clusterSkillSignals([signal("two", { confidence: 0.9, cue_family: "explicit_user_correction" })]).length, 1);
  });

  it("normalizes run ids and respects cluster budgets", () => {
    const clusters = clusterSkillSignals([
      signal("one", { trigger: "Fix run 12345 OpenClaw memory import" }),
      signal("two", { trigger: "Fix run 67890 OpenClaw memory import" }),
      signal("three", { title: "Other", trigger: "Other stable workflow", procedure: ["Use stable workflow."], confidence: 0.9 }),
      signal("four", { title: "Other", trigger: "Other stable workflow", procedure: ["Use stable workflow."], confidence: 0.9 }),
    ], { maxClusters: 1 });
    assert.equal(clusters.length, 1);
  });
});
