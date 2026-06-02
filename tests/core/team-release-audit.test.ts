import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStaticArtifacts } from "@praxisbase/core/build/build.js";
import { PROTOCOL_VERSION } from "@praxisbase/core/protocol/types.js";
import { protocolPaths } from "@praxisbase/core/protocol/paths.js";
import { readTeamReleaseAuditReport } from "@praxisbase/core/experience/team-release-audit.js";
import { initializeWorkspace } from "@praxisbase/cli/commands/init.js";

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createTeamLoopFixture(
  root: string,
  options: { seedK8s?: boolean; includeK8sEvidence?: boolean } = {},
): Promise<void> {
  const seedK8s = options.seedK8s ?? true;
  const includeK8sEvidence = options.includeK8sEvidence ?? seedK8s;

  if (seedK8s) await initializeWorkspace(root);
  await mkdir(join(root, "kb/known-fixes"), { recursive: true });
  await mkdir(join(root, protocolPaths.inboxEpisodes), { recursive: true });
  await mkdir(join(root, protocolPaths.inboxProposals), { recursive: true });
  await mkdir(join(root, protocolPaths.inboxReviews), { recursive: true });
  await mkdir(join(root, ".praxisbase/reports/skill-synthesis"), { recursive: true });

  await writeFile(join(root, "kb/known-fixes/openclaw-dispatch-routing-failures.md"), [
    "---",
    "id: openclaw-dispatch-routing-failures",
    "title: OpenClaw dispatch routing failures",
    "protocol_version: '0.1'",
    "type: known_fix",
    "knowledge_type: known_fix",
    "scope: team",
    "risk: medium",
    "status: draft",
    "maturity: verified",
    "signatures:",
    "  - openclaw:dispatch-routing-failure",
    "sources:",
    "  - uri: log://openclaw/team-a/run-1",
    "    hash: sha256:m28team001",
    "confidence: 0.91",
    "reference_count: 0",
    "last_referenced_at: null",
    "updated_at: '2026-06-01T00:00:00.000Z'",
    "---",
    "# OpenClaw dispatch routing failures",
    "",
    "## When to Use",
    "Use when dispatch routing evidence is missing.",
    "",
    "## Fix",
    "Check the routing path and verify dispatch evidence.",
    "",
    "## Agent Use",
    "Use this known fix before proposing a new routing repair.",
    "",
    "## Verification",
    "Run dispatch smoke.",
  ].join("\n"), "utf8");

  for (const [id, environmentId] of [["episode_a", "team-a"], ["episode_b", "team-b"]] as const) {
    await writeJson(join(root, protocolPaths.inboxEpisodes, `${id}.json`), {
      id,
      protocol_version: PROTOCOL_VERSION,
      type: "repair_episode",
      scope: "team",
      agent_id: "openclaw-repair",
      agent_type: "temporary_repair_agent",
      environment_id: environmentId,
      run_id: `run-${environmentId}`,
      idempotency_key: id,
      problem_signature: "openclaw:dispatch-routing-failure",
      result: "success",
      used_skills: [],
      used_objects: ["kb/known-fixes/openclaw-dispatch-routing-failures.md"],
      source_refs: [`log://openclaw/${environmentId}`],
      knowledge_references: [{
        id: "openclaw-dispatch-routing-failures",
        path: "kb/known-fixes/openclaw-dispatch-routing-failures.md",
        used_in_phase: "diagnosis",
        effect: "helped_fix",
        outcome: "success"
      }],
      summary: "Dispatch routing fix worked.",
      created_at: "2026-06-03T10:00:00.000Z"
    });
  }

  if (includeK8sEvidence) {
    await writeJson(join(root, protocolPaths.inboxEpisodes, "episode_m29_k8s_oomkilled.json"), {
      id: "episode_m29_k8s_oomkilled",
      protocol_version: PROTOCOL_VERSION,
      type: "incident_episode",
      scope: "team",
      agent_id: "sre-autopilot-cp",
      agent_type: "live_incident_analyzer",
      environment_id: "prod",
      run_id: "trace-oom-001",
      idempotency_key: "episode_m29_k8s_oomkilled",
      problem_signature: "k8s:pod-oomkilled",
      result: "confirmed",
      used_skills: ["skills/k8s/incident-triage/SKILL.md"],
      used_objects: ["kb/known-fixes/k8s-pod-oomkilled.md"],
      source_refs: ["k8s-event://cluster-a/prod/order-api-123/OOMKilling"],
      evidence_summary: "Pod order-api-123 was OOMKilled and stabilized after owner-approved memory limit change.",
      knowledge_references: [{
        id: "k8s-pod-oomkilled",
        path: "kb/known-fixes/k8s-pod-oomkilled.md",
        used_in_phase: "diagnosis",
        effect: "helped_fix",
        outcome: "confirmed"
      }],
      created_at: "2026-06-03T10:02:00.000Z"
    });
  }

  await writeJson(join(root, protocolPaths.inboxProposals, "proposal_m28_team_known_fix.json"), {
    id: "proposal_m28_team_known_fix",
    protocol_version: PROTOCOL_VERSION,
    type: "knowledge_proposal",
    scope: "team",
    action: "patch",
    target_type: "known_fix",
    target_id: "openclaw-dispatch-routing-failures",
    agent_id: "openclaw-repair",
    agent_type: "curator",
    environment_id: "team-a",
    run_id: "run-team-a",
    idempotency_key: "proposal_m28_team_known_fix",
    evidence: {
      source_uri: "log://openclaw/team-a/run-1",
      source_hash: "sha256:m28team001",
      excerpt: "Dispatch routing fix worked.",
      repair_result: "success",
      verification: "Dispatch smoke passed."
    },
    patch: {
      path: "kb/known-fixes/openclaw-dispatch-routing-failures.md",
      content: "# OpenClaw dispatch routing failures"
    },
    created_at: "2026-06-03T10:05:00.000Z"
  });
  if (includeK8sEvidence) {
    await writeJson(join(root, protocolPaths.inboxProposals, "proposal_m29_k8s_known_fix.json"), {
      id: "proposal_m29_k8s_known_fix",
      protocol_version: PROTOCOL_VERSION,
      type: "knowledge_proposal",
      scope: "team",
      action: "patch",
      target_type: "known_fix",
      target_id: "k8s-pod-oomkilled",
      agent_id: "sre-autopilot-cp",
      agent_type: "live_incident_analyzer",
      environment_id: "prod",
      run_id: "trace-oom-001",
      idempotency_key: "proposal_m29_k8s_known_fix",
      evidence: {
        source_uri: "k8s-event://cluster-a/prod/order-api-123/OOMKilling",
        source_hash: "sha256:m29k8s001",
        excerpt: "OOMKilled stabilized after owner-approved memory limit change.",
        repair_result: "success",
        verification: "Restart count stopped increasing."
      },
      patch: {
        path: "kb/known-fixes/k8s-pod-oomkilled.md",
        content: "# K8s Pod OOMKilled"
      },
      created_at: "2026-06-03T10:05:00.000Z"
    });
  }
  await writeJson(join(root, protocolPaths.inboxReviews, "review_m28_team_known_fix.json"), {
    id: "review_m28_team_known_fix",
    protocol_version: PROTOCOL_VERSION,
    proposal_id: "proposal_m28_team_known_fix",
    reviewer_id: "gitlab-reviewer",
    reviewer_model: "team_git",
    prompt_version: "m28-team-review",
    decision: "approve",
    risk: "medium",
    confidence: 0.95,
    reasons: ["Team known-fix patch approved through Git review."],
    required_checks: ["dispatch-smoke"],
    created_at: "2026-06-03T10:06:00.000Z"
  });
  if (includeK8sEvidence) {
    await writeJson(join(root, protocolPaths.inboxReviews, "review_m29_k8s_known_fix.json"), {
      id: "review_m29_k8s_known_fix",
      protocol_version: PROTOCOL_VERSION,
      proposal_id: "proposal_m29_k8s_known_fix",
      reviewer_id: "gitlab-reviewer",
      reviewer_model: "team_git",
      prompt_version: "m29-team-review",
      decision: "approve",
      risk: "medium",
      confidence: 0.95,
      reasons: ["K8s known-fix patch approved through Git review."],
      required_checks: ["k8s-fixture-smoke"],
      created_at: "2026-06-03T10:06:00.000Z"
    });
  }
  await writeJson(join(root, ".praxisbase/reports/skill-synthesis/skill-synthesis-team.json"), {
    id: "skill-synthesis-team",
    protocol_version: PROTOCOL_VERSION,
    type: "skill_synthesis_report",
    authority_mode: "team-git",
    mode: "review",
    enabled: true,
    signals: 2,
    rejected_signals: 0,
    clusters: 1,
    candidates: 1,
    reviewed: 1,
    approved: 0,
    rejected: 0,
    needs_human: 1,
    skipped: 0,
    promoted: 0,
    source_authority: {
      accepted: 2,
      rejected: 0,
      degraded: 0,
      by_source_kind: { stable_wiki: 2 },
      by_reason: { stable_wiki_procedure: 2 },
      entries: []
    },
    outputs: [".praxisbase/inbox/proposals/skill_candidate_team.json"],
    warnings: [],
    created_at: "2026-06-03T10:07:00.000Z"
  });
}

describe("team release audit", () => {
  it("passes M28 and M29 gates when the team repair and k8s loop have real evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-team-release-audit-"));
    await createTeamLoopFixture(root);
    await buildStaticArtifacts(root);

    const report = await readTeamReleaseAuditReport(root, { now: "2026-06-03T11:00:00.000Z" });

    assert.equal(report.ok, true);
    assert.equal(report.team_repair_loop_ga, "pass");
    assert.equal(report.skill_self_evolution_ga, "pass");
    assert.equal(report.governance_ga, "pass");
    assert.equal(report.privacy_boundary_ga, "pass");
    assert.equal(report.k8s_bundle_ga, "pass");
    assert.equal(report.incident_episode_intake_ga, "pass");
    assert.equal(report.k8s_boundary_ga, "pass");
    assert.equal(report.team_ga, "pass");
  });

  it("does not fail team GA when the optional K8s domain is not seeded", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-team-release-no-k8s-"));
    await createTeamLoopFixture(root, { seedK8s: false, includeK8sEvidence: false });
    await buildStaticArtifacts(root);

    const report = await readTeamReleaseAuditReport(root, { now: "2026-06-03T11:00:00.000Z" });

    assert.equal(report.ok, true);
    assert.equal(report.team_repair_loop_ga, "pass");
    assert.equal(report.skill_self_evolution_ga, "pass");
    assert.equal(report.governance_ga, "pass");
    assert.equal(report.privacy_boundary_ga, "pass");
    assert.equal(report.k8s_bundle_ga, "not_run");
    assert.equal(report.incident_episode_intake_ga, "not_run");
    assert.equal(report.k8s_boundary_ga, "not_run");
    assert.equal(report.team_ga, "pass");
  });

  it("requires real K8s incident evidence once the K8s seed pack is enabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-team-release-k8s-seeded-"));
    await createTeamLoopFixture(root, { seedK8s: true, includeK8sEvidence: false });
    await buildStaticArtifacts(root);

    const report = await readTeamReleaseAuditReport(root, { now: "2026-06-03T11:00:00.000Z" });

    assert.equal(report.ok, false);
    assert.equal(report.k8s_bundle_ga, "pass");
    assert.equal(report.incident_episode_intake_ga, "fail");
    assert.equal(report.k8s_boundary_ga, "pass");
    assert.equal(report.team_ga, "fail");
    assert.ok(report.blocking_reasons.includes("k8s_incident_episode_missing"));
    assert.ok(report.blocking_reasons.includes("k8s_incident_proposal_missing"));
  });

  it("ignores historical personal inbox proposals while auditing team release", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-team-release-privacy-"));
    await createTeamLoopFixture(root);
    await writeJson(join(root, protocolPaths.inboxProposals, "personal_leak.json"), {
      id: "personal_leak",
      protocol_version: PROTOCOL_VERSION,
      type: "knowledge_proposal",
      scope: "personal",
      action: "patch",
      target_type: "known_fix",
      target_id: "personal-leak",
      agent_id: "codex",
      agent_type: "curator",
      environment_id: "personal-laptop",
      run_id: "run-personal",
      idempotency_key: "personal-leak",
      evidence: {
        source_uri: "raw-vault://codex/personal",
        source_hash: "sha256:personal",
        excerpt: "Personal-only repair.",
        repair_result: "success",
        verification: "Local only."
      },
      patch: {
        path: "kb/known-fixes/personal-leak.md",
        content: "# Personal Leak"
      },
      created_at: "2026-06-03T10:08:00.000Z"
    });
    await buildStaticArtifacts(root);

    const report = await readTeamReleaseAuditReport(root, { now: "2026-06-03T11:00:00.000Z" });

    assert.equal(report.ok, true);
    assert.equal(report.privacy_boundary_ga, "pass");
    assert.equal(report.blocking_reasons.some((reason) => reason.includes("personal_leak")), false);
  });

  it("fails the privacy gate when team stable knowledge contains private material", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-team-release-private-stable-"));
    await createTeamLoopFixture(root);
    await writeFile(join(root, "kb/known-fixes/team-private-host.md"), [
      "---",
      "id: team-private-host",
      "title: Team private host leak",
      "protocol_version: '0.1'",
      "type: known_fix",
      "knowledge_type: known_fix",
      "scope: team",
      "risk: medium",
      "status: draft",
      "maturity: verified",
      "signatures:",
      "  - openclaw:private-host-leak",
      "sources:",
      "  - uri: log://openclaw/team-a/private-host",
      "    hash: sha256:m28private001",
      "confidence: 0.91",
      "reference_count: 0",
      "last_referenced_at: null",
      "updated_at: '2026-06-01T00:00:00.000Z'",
      "---",
      "# Team private host leak",
      "",
      "Do not publish root@example.internal in team knowledge.",
    ].join("\n"), "utf8");
    await buildStaticArtifacts(root);

    const report = await readTeamReleaseAuditReport(root, { now: "2026-06-03T11:00:00.000Z" });

    assert.equal(report.ok, false);
    assert.equal(report.privacy_boundary_ga, "fail");
    assert.ok(report.blocking_reasons.includes("team_stable_contains_private_material:kb/known-fixes/team-private-host.md"));
  });
});
