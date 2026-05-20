import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildContext } from "@praxisbase/core";

describe("buildContext", () => {
  it("diagnosis context respects max bytes and keeps citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(
      join(root, "kb/known-fixes/openclaw-auth-expired.md"),
      `---
id: openclaw-auth-expired
type: known_fix
---

# OpenClaw Auth Expired

Refresh auth state when OpenClaw logs mention auth expired. ${"details ".repeat(200)}
`,
      "utf8"
    );

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "diagnosis",
      query: "openclaw auth expired",
      maxBytes: 900,
    });

    assert.equal(output.stage, "diagnosis");
    assert.equal(output.agent, "codex");
    assert.ok(Buffer.byteLength(JSON.stringify(output)) <= 900);
    assert.ok(output.citations.some((citation) => citation.path === "kb/known-fixes/openclaw-auth-expired.md"));
    assert.ok(output.truncated, "large matching object should be truncated to fit budget");
  });

  it("returns warning instead of failing when context is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-"));

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "diagnosis",
      query: "new issue",
    });

    assert.equal(output.stage, "diagnosis");
    assert.deepEqual(output.items, []);
    assert.ok(output.warnings.includes("context_unavailable"));
  });

  it("writes a context report", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-"));

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "verification",
      query: "",
    });

    const report = JSON.parse(await readFile(join(root, ".praxisbase/reports/context", `${output.id}.json`), "utf8"));
    assert.equal(report.id, output.id);
    assert.equal(report.stage, "verification");
    assert.equal(report.changed_stable_knowledge, false);
  });

  it("uses wiki retrieval for CJK and graph-related context while preserving citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-context-wiki-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await mkdir(join(root, "skills/openclaw/auth-repair"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), `---
id: openclaw-auth-expired
type: known_fix
scope: team
maturity: proven
signatures: ["openclaw:auth-expired"]
---
# 认证失败

OpenClaw 认证失败 needs auth repair. [[auth-repair]]
`);
    await writeFile(join(root, "skills/openclaw/auth-repair/SKILL.md"), `---
id: auth-repair
scope: team
maturity: verified
---
# Auth Repair

Refresh credentials safely.
`);

    const output = await buildContext({
      root,
      agent: "codex",
      workspace: root,
      stage: "repair",
      query: "认证失败",
      maxBytes: 4000,
    });

    assert.equal(output.items[0].path, "kb/known-fixes/openclaw-auth-expired.md");
    assert.ok(output.items.some((item) => item.path === "skills/openclaw/auth-repair/SKILL.md"));
    assert.ok(output.citations.some((citation) => citation.path === "kb/known-fixes/openclaw-auth-expired.md"));
  });
});
