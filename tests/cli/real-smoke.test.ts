import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { smokeCommand } from "@praxisbase/cli/commands/smoke.js";

describe("real wiki smoke CLI", () => {
  it("runs ingest through wiki site and context without stable knowledge mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-real-smoke-"));
    const source = join(root, "session-1.txt");
    await writeFile(source, "Implemented wiki compile workflow. pnpm check passed.");

    const output = await smokeCommand(root, "real-wiki", {
      agent: "codex",
      sources: [source],
      query: "wiki compile",
      json: true,
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.changed_stable_knowledge, false);
    assert.equal(parsed.report.imported, 1);
    assert.ok(parsed.report.proposal_candidates >= 1);
    assert.ok(parsed.report.graph_nodes >= 0);
    assert.ok(parsed.report.outputs.includes("dist/index.html"));
    await assert.doesNotReject(() => stat(join(root, "dist/index.html")));
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });
});
