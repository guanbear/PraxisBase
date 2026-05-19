import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { submitEpisode } from "@praxisbase/cli/commands/episode.js";
import { submitProposal } from "@praxisbase/cli/commands/propose.js";
import { reviewAuto } from "@praxisbase/cli/commands/review.js";
import { promoteAuto } from "@praxisbase/cli/commands/promote.js";

describe("K8s incident intake and review flow", () => {
  it("accepts K8s incident episode via submit", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-intake-"));
    await initializeWorkspace(root);

    await submitEpisode(root, "tests/fixtures/k8s/episodes/oomkilled-confirmed.json");

    const stored = await readFile(
      join(root, ".praxisbase/inbox/episodes/episode_20260518_k8s_oomkilled.json"),
      "utf8"
    );
    const parsed = JSON.parse(stored);
    assert.equal(parsed.type, "incident_episode");
    assert.equal(parsed.result, "confirmed");
    assert.ok(parsed.source_refs.length > 0);
  });

  it("writes K8s incident episode to outbox with --offline-ok", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-outbox-"));
    await initializeWorkspace(root);

    await submitEpisode(root, "tests/fixtures/k8s/episodes/oomkilled-confirmed.json", {
      offlineOk: true,
    });

    const stored = await readFile(
      join(root, ".praxisbase/outbox/episodes/episode_20260518_k8s_oomkilled.json"),
      "utf8"
    );
    const parsed = JSON.parse(stored);
    assert.equal(parsed.idempotency_key, "episode_20260518_k8s_oomkilled");
  });

  it("rejects K8s incident episode without source_refs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-reject-"));
    await initializeWorkspace(root);

    await assert.rejects(
      submitEpisode(root, "tests/fixtures/k8s/episodes/no-source-refs.json")
    );
  });

  it("reviews and promotes K8s known-fix proposal", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-k8s-promote-"));
    await initializeWorkspace(root);

    await submitProposal(root, "tests/fixtures/k8s/proposals/oomkilled-known-fix.json");
    await reviewAuto(root);

    const review = JSON.parse(
      await readFile(
        join(root, ".praxisbase/inbox/reviews/review_proposal_20260518_k8s_oomkilled.json"),
        "utf8"
      )
    );
    assert.equal(review.decision, "approve");

    await promoteAuto(root);
    const promoted = await readFile(
      join(root, "kb/known-fixes/k8s-pod-oomkilled.md"),
      "utf8"
    );
    assert.ok(promoted.includes("K8s Pod OOMKilled"));
  });
});
