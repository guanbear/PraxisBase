import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WikiSourceAnalysisSchema } from "@praxisbase/core/protocol/schemas.js";
import { analyzeWikiSource } from "@praxisbase/core/wiki/analyze.js";
import type { WikiSource } from "@praxisbase/core/wiki/model.js";

function source(input: Partial<WikiSource>): WikiSource {
  return {
    id: input.id ?? "capture:capture_1",
    kind: input.kind ?? "capture",
    source_hash: input.source_hash ?? "sha256:test",
    title: input.title ?? "capture_1",
    summary: input.summary ?? "",
    body: input.body,
    scope: input.scope ?? "project",
    path: input.path,
    knowledge_type: input.knowledge_type,
  };
}

describe("analyzeWikiSource", () => {
  it("classifies OpenClaw auth repair text as a known fix with stable signature and path", () => {
    const analysis = analyzeWikiSource(source({
      summary: "OpenClaw auth expired; refreshing login fixed the repair.",
    }));

    assert.equal(analysis.suggested_page_kind, "known_fix");
    assert.ok(analysis.signatures.includes("openclaw:auth-expired"));
    assert.equal(analysis.candidate_path, "kb/known-fixes/openclaw-auth-expired.md");
    assert.ok(WikiSourceAnalysisSchema.safeParse(analysis).success);
  });

  it("classifies command/runbook text as procedure", () => {
    const analysis = analyzeWikiSource(source({
      summary: "Runbook procedure: restart worker service with kubectl rollout restart.",
    }));

    assert.equal(analysis.suggested_page_kind, "procedure");
    assert.equal(analysis.candidate_path, "kb/procedures/restart-worker-service.md");
  });

  it("classifies repeated failure warnings as pitfall", () => {
    const analysis = analyzeWikiSource(source({
      summary: "Pitfall: do not retry the same failing login loop repeatedly.",
    }));

    assert.equal(analysis.suggested_page_kind, "pitfall");
    assert.ok(analysis.risks.includes("repeated_failure"));
  });

  it("keeps personal scope and reports promotion risk", () => {
    const analysis = analyzeWikiSource(source({
      scope: "personal",
      summary: "Prefer local editor layout for Codex repairs.",
    }));

    assert.equal(analysis.scope, "personal");
    assert.equal(analysis.suggested_page_kind, "preference");
    assert.ok(analysis.risks.includes("personal_scope"));
  });

  it("flags private material as a risk", () => {
    const analysis = analyzeWikiSource(source({
      summary: "The auth token appeared in the repair output.",
    }));

    assert.ok(analysis.risks.includes("private_material"));
  });
});
