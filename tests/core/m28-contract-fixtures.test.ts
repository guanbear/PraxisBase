import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AnyEpisodeSchema, ProposalSchema } from "@praxisbase/core";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("M28 contract fixtures", () => {
  it("keeps the repair episode fixture schema-valid with knowledge references", async () => {
    const episode = AnyEpisodeSchema.parse(
      await readJson("tests/fixtures/m28/openclaw/episodes/dispatch-routing-success.json")
    );

    assert.equal(episode.type, "repair_episode");
    assert.equal(episode.scope, "team");
    assert.equal(episode.problem_signature, "openclaw:dispatch-routing-failure");
    assert.equal(episode.knowledge_references.length, 1);
  });

  it("keeps the known-fix proposal fixture schema-valid for team review", async () => {
    const proposal = ProposalSchema.parse(
      await readJson("tests/fixtures/m28/openclaw/proposals/dispatch-routing-known-fix-patch.json")
    );

    assert.equal(proposal.scope, "team");
    assert.equal(proposal.target_type, "known_fix");
    assert.equal(proposal.patch.path, "kb/known-fixes/openclaw-dispatch-routing-failures.md");
  });
});
