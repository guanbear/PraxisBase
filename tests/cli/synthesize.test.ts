import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { submitEpisode } from "@praxisbase/cli/commands/episode.js";
import { synthesizeSkillCommand } from "@praxisbase/cli/commands/synthesize.js";
import { ProposalSchema } from "@praxisbase/core/protocol/schemas.js";

describe("synthesize skill command", () => {
  it("generates skill proposal from submitted episodes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-synth-"));
    await initializeWorkspace(root);

    await submitEpisode(root, "tests/fixtures/k8s/episodes/oomkilled-confirmed.json");
    await submitEpisode(root, "tests/fixtures/k8s/episodes/oomkilled-confirmed-2.json");
    await submitEpisode(root, "tests/fixtures/k8s/episodes/oomkilled-confirmed-3.json");

    const output = await synthesizeSkillCommand(root, {
      signature: "k8s:pod-oomkilled",
      minEpisodes: 3,
      json: true,
    });

    const proposal = ProposalSchema.parse(JSON.parse(output));
    assert.equal(proposal.target_type, "skill");
    assert.ok(proposal.patch.content.includes("k8s:pod-oomkilled"));
  });

  it("throws when not enough matching episodes", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-synth-fail-"));
    await initializeWorkspace(root);

    await submitEpisode(root, "tests/fixtures/k8s/episodes/oomkilled-confirmed.json");

    await assert.rejects(
      synthesizeSkillCommand(root, {
        signature: "k8s:pod-oomkilled",
        minEpisodes: 3,
      }),
      /Not enough confirmed episodes/
    );
  });
});
