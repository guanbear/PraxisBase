import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
    content: [
      "# OpenClaw auth expired",
      "",
      "## When to Use",
      "Use this when OpenClaw reports expired authentication during repair work.",
      "",
      "## Fix",
      "Refresh the OpenClaw login and rerun the minimal verification call.",
      "",
    ].join("\n")
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

  it("rejects replacing an existing useful wiki page with a lower-quality rewrite", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-promote-downgrade-"));
    await mkdir(join(root, "kb/known-fixes"), { recursive: true });
    await writeFile(
      join(root, "kb/known-fixes/openclaw-gateway-restart.md"),
      [
        "# OpenClaw gateway restart after configuration changes",
        "",
        "## When to Use",
        "Use this when OpenClaw configuration changes require the gateway to reload provider or routing settings.",
        "",
        "## Symptoms or Context",
        "The active model or route does not match the updated configuration.",
        "",
        "## Procedure",
        "1. Verify the changed configuration file.",
        "2. Restart the OpenClaw gateway.",
        "3. Confirm the active route and model.",
        "",
        "## Verify",
        "Run the gateway status check and a minimal model identification request.",
        "",
        "## Reusable Lessons",
        "Configuration edits do not affect the running gateway until the service is restarted.",
        "",
        "## Provenance",
        "* openclaw-memory://example (sha256:abc)",
        "",
        "## Related Wiki Pages",
        "* [[openclaw-dispatch-routing-failures|OpenClaw dispatch routing failures]]",
        "",
      ].join("\n"),
      "utf8",
    );

    await assert.rejects(
      promoteApprovedProposal(root, {
        proposal: {
          ...proposal,
          patch: {
            path: "kb/known-fixes/openclaw-gateway-restart.md",
            content: [
              "# OpenClaw gateway restart after configuration changes",
              "",
              "## When to Use",
              "Use this when OpenClaw health checks timeout.",
              "",
              "## What To Do",
              "- Attempted to run `openclaw status` command.",
              "- A gateway restart is required for changes to take effect.",
              "",
              "## Failed Attempts",
              "- Assistant turn failed before producing content during an intermediate step.",
              "",
              "## Verify",
              "- A health check was performed on the OpenClaw environment.",
              "",
              "## Provenance",
              "* openclaw-memory://example (sha256:def)",
              "",
            ].join("\n"),
          },
        },
        review,
      }),
      /lower-quality rewrite/
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
