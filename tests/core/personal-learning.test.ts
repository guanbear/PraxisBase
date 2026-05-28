import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MANAGED_PROFILE_END,
  MANAGED_PROFILE_START,
  applyPersonalFacetOverride,
  normalizePersonalFacets,
  personalFacetCandidatesFromImportedRecord,
  personalFacetCandidatesFromManualInstruction,
  renderManagedPersonalProfile,
  scorePersonalFacet,
} from "@praxisbase/core/experience/personal-learning.js";

describe("personal learning cache", () => {
  it("scores repeated explicit facets as active and weak facets as provisional", () => {
    const active = scorePersonalFacet({
      facet_class: "tooling",
      key: "package_manager",
      value: "pnpm",
      cue_family: "explicit",
      evidence_count: 4,
      last_seen: "2026-05-28T00:00:00.000Z",
    }, { now: "2026-05-28T00:00:00.000Z" });
    const provisional = scorePersonalFacet({
      facet_class: "style",
      key: "tone",
      value: "brief",
      cue_family: "behavioral",
      evidence_count: 1,
      last_seen: "2026-04-01T00:00:00.000Z",
    }, { now: "2026-05-28T00:00:00.000Z" });

    assert.equal(active.state, "active");
    assert.equal(provisional.state, "provisional");
    assert.ok(active.stability > provisional.stability);
  });

  it("lets pinned and forgotten user overrides win over automatic scoring", () => {
    const facet = scorePersonalFacet({
      facet_class: "style",
      key: "verbosity",
      value: "concise",
      cue_family: "behavioral",
      evidence_count: 1,
      last_seen: "2026-05-28T00:00:00.000Z",
    }, { now: "2026-05-28T00:00:00.000Z" });

    assert.equal(applyPersonalFacetOverride(facet, "pinned").state, "pinned");
    assert.equal(applyPersonalFacetOverride(facet, "forgotten").state, "forgotten");
  });

  it("renders a managed profile block while preserving user-authored content", () => {
    const existing = "# Personal notes\n\nKeep this line.\n";
    const output = renderManagedPersonalProfile(existing, [{
      id: "facet-style-verbosity",
      facet_class: "style",
      key: "verbosity",
      value: "concise",
      state: "active",
      stability: 0.9,
      evidence_count: 3,
      evidence_refs: [],
      first_seen: "2026-05-01T00:00:00.000Z",
      last_seen: "2026-05-28T00:00:00.000Z",
      user_override: "none",
    }]);

    assert.match(output, /Keep this line/);
    assert.match(output, new RegExp(MANAGED_PROFILE_START));
    assert.match(output, /style\.verbosity: concise/);
    assert.match(output, new RegExp(MANAGED_PROFILE_END));
    assert.doesNotMatch(output, /evidence_refs/);
  });

  it("applies class budgets and keeps forgotten overrides across repeated evidence", () => {
    const facets = normalizePersonalFacets([
      scorePersonalFacet({
        facet_class: "style",
        key: "verbosity",
        value: "concise",
        cue_family: "explicit",
        evidence_count: 4,
        user_override: "forgotten",
      }, { now: "2026-05-28T00:00:00.000Z" }),
      scorePersonalFacet({
        facet_class: "style",
        key: "verbosity",
        value: "verbose",
        cue_family: "explicit",
        evidence_count: 5,
      }, { now: "2026-05-28T00:00:00.000Z" }),
      ...Array.from({ length: 6 }, (_, index) => scorePersonalFacet({
        facet_class: "style" as const,
        key: `style-${index}`,
        value: `style ${index}`,
        cue_family: "explicit",
        evidence_count: 6,
      }, { now: "2026-05-28T00:00:00.000Z" })),
    ]);

    assert.equal(facets.find((facet) => facet.key === "verbosity")?.state, "forgotten");
    assert.equal(facets.filter((facet) => facet.facet_class === "style" && facet.state === "active").length, 4);
    assert.ok(facets.some((facet) => facet.facet_class === "style" && facet.state === "provisional"));
  });

  it("produces personal candidates from explicit manual instructions", () => {
    const candidates = personalFacetCandidatesFromManualInstruction("以后默认用 pnpm 跑测试", {
      now: "2026-05-28T00:00:00.000Z",
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].facet_class, "tooling");
    assert.match(candidates[0].value, /pnpm/);
  });

  it("imports sidecar/profile records only as personal candidates", () => {
    const personal = personalFacetCandidatesFromImportedRecord({
      scope: "personal",
      summary: "Always use pnpm for local verification",
      source_ref: "agentmemory://memory/1",
    }, { now: "2026-05-28T00:00:00.000Z" });
    const team = personalFacetCandidatesFromImportedRecord({
      scope: "team",
      summary: "Always use pnpm for local verification",
      source_ref: "agentmemory://memory/2",
    });

    assert.equal(personal.length, 1);
    assert.equal(personal[0].cue_family, "structural");
    assert.deepEqual(team, []);
  });
});
