import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { lintWorkspace } from "@praxisbase/core/lint/index.js";

const VALID_KNOWN_FIX_FRONTMATTER = `---
id: test-fix-1
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
maturity: draft
signatures:
  - test:fix-sig
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

## Symptoms

Test symptoms.

## Fix

- Fix step one
- Fix step two

## Verification

Verify it works.
`;

const VALID_PITFALL_FRONTMATTER = `---
id: test-pitfall-1
protocol_version: "0.1"
type: pitfall
knowledge_type: pitfall
scope: team
risk: high
status: published
maturity: draft
signatures:
  - test:fix-sig
summary: Do not do the bad thing.
forbidden_actions:
  - fix step one
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---

## Details

This is a pitfall.
`;

describe("lint engine", () => {
  it("passes a clean workspace with no findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-clean-"));
    await initializeWorkspace(root);
    const result = await lintWorkspace(root);
    assert.deepEqual(result.report.findings, []);
    assert.equal(result.runRecord.command, "lint");
    assert.equal(result.runRecord.protocol_version, "0.1");
  });

  it("detects missing frontmatter on kb markdown files", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-nofm-"));
    await initializeWorkspace(root);

    await writeFile(
      join(root, "kb/known-fixes/no-frontmatter.md"),
      "## Just content\nNo frontmatter here.\n"
    );

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find(
      (f) => f.rule === "missing_frontmatter" && f.path === "kb/known-fixes/no-frontmatter.md"
    );
    assert.ok(finding, "expected missing_frontmatter finding");
    assert.equal(finding.severity, "error");
  });

  it("detects invalid frontmatter on malformed YAML", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-badfm-"));
    await initializeWorkspace(root);

    await writeFile(
      join(root, "kb/known-fixes/bad-frontmatter.md"),
      "---\nid: [unterminated\n---\n## Content\n"
    );

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find(
      (f) => f.rule === "invalid_frontmatter" && f.path === "kb/known-fixes/bad-frontmatter.md"
    );
    assert.ok(finding, "expected invalid_frontmatter finding");
    assert.equal(finding.severity, "error");
  });

  it("detects missing governance metadata fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-nogov-"));
    await initializeWorkspace(root);

    await writeFile(
      join(root, "kb/known-fixes/partial-metadata.md"),
      `---
id: partial-fix
type: known_fix
---
## Content
`
    );

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find(
      (f) => f.rule === "missing_governance_metadata" && f.path === "kb/known-fixes/partial-metadata.md"
    );
    assert.ok(finding, "expected missing_governance_metadata finding");
    assert.equal(finding.severity, "error");
    assert.ok(finding.message.includes("protocol_version"));
    assert.ok(finding.message.includes("knowledge_type"));
  });

  it("detects published or proven knowledge without evidence source hash", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-noevidence-"));
    await initializeWorkspace(root);

    await writeFile(
      join(root, "kb/known-fixes/published-no-source.md"),
      `---
id: published-no-source
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: published
maturity: proven
signatures:
  - test:no-evidence
sources: []
confidence: 0.8
reference_count: 5
last_referenced_at: 2026-05-17T00:00:00Z
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---
## Fix

- Do something safe.
`
    );

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find(
      (f) => f.rule === "missing_evidence_source" && f.path === "kb/known-fixes/published-no-source.md"
    );
    assert.ok(finding, "expected missing_evidence_source finding");
    assert.equal(finding.severity, "error");
  });

  it("detects raw log-like content under kb/", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-rawlog-"));
    await initializeWorkspace(root);

    await writeFile(
      join(root, "kb/known-fixes/raw-log.md"),
      `---
id: raw-log-fix
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
signatures:
  - test:raw-log
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
2026-05-17T10:00:00Z ERROR Something went wrong
2026-05-17T10:00:01Z WARN Trying again
2026-05-17T10:00:02Z INFO Succeeded
`
    );

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find(
      (f) => f.rule === "raw_log_content" && f.path === "kb/known-fixes/raw-log.md"
    );
    assert.ok(finding, "expected raw_log_content finding");
    assert.equal(finding.severity, "error");
  });

  it("detects duplicate ids and writes conflict exception", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-dupid-"));
    await initializeWorkspace(root);

    const frontmatter = `---
id: dup-id-fix
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
signatures:
  - test:dup-a
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
## Content A
`;

    await writeFile(join(root, "kb/known-fixes/dup-a.md"), frontmatter);
    const frontmatterB = frontmatter.replace("test:dup-a", "test:dup-b");
    await writeFile(join(root, "kb/known-fixes/dup-b.md"), frontmatterB);

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find((f) => f.rule === "duplicate_id");
    assert.ok(finding, "expected duplicate_id finding");
    assert.equal(finding.severity, "error");
    assert.ok(finding.message.includes("dup-id-fix"));

    const conflictExceptions = result.exceptions.filter((e) => e.category === "conflict");
    assert.ok(conflictExceptions.length >= 1, "expected at least one conflict exception");

    const conflictDir = join(root, ".praxisbase/exceptions/conflicts");
    const conflictFiles = await readdir(conflictDir);
    assert.ok(conflictFiles.length >= 1, "expected conflict exception file written to disk");
  });

  it("detects duplicate signatures as warnings", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-dupsig-"));
    await initializeWorkspace(root);

    const fixA = `---
id: fix-a
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
signatures:
  - test:shared-sig
sources:
  - uri: seed://a
    hash: sha256:aaa
confidence: 0.6
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---
## Fix A
`;

    const fixB = `---
id: fix-b
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
signatures:
  - test:shared-sig
sources:
  - uri: seed://b
    hash: sha256:bbb
confidence: 0.6
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---
## Fix B
`;

    await writeFile(join(root, "kb/known-fixes/fix-a.md"), fixA);
    await writeFile(join(root, "kb/known-fixes/fix-b.md"), fixB);

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find((f) => f.rule === "duplicate_signature");
    assert.ok(finding, "expected duplicate_signature finding");
    assert.equal(finding.severity, "warning");
    assert.ok(finding.message.includes("test:shared-sig"));
  });

  it("does not flag duplicate signatures across different knowledge types", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-dupsig-type-"));
    await initializeWorkspace(root);

    await writeFile(join(root, "kb/known-fixes/type-fix.md"), VALID_KNOWN_FIX_FRONTMATTER);
    await writeFile(
      join(root, "kb/pitfalls/type-pitfall.md"),
      VALID_PITFALL_FRONTMATTER.replace("forbidden_actions:\n  - fix step one", "forbidden_actions:\n  - unrelated action")
    );

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find((f) => f.rule === "duplicate_signature");
    assert.equal(finding, undefined);
  });

  it("detects contradiction between recommended action and forbidden action", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-contra-"));
    await initializeWorkspace(root);

    await writeFile(join(root, "kb/known-fixes/fix-1.md"), VALID_KNOWN_FIX_FRONTMATTER);

    await writeFile(join(root, "kb/pitfalls/pitfall-1.md"), VALID_PITFALL_FRONTMATTER);

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find((f) => f.rule === "contradiction_action_forbidden");
    assert.ok(finding, "expected contradiction_action_forbidden finding");
    assert.equal(finding.severity, "error");
    assert.ok(finding.message.includes("fix step one"));

    const humanExceptions = result.exceptions.filter((e) => e.category === "human_required");
    assert.ok(humanExceptions.length >= 1, "expected at least one human-required exception");

    const excDir = join(root, ".praxisbase/exceptions/human-required");
    const excFiles = await readdir(excDir);
    const contradictionFiles: string[] = [];
    for (const f of excFiles) {
      const content = JSON.parse(await readFile(join(excDir, f), "utf8"));
      if (content.reason && content.reason.includes("Contradiction")) {
        contradictionFiles.push(f);
      }
    }
    assert.ok(contradictionFiles.length >= 1, "expected human-required exception file written for contradiction");
  });

  it("writes lint report to disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-report-"));
    await initializeWorkspace(root);

    const result = await lintWorkspace(root);

    const reportDir = join(root, ".praxisbase/reports/lint");
    const reportFiles = await readdir(reportDir);
    assert.ok(reportFiles.length >= 1, "expected at least one lint report");

    const report = JSON.parse(await readFile(join(reportDir, reportFiles[0]), "utf8"));
    assert.equal(report.type, "lint_report");
    assert.equal(report.protocol_version, "0.1");
    assert.ok(report.run_id);
    assert.ok(Array.isArray(report.findings));
    assert.equal(typeof report.summary.errors, "number");
    assert.equal(typeof report.summary.warnings, "number");
  });

  it("writes lint run record to disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-run-"));
    await initializeWorkspace(root);

    await lintWorkspace(root);

    const runDir = join(root, ".praxisbase/runs/lint");
    const runFiles = await readdir(runDir);
    assert.ok(runFiles.length >= 1, "expected at least one lint run record");

    const run = JSON.parse(await readFile(join(runDir, runFiles[0]), "utf8"));
    assert.equal(run.command, "lint");
    assert.equal(run.protocol_version, "0.1");
    assert.ok(run.started_at);
    assert.ok(run.finished_at);
    assert.equal(typeof run.counts.errors, "number");
    assert.equal(typeof run.counts.warnings, "number");
    assert.ok(Array.isArray(run.errors));
  });

  it("detects duplicate source hashes as warnings", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-lint-duphash-"));
    await initializeWorkspace(root);

    const fixA = `---
id: hash-a
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
signatures:
  - test:sig-a
sources:
  - uri: seed://a
    hash: sha256:samehash
confidence: 0.6
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---
## A
`;

    const fixB = `---
id: hash-b
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: draft
signatures:
  - test:sig-b
sources:
  - uri: seed://b
    hash: sha256:samehash
confidence: 0.6
reference_count: 0
last_referenced_at:
supersedes: []
superseded_by:
updated_at: 2026-05-17T00:00:00Z
---
## B
`;

    await writeFile(join(root, "kb/known-fixes/hash-a.md"), fixA);
    await writeFile(join(root, "kb/known-fixes/hash-b.md"), fixB);

    const result = await lintWorkspace(root);
    const finding = result.report.findings.find((f) => f.rule === "duplicate_source_hash");
    assert.ok(finding, "expected duplicate_source_hash finding");
    assert.equal(finding.severity, "warning");
  });
});
