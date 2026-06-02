import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { doctorCommand } from "@praxisbase/cli/commands/doctor.js";

describe("doctor command", () => {
  it("reports OpenClaw remote API readiness diagnostics as JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-doctor-openclaw-"));
    await writeFile(join(root, ".gitignore"), ".praxisbase/staging/\n");

    const output = await doctorCommand(root, "openclaw-remote", {
      provider: "openclaw-api",
      json: true,
      env: {},
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.ok, false);
    assert.ok(parsed.report.checks.some((check: { id: string; ok: boolean }) =>
      check.id === "openclaw-token" && check.ok === false
    ));
  });

  it("warns when OpenClaw staging is not ignored by Git", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-cli-doctor-ignore-"));
    await writeFile(join(root, ".gitignore"), "dist/\n");

    const output = await doctorCommand(root, "openclaw-remote", {
      provider: "exported-json",
      json: true,
      env: {},
    });

    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.report.checks.some((check: { id: string; ok: boolean; severity: string }) =>
      check.id === "staging-gitignore" && check.ok === false && check.severity === "warning"
    ));
  });
});
