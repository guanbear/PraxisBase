import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadStableSkillInventory, matchStableSkills } from "@praxisbase/core/synthesis/skill-inventory.js";
import type { SkillSignalCluster } from "@praxisbase/core/synthesis/skill-stability.js";

async function writeSkill(root: string, path: string, body: string) {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), body, "utf8");
}

function cluster(trigger: string): SkillSignalCluster {
  return {
    id: "skill_cluster_1",
    cluster_key: "key",
    title: "OpenClaw memory import operations",
    trigger,
    procedure: ["Export OpenClaw memory JSON.", "Verify hash.", "Import with provenance."],
    source_refs: ["raw-vault://codex/1", "raw-vault://codex/2"],
    source_hashes: ["sha256:1", "sha256:2"],
    evidence_ids: ["sha256:c1", "sha256:c2"],
    source_count: 2,
    confidence: 0.9,
    scope: "personal",
    related_wiki_paths: [],
    cue_families: ["verified_fix"],
  };
}

describe("stable skill inventory", () => {
  it("loads stable skills and extracts key sections", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-skill-inventory-"));
    await writeSkill(root, "skills/openclaw/openclaw-memory-operations/SKILL.md", `---
name: OpenClaw memory operations
description: Import OpenClaw memory into PraxisBase.
scope: personal
---
# OpenClaw memory operations

## When To Use
Use when importing OpenClaw memory.

## Procedure
Export memory and verify hashes.

## Pitfalls
Do not copy raw logs.

## Provenance
[[kb/known-fixes/openclaw-memory-import]]
`);

    const inventory = await loadStableSkillInventory(root);
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].scope, "personal");
    assert.match(inventory[0].when_to_use, /OpenClaw memory/);
    assert.deepEqual(inventory[0].related_wiki_paths, ["kb/known-fixes/openclaw-memory-import"]);
  });

  it("matches strong, medium, weak, ambiguous, and create cases", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-skill-match-"));
    const skillBody = (name: string, desc: string) => `---
name: ${name}
description: ${desc}
scope: personal
---
# ${name}

## When To Use
${desc}

## Procedure
Export memory and verify hash.

## Pitfalls
Avoid raw logs.

## Provenance
- fixture
`;
    await writeSkill(root, "skills/openclaw/openclaw-memory-operations/SKILL.md", skillBody("OpenClaw memory operations", "Import OpenClaw memory into PraxisBase."));
    await writeSkill(root, "skills/codex/praxisbase-daily-operations/SKILL.md", skillBody("PraxisBase daily operations", "Run PraxisBase daily synthesis and build-site."));
    const inventory = await loadStableSkillInventory(root);

    assert.equal(matchStableSkills(cluster("Need to import OpenClaw memory into PraxisBase"), inventory)[0].strength, "strong");
    assert.ok(matchStableSkills(cluster("Run PraxisBase daily build-site after source import"), inventory).some((match) => match.strength === "medium" || match.strength === "strong"));
    assert.ok(matchStableSkills(cluster("OpenClaw command name only"), inventory).every((match) => match.strength !== "strong"));

    await writeSkill(root, "skills/openclaw/openclaw-memory-import/SKILL.md", skillBody("OpenClaw memory import", "Import OpenClaw memory into PraxisBase."));
    const ambiguous = matchStableSkills(cluster("Need to import OpenClaw memory into PraxisBase"), await loadStableSkillInventory(root));
    assert.ok(ambiguous.filter((match) => match.strength === "strong").length >= 2);
    assert.equal(matchStableSkills(cluster("Completely unrelated editor theme preference"), inventory).length, 0);
  });
});
