import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";
import { checkCommand } from "@praxisbase/cli/commands/check.js";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("praxisbase init", () => {
  it("creates the protocol skeleton and all seed content by default", async () => {
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
    await assert.doesNotReject(stat(join(root, "skills/k8s/incident-triage/SKILL.md")));
    await assert.doesNotReject(stat(join(root, "kb/known-fixes/k8s-pod-oomkilled.md")));

    const config = await readFile(join(root, ".praxisbase/config.yaml"), "utf8");
    assert.ok(config.includes('protocol_version: "0.1"'));
    assert.ok(config.includes("profile: all"));
  });

  it("creates an OpenClaw-only knowledge repo with --profile openclaw", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-init-openclaw-"));

    await initializeWorkspace(root, { profile: "openclaw" });

    assert.equal(await exists(join(root, "skills/openclaw/auth-repair/SKILL.md")), true);
    assert.equal(await exists(join(root, "kb/known-fixes/openclaw-auth-expired.md")), true);
    assert.equal(await exists(join(root, "skills/k8s/incident-triage/SKILL.md")), false);
    assert.equal(await exists(join(root, "kb/known-fixes/k8s-pod-oomkilled.md")), false);

    const config = await readFile(join(root, ".praxisbase/config.yaml"), "utf8");
    assert.ok(config.includes("name: praxisbase-openclaw-kb"));
    assert.ok(config.includes("profile: openclaw"));
    await assert.doesNotReject(checkCommand(root));
  });

  it("creates a K8s-only knowledge repo with --profile k8s", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-init-k8s-"));

    await initializeWorkspace(root, { profile: "k8s" });

    assert.equal(await exists(join(root, "skills/k8s/incident-triage/SKILL.md")), true);
    assert.equal(await exists(join(root, "kb/known-fixes/k8s-pod-oomkilled.md")), true);
    assert.equal(await exists(join(root, "skills/openclaw/auth-repair/SKILL.md")), false);
    assert.equal(await exists(join(root, "kb/known-fixes/openclaw-auth-expired.md")), false);

    const config = await readFile(join(root, ".praxisbase/config.yaml"), "utf8");
    assert.ok(config.includes("name: praxisbase-k8s-kb"));
    assert.ok(config.includes("profile: k8s"));
    await assert.doesNotReject(checkCommand(root));
  });

  it("rejects unsupported init profiles", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-init-bad-"));

    await assert.rejects(
      initializeWorkspace(root, { profile: "docs" as never }),
      /Unsupported init profile/
    );
  });
});
