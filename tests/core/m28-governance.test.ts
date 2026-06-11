import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStaticArtifacts } from "@praxisbase/core/build/build.js";

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function frontmatterValue(raw: string, key: string): string | number | null {
  const line = raw.split(/\r?\n/).find((item) => item.startsWith(`${key}:`));
  if (!line) return null;
  const value = line.slice(key.length + 1).trim();
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "null") return null;
  return value.replace(/^['"]|['"]$/g, "");
}

describe("M28 governance batch", () => {
  it("updates references, promotes maturity, and emits three-tier indexes during build", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-m28-governance-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/inbox/episodes"), { recursive: true });
    await mkdir(join(root, ".praxisbase/policies"), { recursive: true });
    await writeJson(join(root, ".praxisbase/policies/governance.json"), {
      draft_to_verified_references: 1,
      verified_to_proven_environments: 2,
      verified_idle_days: 180,
      proven_idle_days: 365
    });
    await writeFile(join(root, "kb/known-fixes/openclaw-dispatch-routing-failures.md"), [
      "---",
      "id: openclaw-dispatch-routing-failures",
      "title: OpenClaw dispatch routing failures",
      "protocol_version: '0.1'",
      "type: known_fix",
      "knowledge_type: known_fix",
      "scope: team",
      "risk: medium",
      "status: draft",
      "maturity: verified",
      "signatures:",
      "  - openclaw:dispatch-routing-failure",
      "sources:",
      "  - uri: log://openclaw/team-a/run-1",
      "    hash: sha256:m28gov001",
      "confidence: 0.91",
      "reference_count: 0",
      "last_referenced_at: null",
      "updated_at: '2026-06-01T00:00:00.000Z'",
      "---",
      "# OpenClaw dispatch routing failures",
      "",
      "## When to Use",
      "Use when dispatch routing evidence is missing.",
      "",
      "## Verify",
      "Run dispatch smoke.",
    ].join("\n"), "utf8");

    for (const [id, environmentId] of [["episode_a", "team-a"], ["episode_b", "team-b"]] as const) {
      await writeJson(join(root, `.praxisbase/inbox/episodes/${id}.json`), {
        id,
        protocol_version: "0.1",
        type: "repair_episode",
        scope: "team",
        agent_id: "openclaw-repair",
        agent_type: "temporary_repair_agent",
        environment_id: environmentId,
        run_id: `run-${environmentId}`,
        idempotency_key: id,
        problem_signature: "openclaw:dispatch-routing-failure",
        result: "success",
        used_skills: [],
        used_objects: ["kb/known-fixes/openclaw-dispatch-routing-failures.md"],
        source_refs: [`log://openclaw/${environmentId}`],
        knowledge_references: [{
          id: "openclaw-dispatch-routing-failures",
          path: "kb/known-fixes/openclaw-dispatch-routing-failures.md",
          used_in_phase: "diagnosis",
          effect: "helped_fix",
          outcome: "success"
        }],
        summary: "Dispatch routing fix worked.",
        created_at: "2026-06-03T10:00:00.000Z"
      });
    }

    const result = await buildStaticArtifacts(root);

    const promoted = await readFile(join(root, "kb/known-fixes/openclaw-dispatch-routing-failures.md"), "utf8");
    assert.equal(frontmatterValue(promoted, "reference_count"), 2);
    assert.equal(frontmatterValue(promoted, "last_referenced_at"), "2026-06-03T10:00:00.000Z");
    assert.equal(frontmatterValue(promoted, "maturity"), "proven");
    assert.ok(result.indexes.includes("dist/progressive-index/layer-a-catalog.json"));
    assert.ok(result.indexes.includes("dist/progressive-index/layer-b-known-fixes.json"));
    assert.ok(result.indexes.includes("dist/progressive-index/layer-c-objects.json"));
  });
});
