import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeStableSlug, uniqueStableSlugs } from "@praxisbase/core/protocol/slug.js";

describe("stable slug normalization", () => {
  it("normalizes titles to capped kebab-case slugs", () => {
    const slug = normalizeStableSlug("Missing replay data compromises the ability to debug or verify past execution behaviors");

    assert.equal(slug, "missing-replay-data-compromises-the-ability-to-debug-or-verify-past-execution");
    assert.ok(slug.length <= 80);
    assert.doesNotMatch(slug, /[^a-z0-9-]/);
  });

  it("adds deterministic suffixes when capped slugs collide", () => {
    const values = uniqueStableSlugs([
      "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu one",
      "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu two",
      "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu two",
    ]);

    assert.equal(values[0], "alpha-beta-gamma-delta-epsilon-zeta-eta-theta-iota-kappa-lambda-mu-one");
    assert.equal(values[1], "alpha-beta-gamma-delta-epsilon-zeta-eta-theta-iota-kappa-lambda-mu-two");
    assert.equal(values[2], "alpha-beta-gamma-delta-epsilon-zeta-eta-theta-iota-kappa-lambda-mu-two-2");
    assert.ok(values.every((slug) => slug.length <= 80));
  });
});
