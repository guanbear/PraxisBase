import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { finishCapture, runDistill } from "@praxisbase/core";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

describe("runDistill", () => {
  it("converts successful captures into proposal drafts only", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-distill-"));
    await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      triggers: ["task_finish", "tests_run"],
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-1",
        sourceHash: "sha256:session1",
        redactedSummary: "User corrected a project convention and tests passed.",
      },
    });

    const report = await runDistill(root, { json: true });

    assert.equal(report.changed_stable_knowledge, false);
    assert.equal(report.proposal_candidates, 1);
    const proposals = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposals.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposals[0]), "utf8"));
    assert.equal(proposal.scope_hint, "personal");
    assert.equal(await exists(join(root, "kb")), false);
    assert.equal(await exists(join(root, "skills")), false);
  });

  it("writes human-required exceptions for privacy uncertainty", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-distill-"));
    await finishCapture(root, {
      agent: "codex",
      workspace: root,
      result: "success",
      triggers: ["task_finish"],
      artifact: {
        kind: "transcript",
        sourceRef: "raw-vault://codex/session-secret",
        sourceHash: "sha256:secret",
        redactedSummary: "This may include a token or cookie from debugging.",
      },
    });

    const report = await runDistill(root, { json: true });

    assert.equal(report.changed_stable_knowledge, false);
    assert.equal(report.exceptions, 1);
    assert.equal(report.proposal_candidates, 0);
    const exceptions = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.equal(exceptions.length, 1);
  });
});
