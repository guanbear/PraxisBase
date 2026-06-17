import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { revokeStableKnowledge, syncReviewWriteback, writeManualPrivacyReview } from "@praxisbase/cli/commands/review.js";

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout.trim();
}

describe("review CLI helpers", () => {
  it("commits review state changes for a GitLab-backed approval service", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-review-writeback-"));
    await git(root, ["init", "-b", "master"]);
    await git(root, ["config", "user.name", "praxisbase-test"]);
    await git(root, ["config", "user.email", "praxisbase-test@example.com"]);
    const dir = join(root, ".praxisbase/exceptions/human-required");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "exception.json"), JSON.stringify({
      id: "exception",
      protocol_version: "0.1",
      type: "exception_record",
      category: "human_required",
      source_id: "source_exception",
      reason: "Experience privacy verdict human_required: feishu_channel_team_review_first",
      details: {
        agent: "openclaw",
        channel: "feishu",
        scope_hint: "team",
        redacted_summary: "修复机器人静默时先检查触发资格和网关健康。",
      },
      created_at: "2026-06-16T00:00:00.000Z",
    }, null, 2), "utf8");
    await git(root, ["add", ".praxisbase"]);
    await git(root, ["commit", "-m", "seed"]);

    await writeManualPrivacyReview(root, {
      exceptionId: "exception",
      decision: "auto_released",
      reviewerId: "praxisbase-gitlab-review-ui",
    });
    const result = await syncReviewWriteback(root, { mode: "git", push: false, message: "Record PraxisBase review decision" });

    assert.equal(result.committed, true);
    assert.equal(result.pushed, false);
    assert.equal(await git(root, ["status", "--short"]), "");
    assert.equal(await git(root, ["log", "-1", "--pretty=%s"]), "Record PraxisBase review decision");
    const exception = JSON.parse(await readFile(join(dir, "exception.json"), "utf8"));
    assert.equal(exception.details.triage.reviewer_id, "praxisbase-gitlab-review-ui");
  });

  it("archives stable knowledge for revoke without deleting provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-review-revoke-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(join(root, "kb/known-fixes/revokable.md"), [
      "---",
      "id: revokable",
      "type: known_fix",
      "knowledge_type: known_fix",
      "scope: team",
      "status: published",
      "maturity: verified",
      "sources:",
      "  - uri: openclaw://answer-bot/redacted",
      "    hash: sha256:revokable",
      "confidence: 0.91",
      "---",
      "# Revokable Experience",
      "",
      "## When to Use",
      "Use this when a stable experience needs a rollback path.",
    ].join("\n"), "utf8");

    const result = await revokeStableKnowledge(root, {
      path: "kb/known-fixes/revokable.md",
      reviewerId: "praxisbase-test",
      reason: "bad advice",
      now: "2026-06-17T08:00:00.000Z",
    });

    assert.equal(result.path, "kb/known-fixes/revokable.md");
    assert.equal(result.status, "archived");
    const page = await readFile(join(root, "kb/known-fixes/revokable.md"), "utf8");
    assert.match(page, /status: archived/);
    assert.match(page, /maturity: archived/);
    assert.match(page, /revoked_by: praxisbase-test/);
    assert.match(page, /revocation_reason: bad advice/);
    assert.match(page, /openclaw:\/\/answer-bot\/redacted/);
    assert.match(page, /sha256:revokable/);
    const record = JSON.parse(await readFile(join(root, result.revocation_path), "utf8"));
    assert.equal(record.path, "kb/known-fixes/revokable.md");
    assert.equal(record.reviewer_id, "praxisbase-test");
  });
});
