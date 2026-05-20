import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  containsPrivateMaterial,
  isAllowedWikiPatchPath,
  validateBodyShrink,
} from "@praxisbase/core/wiki/lint.js";

describe("wiki lint guards", () => {
  it("rejects unsafe patch paths and raw/private candidate text", () => {
    assert.equal(isAllowedWikiPatchPath("kb/notes/wiki-auth.md"), true);
    assert.equal(isAllowedWikiPatchPath("skills/openclaw/auth/SKILL.md"), true);
    assert.equal(isAllowedWikiPatchPath("../outside.md"), false);
    assert.equal(isAllowedWikiPatchPath(".praxisbase/raw-vault/session.json"), false);
    assert.equal(containsPrivateMaterial("user token abc was present"), true);
    assert.equal(containsPrivateMaterial("normal redacted summary"), false);
  });

  it("enforces merge body shrink threshold", () => {
    assert.equal(validateBodyShrink("a ".repeat(100), "b ".repeat(80), "patch").ok, true);
    assert.equal(validateBodyShrink("a ".repeat(100), "b ".repeat(20), "patch").ok, false);
    assert.equal(validateBodyShrink("a ".repeat(100), "archived", "archive").ok, true);
  });
});
