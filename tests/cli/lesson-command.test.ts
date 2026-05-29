/// <reference types="node" />

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lessonCommand } from "@praxisbase/cli/commands/lesson.js";

describe("lesson CLI command", () => {
  it("extracts lessons from a local memory source", async () => {
    const root = await mkdtemp(join(tmpdir(), "pb-cli-lesson-"));
    const source = join(root, "openclaw");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "MEMORY.md"), [
      "# Memory",
      "- Need tools/network/dispatch or slow tasks: send a short ACK first.",
      "- Confirm target machine before restart.",
    ].join("\n"), "utf8");

    const output = await lessonCommand(root, "extract", {
      source,
      agent: "openclaw",
      scope: "personal",
      json: true,
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.ok(parsed.report.lessons.length >= 2);
  });

  it("runs golden validation", async () => {
    const output = await lessonCommand(process.cwd(), "golden", { json: true });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.results.every((result: { privateLeakCount: number }) => result.privateLeakCount === 0));
  });
});
