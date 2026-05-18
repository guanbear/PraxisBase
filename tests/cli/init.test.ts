import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";

describe("praxisbase init", () => {
  it("creates the protocol skeleton and seed content", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-init-"));

    await initializeWorkspace(root);

    await assert.doesNotReject(stat(join(root, ".praxisbase/config.yaml")));
    await assert.doesNotReject(stat(join(root, ".praxisbase/policies/autonomy.yaml")));
    await assert.doesNotReject(stat(join(root, ".praxisbase/policies/risk-rules.yaml")));
    await assert.doesNotReject(stat(join(root, ".praxisbase/inbox/episodes")));
    await assert.doesNotReject(stat(join(root, ".praxisbase/inbox/proposals")));
    await assert.doesNotReject(stat(join(root, ".praxisbase/outbox/episodes")));
    await assert.doesNotReject(stat(join(root, "skills/openclaw/auth-repair/SKILL.md")));
    await assert.doesNotReject(stat(join(root, "skills/openclaw/baseline-diagnostics/SKILL.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/openclaw-auth-expired.md")));

    const config = await readFile(join(root, ".praxisbase/config.yaml"), "utf8");
    assert.ok(config.includes('protocol_version: "0.1"'));
  });
});
