import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promoteApprovedProposal } from "@praxisbase/core/promote/promote.js";
import { safePath, isStableKnowledgePath } from "@praxisbase/core/store/file-store.js";

const proposal = {
  id: "proposal_20260517_known_fix",
  protocol_version: "0.1" as const,
  type: "knowledge_proposal" as const,
  scope: "team" as const,
  action: "create" as const,
  target_type: "known_fix" as const,
  target_id: "openclaw-auth-expired",
  agent_id: "openclaw-temp-xyz",
  agent_type: "temporary_repair_agent" as const,
  environment_id: "sandbox-123",
  run_id: "run-456",
  idempotency_key: "proposal_20260517_known_fix",
  evidence: {
    source_uri: "log://openclaw/sandbox-123/run-456",
    source_hash: "sha256:abc",
    excerpt: "Auth refresh fixed the repair.",
    repair_result: "success" as const,
    verification: "Minimal model call completed."
  },
  patch: {
    path: "kb/known-fixes/openclaw-auth-expired.md",
    content: "# OpenClaw auth expired\n"
  },
  created_at: "2026-05-17T10:00:00Z"
};

const review = {
  id: "review_proposal_20260517_known_fix",
  protocol_version: "0.1" as const,
  proposal_id: "proposal_20260517_known_fix",
  reviewer_id: "reviewer",
  reviewer_model: "deterministic-v0",
  prompt_version: "review-v0.1",
  decision: "approve" as const,
  risk: "medium" as const,
  confidence: 0.82,
  reasons: ["Evidence exists."],
  required_checks: ["praxisbase check"],
  created_at: "2026-05-17T10:00:00Z"
};

describe("promotion", () => {
  it("writes approved proposal content into kb", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-promote-"));
    await promoteApprovedProposal(root, { proposal, review });

    const written = await readFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), "utf8");
    assert.ok(written.includes("OpenClaw auth expired"));
  });

  it("rejects unsafe patch paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-promote-unsafe-"));
    await assert.rejects(
      promoteApprovedProposal(root, {
        proposal: { ...proposal, patch: { path: "../outside.md", content: "escape" } },
        review
      }),
      /Path traversal rejected|outside stable knowledge/
    );

    await assert.rejects(stat(join(root, "../outside.md")));
  });

  it("rejects raw log content in kb", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-promote-log-"));
    await assert.rejects(
      promoteApprovedProposal(root, {
        proposal: {
          ...proposal,
          patch: {
            path: "kb/known-fixes/raw-log.md",
            content: "2026-05-17T10:00:00Z line one\n2026-05-17T10:00:01Z line two\n2026-05-17T10:00:02Z line three\n"
          }
        },
        review
      }),
      /raw log content/
    );
  });

  it("safePath rejects prefix attack on root directory", () => {
    const root = join(tmpdir(), "praxisbase-prefix-test-abc");
    assert.throws(
      () => safePath(root, "../../abcd/evil"),
      /Path traversal rejected/
    );
  });

  it("safePath allows legitimate child paths", () => {
    const root = join(tmpdir(), "praxisbase-prefix-test-abc");
    const result = safePath(root, "kb/fixes/test.md");
    assert.ok(result.startsWith(root + sep));
  });

  it("safePath rejects absolute paths escaping root", () => {
    const root = join(tmpdir(), "praxisbase-prefix-test-abc");
    assert.throws(
      () => safePath(root, "/etc/passwd"),
      /Path traversal rejected/
    );
  });

  it("isStableKnowledgePath rejects traversal after kb prefix", () => {
    assert.equal(isStableKnowledgePath("kb/../outside.md"), false);
    assert.equal(isStableKnowledgePath("kb/./../etc/passwd"), false);
    assert.equal(isStableKnowledgePath("skills/../outside.md"), false);
  });

  it("isStableKnowledgePath accepts valid stable paths", () => {
    assert.equal(isStableKnowledgePath("kb/known-fixes/test.md"), true);
    assert.equal(isStableKnowledgePath("skills/openclaw/auth/SKILL.md"), true);
    assert.equal(isStableKnowledgePath("kb/deep/nested/fix.md"), true);
  });

  it("isStableKnowledgePath rejects paths outside kb and skills", () => {
    assert.equal(isStableKnowledgePath("etc/passwd"), false);
    assert.equal(isStableKnowledgePath("../outside.md"), false);
    assert.equal(isStableKnowledgePath("dist/bundle.json"), false);
  });
});
