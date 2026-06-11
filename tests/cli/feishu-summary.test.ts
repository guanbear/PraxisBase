import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { feishuSummaryCommand, feishuProposalDraftCommand } from "@praxisbase/cli/commands/feishu-summary.js";

describe("feishu-summary command", () => {
  it("returns valid Feishu card JSON from incident episode", async () => {
    const output = await feishuSummaryCommand(
      "tests/fixtures/k8s/episodes/oomkilled-confirmed.json",
      { json: true }
    );

    const parsed = JSON.parse(output);
    assert.equal(parsed.msg_type, "interactive");
    assert.ok(parsed.card);
    assert.ok(parsed.card.header.title.content.includes("k8s:pod-oomkilled"));
  });

  it("generates proposal draft JSON from episode and patch", async () => {
    const output = await feishuProposalDraftCommand(
      "tests/fixtures/k8s/episodes/oomkilled-confirmed.json",
      "kb/known-fixes/k8s-pod-oomkilled.md",
      "# K8s Pod OOMKilled\n\n## Fix\nRecommendation: increase memory.\n",
      { json: true },
    );

    const proposal = JSON.parse(output);
    assert.equal(proposal.type, "knowledge_proposal");
    assert.equal(proposal.target_type, "known_fix");
    assert.equal(proposal.patch.path, "kb/known-fixes/k8s-pod-oomkilled.md");
    assert.ok(proposal.evidence.source_hash.startsWith("sha256:"));
    assert.ok(proposal.evidence.source_uri.length > 0);
  });
});
