import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION } from "@praxisbase/core";
import { compileWiki } from "@praxisbase/core/wiki/compile.js";

async function writeDistilledRef(root: string, kind = "known_fix"): Promise<void> {
  await mkdir(join(root, ".praxisbase/raw-vault/refs"), { recursive: true });
  await writeFile(join(root, ".praxisbase/raw-vault/refs/ref_1.json"), JSON.stringify({
    id: "ref_1",
    protocol_version: PROTOCOL_VERSION,
    type: "raw_vault_ref",
    agent: "codex",
    kind: "codex_session",
    source_ref: "raw-vault://codex/session-1",
    source_hash: "sha256:distilled1",
    scope_hint: "project",
    redacted_summary: [
      `Suggested Wiki Kind: ${kind}`,
      "Confidence: 0.93",
      "Summary: OpenClaw auth refresh retry guard",
      "",
      "## Problem",
      "- OpenClaw auth refresh could fail without a retry guard.",
      "",
      "## Context",
      "- The repair path handles expired credentials.",
      "",
      "## Actions",
      "- Added retry guard around auth refresh.",
      "",
      "## Failed Attempts",
      "- Direct retry without state reset was inconclusive.",
      "",
      "## Verification",
      "- pnpm test passed.",
      "",
      "## Reusable Lessons",
      "- Add retry guards around auth refresh repair paths.",
      "",
      "## Risks",
      "- Keep sensitive material out of shared logs.",
      "",
      "## Sources",
      "- raw-vault://codex/session-1",
      "- sha256:distilled1",
    ].join("\n"),
    created_at: "2026-05-21T00:00:00.000Z",
  }), "utf8");
}

describe("wiki AI distill proposals", () => {
  it("uses distilled kind, confidence, sections, and citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-wiki-ai-"));
    await writeDistilledRef(root, "known_fix");

    const report = await compileWiki(root, { mode: "review", now: "2026-05-21T01:00:00.000Z" });

    assert.equal(report.candidate_ids.length, 1);
    assert.equal(report.source_analysis[0].suggested_page_kind, "known_fix");
    assert.equal(report.source_analysis[0].confidence, 0.93);

    const files = await readdir(join(root, ".praxisbase/inbox/proposals"));
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", files[0]), "utf8"));
    assert.equal(proposal.patch.path, "kb/known-fixes/openclaw-auth-retry-guard.md");
    assert.match(proposal.patch.content, /knowledge_type: known_fix/);
    assert.match(proposal.patch.content, /## Problem/);
    assert.match(proposal.patch.content, /## Actions/);
    assert.match(proposal.patch.content, /## Failed Attempts/);
    assert.match(proposal.patch.content, /## Verification/);
    assert.match(proposal.patch.content, /## Reusable Lessons/);
    assert.match(proposal.patch.content, /## Risks/);
    assert.match(proposal.patch.content, /raw-vault:\/\/codex\/session-1/);
  });
});
