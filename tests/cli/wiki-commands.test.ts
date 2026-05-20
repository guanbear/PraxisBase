import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION } from "@praxisbase/core";
import { wikiCommand } from "@praxisbase/cli/commands/wiki.js";

async function writeCapture(root: string): Promise<void> {
  await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
  await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
    id: "capture_1",
    protocol_version: PROTOCOL_VERSION,
    type: "capture_record",
    agent: "codex",
    workspace: root,
    scope_hint: "project",
    result: "success",
    triggers: ["task_finish"],
    signals: [],
    artifacts: [
      {
        kind: "transcript",
        source_ref: "raw-vault://codex/session-1",
        source_hash: "sha256:session1",
        redacted_summary: "Fixed OpenClaw auth expired by refreshing login.",
      },
    ],
    created_at: "2026-05-20T00:00:00.000Z",
  }));
}

describe("wiki CLI commands", () => {
  it("wiki compile --dry-run --json writes only a report", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-wiki-"));
    await writeCapture(root);

    const output = await wikiCommand(root, "compile", { dryRun: true, json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.mode, "dry-run");
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
  });

  it("wiki compile --review --json writes proposal candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-wiki-"));
    await writeCapture(root);

    const output = await wikiCommand(root, "compile", { review: true, json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.mode, "review");
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
  });

  it("wiki graph and build-site return JSON reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-wiki-site-"));
    await mkdir(join(root, "kb/notes"), { recursive: true });
    await writeFile(join(root, "kb/notes/wiki-auth.md"), `---
id: wiki-auth
type: note
scope: team
maturity: draft
---
# Wiki Auth

Auth note.
`);

    const graphOutput = await wikiCommand(root, "graph", { json: true });
    const graphParsed = JSON.parse(graphOutput);
    assert.equal(graphParsed.ok, true);
    assert.equal(graphParsed.graph.nodes.length, 1);

    const siteOutput = await wikiCommand(root, "build-site", { json: true });
    const siteParsed = JSON.parse(siteOutput);
    assert.equal(siteParsed.ok, true);
    assert.ok(siteParsed.result.outputs.includes("dist/index.html"));
  });
});
