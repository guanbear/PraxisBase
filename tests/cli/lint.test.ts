import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { lintCommand } from "@praxisbase/cli/commands/lint.js";

describe("lint CLI command", () => {
  it("runs lint on a clean workspace without errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-lint-clean-"));
    await initializeWorkspace(root);
    const output = await lintCommand(root, { json: true });
    const report = JSON.parse(output);
    assert.equal(report.type, "lint_report");
    assert.deepEqual(report.findings, []);

    const runDir = join(root, ".praxisbase/runs/lint");
    const runFiles = await readdir(runDir);
    assert.ok(runFiles.length >= 1, "expected lint run record");
  });

  it("detects errors and writes reports when lint finds issues", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-lint-err-"));
    await initializeWorkspace(root);

    await writeFile(
      join(root, "kb/known-fixes/no-frontmatter.md"),
      "## No frontmatter\nJust content.\n"
    );

    const output = await lintCommand(root, { json: true });
    const outputReport = JSON.parse(output);
    assert.equal(outputReport.type, "lint_report");

    const reportDir = join(root, ".praxisbase/reports/lint");
    const reportFiles = await readdir(reportDir);
    assert.ok(reportFiles.length >= 1);

    const report = JSON.parse(await readFile(join(reportDir, reportFiles[0]), "utf8"));
    assert.equal(report.type, "lint_report");

    const missingFm = report.findings.find(
      (f: { rule: string; path: string }) => f.rule === "missing_frontmatter" && f.path === "kb/known-fixes/no-frontmatter.md"
    );
    assert.ok(missingFm, "expected missing_frontmatter finding for no-frontmatter.md");
    assert.equal(missingFm.severity, "error");
  });

  it("writes conflict exception for duplicate ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-lint-conflict-"));
    await initializeWorkspace(root);

    const fm = `---
id: cli-dup-id
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
signatures:
  - cli:dup-a
sources:
  - uri: seed://test
    hash: sha256:seed
confidence: 0.6
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---
## A
`;

    await writeFile(join(root, "kb/known-fixes/dup-a.md"), fm);
    await writeFile(join(root, "kb/known-fixes/dup-b.md"), fm.replace("cli:dup-a", "cli:dup-b"));

    await lintCommand(root);

    const conflictDir = join(root, ".praxisbase/exceptions/conflicts");
    const conflictFiles = await readdir(conflictDir);
    assert.ok(conflictFiles.length >= 1, "expected conflict exception written to disk");
  });

  it("writes human-required exception for contradictions", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-lint-human-"));
    await initializeWorkspace(root);

    const knownFix = `---
id: cli-fix-contra
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
signatures:
  - cli:contra-sig
sources:
  - uri: seed://test
    hash: sha256:seed
confidence: 0.6
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---

## Fix

- restart the service

## Verification

Check service is running.
`;

    const pitfall = `---
id: cli-pitfall-contra
protocol_version: "0.1"
type: pitfall
knowledge_type: pitfall
scope: team
risk: high
status: published
signatures:
  - cli:contra-sig
summary: Do not restart.
forbidden_actions:
  - restart the service
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---

## Details

Restarting is dangerous.
`;

    await writeFile(join(root, "kb/known-fixes/cli-fix-contra.md"), knownFix);
    await writeFile(join(root, "kb/pitfalls/cli-pitfall-contra.md"), pitfall);

    await lintCommand(root);

    const excDir = join(root, ".praxisbase/exceptions/human-required");
    const excFiles = await readdir(excDir);
    const contraFiles: string[] = [];
    for (const f of excFiles) {
      const content = JSON.parse(await readFile(join(excDir, f), "utf8"));
      if (content.reason && content.reason.includes("Contradiction")) {
        contraFiles.push(f);
      }
    }
    assert.ok(contraFiles.length >= 1, "expected human-required exception for contradiction");
  });
});
