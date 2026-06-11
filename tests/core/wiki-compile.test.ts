import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION } from "@praxisbase/core";
import { compileWiki } from "@praxisbase/core/wiki/compile.js";

async function writeCapture(root: string, summary: string, sourceHash = "sha256:session1", id = "capture_1"): Promise<void> {
  await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
  await writeFile(join(root, `.praxisbase/outbox/captures/${id}.json`), JSON.stringify({
    id,
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
        source_hash: sourceHash,
        redacted_summary: summary,
      },
    ],
    created_at: "2026-05-20T00:00:00.000Z",
  }));
}

describe("compileWiki", () => {
  it("dry-run writes a compile report and does not write proposals or stable knowledge", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await writeCapture(root, "Fixed OpenClaw auth expired by refreshing login.");

    const report = await compileWiki(root, { mode: "dry-run", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(report.changed_stable_knowledge, false);
    assert.equal(report.sources_read, 1);
    assert.equal(report.candidate_ids.length, 1);
    assert.equal(report.source_analysis[0].suggested_page_kind, "known_fix");
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "kb")), { code: "ENOENT" });
    await assert.rejects(() => stat(join(root, "skills")), { code: "ENOENT" });
  });

  it("review mode writes deterministic proposal candidates and skips unchanged sources", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await writeCapture(root, "Fixed OpenClaw auth expired by refreshing login.");

    const first = await compileWiki(root, { mode: "review", now: "2026-05-20T00:00:00.000Z" });
    const second = await compileWiki(root, { mode: "review", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(first.candidate_ids.length, 1);
    assert.equal(second.candidate_ids.length, 0);

    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposalFiles[0]), "utf8"));
    assert.equal(proposal.type, "wiki_proposal_candidate");
    assert.equal(proposal.changed_stable_knowledge, false);
    assert.equal(proposal.patch.path, "kb/known-fixes/openclaw-auth-expired.md");
    assert.ok(proposal.patch.content.includes("Fixed OpenClaw auth expired"));
  });

  it("curates repeated source evidence into one wiki proposal with multiple citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await writeCapture(root, "Fixed OpenClaw auth expired by refreshing login.", "sha256:session1", "capture_1");
    await writeCapture(root, "OpenClaw auth expired again; refreshing login fixed the repair.", "sha256:session2", "capture_2");

    const report = await compileWiki(root, { mode: "review", now: "2026-05-20T00:00:00.000Z" });

    assert.equal(report.candidate_ids.length, 1);
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposalFiles.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposalFiles[0]), "utf8"));
    assert.equal(proposal.patch.path, "kb/known-fixes/openclaw-auth-expired.md");
    assert.match(proposal.patch.content, /source_count: 2/);
    assert.match(proposal.patch.content, /raw-vault:\/\/codex\/session-1/);
    assert.match(proposal.patch.content, /sha256:session1/);
    assert.match(proposal.patch.content, /sha256:session2/);
  });

  it("does not turn raw session metadata JSON into wiki proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await writeCapture(
      root,
      JSON.stringify({
        timestamp: "2026-04-25T04:12:35.711Z",
        type: "session_meta",
        payload: {
          cwd: "/Users/example",
          originator: "Codex Desktop",
          base_instructions: { text: "You are Codex..." },
        },
      }),
      "sha256:session-meta",
      "capture_session_meta"
    );

    const report = await compileWiki(root, { mode: "review", now: "2026-05-20T00:00:00.000Z" });

    assert.equal(report.candidate_ids.length, 0);
    assert.equal(report.skipped_sources, 1);
    await assert.rejects(() => stat(join(root, ".praxisbase/inbox/proposals")), { code: "ENOENT" });
  });

  it("writes human-required exceptions for privacy uncertainty", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await writeCapture(root, "Token appeared in the logs.", "sha256:secret");

    const report = await compileWiki(root, { mode: "review", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(report.exceptions, 1);
    const files = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.equal(files.length, 1);
  });

  it("dry-run reports privacy exceptions without writing exception files", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await writeCapture(root, "Token appeared in the logs.", "sha256:secret");

    const report = await compileWiki(root, { mode: "dry-run", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(report.exceptions, 1);
    await assert.rejects(() => stat(join(root, ".praxisbase/exceptions/human-required")), { code: "ENOENT" });
  });

  it("keeps personal sources personal instead of skipping them", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await mkdir(join(root, ".praxisbase/outbox/captures"), { recursive: true });
    await writeFile(join(root, ".praxisbase/outbox/captures/capture_1.json"), JSON.stringify({
      id: "capture_1",
      protocol_version: PROTOCOL_VERSION,
      type: "capture_record",
      agent: "codex",
      workspace: root,
      scope_hint: "personal",
      result: "success",
      triggers: ["task_finish"],
      signals: [],
      artifacts: [
        {
          kind: "transcript",
          source_ref: "raw-vault://codex/session-1",
          source_hash: "sha256:session1",
          redacted_summary: "Remember local editor preference.",
        },
      ],
      created_at: "2026-05-20T00:00:00.000Z",
    }));

    const report = await compileWiki(root, { mode: "review", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(report.candidate_ids.length, 1);
    assert.equal(report.source_analysis[0].scope, "personal");
    const proposalFiles = await readdir(join(root, ".praxisbase/inbox/proposals"));
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposalFiles[0]), "utf8"));
    assert.ok(proposal.patch.content.includes("scope: personal"));
  });

  it("scans stable markdown bodies for private material", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await mkdir(join(root, "kb/notes"), { recursive: true });
    await writeFile(join(root, "kb/notes/token-note.md"), `---
id: token-note
scope: project
knowledge_type: note
maturity: draft
---
# Token Note

The body contains user token abc.
`);

    const report = await compileWiki(root, { mode: "review", now: "2026-05-20T00:00:00.000Z" });
    assert.equal(report.candidate_ids.length, 0);
    assert.equal(report.exceptions, 1);
    const files = await readdir(join(root, ".praxisbase/exceptions/human-required"));
    assert.equal(files.length, 1);
  });

  it("routes duplicate candidate paths without shared signatures to conflict exceptions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-compile-"));
    await writeCapture(root, "Procedure: restart worker service after deployment hangs.", "sha256:session1", "capture_1");
    await writeCapture(root, "Procedure: restart worker service when queue stalls.", "sha256:session2", "capture_2");

    const report = await compileWiki(root, { mode: "review", now: "2026-05-20T00:00:00.000Z" });

    assert.equal(report.candidate_ids.length, 1);
    assert.equal(report.exceptions, 1);
    const files = await readdir(join(root, ".praxisbase/exceptions/conflicts"));
    assert.equal(files.length, 1);
  });
});
