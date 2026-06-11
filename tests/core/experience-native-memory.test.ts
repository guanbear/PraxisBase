import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { importNativeMemory, planMemoryRefresh } from "@praxisbase/core";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

describe("importNativeMemory", () => {
  it("imports Hermes skill summaries as proposal candidates only", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-memory-"));
    const source = join(root, "hermes-skill-summary.json");
    await writeFile(source, JSON.stringify({
      agent: "hermes",
      kind: "skill_summary",
      source_ref: "raw-vault://hermes/skill-auth-repair",
      source_hash: "sha256:hermes1",
      redacted_summary: "Hermes synthesized an auth repair skill after repeated successes.",
    }));

    const report = await importNativeMemory(root, { agent: "hermes", source, json: true });

    assert.equal(report.changed_stable_knowledge, false);
    assert.equal(report.imported_sources, 1);
    assert.equal(report.default_scope, "personal");
    assert.equal(report.proposal_candidates.length, 1);

    const proposals = await readdir(join(root, ".praxisbase/inbox/proposals"));
    assert.equal(proposals.length, 1);
    const proposal = JSON.parse(await readFile(join(root, ".praxisbase/inbox/proposals", proposals[0]), "utf8"));
    assert.equal(proposal.source_ref, "raw-vault://hermes/skill-auth-repair");
    assert.equal(proposal.changed_stable_knowledge, false);
    assert.equal(await exists(join(root, "skills")), false);
  });

  it("imports OpenHuman preferences as personal by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-memory-"));
    const source = join(root, "openhuman-preference.json");
    await writeFile(source, JSON.stringify({
      agent: "openhuman",
      kind: "preference",
      source_ref: "raw-vault://openhuman/preference-language",
      source_hash: "sha256:openhuman1",
      redacted_summary: "User prefers Chinese explanations.",
    }));

    const report = await importNativeMemory(root, { agent: "openhuman", source, json: true });

    assert.equal(report.default_scope, "personal");
    assert.equal(report.changed_stable_knowledge, false);
    assert.equal(report.imported_sources, 1);
    assert.equal(await exists(join(root, "kb")), false);
    assert.equal(await exists(join(root, "skills")), false);
  });

  it("rejects native memory source refs under stable knowledge paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-memory-"));
    const source = join(root, "bad-memory.json");
    await writeFile(source, JSON.stringify({
      agent: "codex",
      kind: "session_summary",
      source_ref: "kb/raw-native-memory.md",
      source_hash: "sha256:bad",
      redacted_summary: "Raw native memory.",
    }));

    await assert.rejects(
      () => importNativeMemory(root, { agent: "codex", source, json: true }),
      /RAW_ARTIFACT_REJECTED/
    );
    assert.equal(await exists(join(root, "kb")), false);
    assert.equal(await exists(join(root, "skills")), false);
  });

  it("deduplicates imports by source hash across existing memory reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-memory-"));
    const source = join(root, "codex-session.json");
    const descriptor = {
      agent: "codex",
      kind: "session_summary",
      source_ref: "raw-vault://codex/session-1",
      source_hash: "sha256:codex1",
      redacted_summary: "Codex fixed a project issue.",
    };
    await writeFile(source, JSON.stringify(descriptor));

    const first = await importNativeMemory(root, { agent: "codex", source, json: true });
    const second = await importNativeMemory(root, { agent: "codex", source, json: true });
    const third = await importNativeMemory(root, { agent: "codex", source, json: true });

    assert.equal(first.imported_sources, 1);
    assert.equal(second.imported_sources, 0);
    assert.equal(third.imported_sources, 0);
    assert.ok(second.warnings.some((warning) => warning.includes("Duplicate native memory source hash")));
  });

  it("writes memory import reports and run records", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-memory-"));
    const source = join(root, "generic-memory.json");
    await writeFile(source, JSON.stringify({
      agent: "generic",
      kind: "memory",
      source_ref: "raw-vault://generic/memory-1",
      source_hash: "sha256:generic1",
      redacted_summary: "Generic agent retained a useful repair note.",
    }));

    const report = await importNativeMemory(root, { agent: "generic", source, json: true });

    assert.match(report.id, /^memory-import_/);
    assert.equal(await exists(join(root, ".praxisbase/reports/memory", `${report.id}.json`)), true);
    assert.equal(await exists(join(root, ".praxisbase/runs/memory-import", `${report.id}.json`)), true);
  });
});

describe("planMemoryRefresh", () => {
  it("produces a plan without overwriting native memory", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-memory-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), "known fix", "utf8");

    const plan = await planMemoryRefresh({
      agent: "codex",
      target: "instruction-snippet",
      contextRefs: ["kb/known-fixes/openclaw-auth-expired.md"],
    });

    assert.equal(plan.writes_native_memory, false);
    assert.ok(plan.outputs.some((output) => output.kind === "install_snippet"));
    assert.deepEqual(plan.outputs[0].source_refs, ["kb/known-fixes/openclaw-auth-expired.md"]);

    assert.equal(await readFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), "utf8"), "known fix");
    assert.equal(await exists(join(root, "skills")), false);
  });
});
