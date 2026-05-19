import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IncidentEpisodeSchema, ProposalSchema } from "@praxisbase/core/protocol/schemas.js";
import { formatIncidentSummary, formatProposalDraft, generateProposalDraft } from "@praxisbase/core/feishu/summary.js";

describe("Feishu summary helper", () => {
  it("formats incident episode into Feishu card payload", async () => {
    const raw = await readFile("tests/fixtures/k8s/episodes/oomkilled-confirmed.json", "utf8");
    const episode = IncidentEpisodeSchema.parse(JSON.parse(raw));

    const payload = formatIncidentSummary(episode);

    assert.equal(payload.msg_type, "interactive");
    assert.ok(payload.card.header.title.content.includes("k8s:pod-oomkilled"));
    assert.equal(payload.card.header.template, "green");
    assert.ok(payload.card.elements.length >= 3);
    assert.ok(
      payload.card.elements.some(
        (el) => el.text?.content?.includes("prod")
      )
    );
  });

  it("uses yellow template for inconclusive results", async () => {
    const episode = IncidentEpisodeSchema.parse({
      id: "ep_test",
      protocol_version: "0.1",
      type: "incident_episode",
      scope: "team",
      agent_id: "sre",
      agent_type: "live_incident_analyzer",
      environment_id: "prod",
      run_id: "r1",
      idempotency_key: "ep_test",
      problem_signature: "k8s:test",
      result: "inconclusive",
      used_skills: [],
      used_objects: [],
      source_refs: ["k8s://test"],
      evidence_summary: "Inconclusive.",
      created_at: "2026-05-18T10:00:00Z",
    });

    const payload = formatIncidentSummary(episode);
    assert.equal(payload.card.header.template, "yellow");
  });

  it("formats proposal draft card", async () => {
    const raw = await readFile("tests/fixtures/k8s/episodes/oomkilled-confirmed.json", "utf8");
    const episode = IncidentEpisodeSchema.parse(JSON.parse(raw));

    const payload = formatProposalDraft(episode, "kb/known-fixes/k8s-pod-oomkilled.md");

    assert.equal(payload.msg_type, "interactive");
    assert.ok(payload.card.header.title.content.includes("Knowledge Proposal"));
    assert.ok(
      payload.card.elements.some(
        (el) => el.text?.content?.includes("kb/known-fixes/k8s-pod-oomkilled.md")
      )
    );
  });

  it("contains no network calls or credentials", () => {
    const payload = formatIncidentSummary(
      IncidentEpisodeSchema.parse({
        id: "ep_test",
        protocol_version: "0.1",
        type: "incident_episode",
        scope: "team",
        agent_id: "sre",
        agent_type: "live_incident_analyzer",
        environment_id: "prod",
        run_id: "r1",
        idempotency_key: "ep_test",
        problem_signature: "k8s:test",
        result: "confirmed",
        used_skills: [],
        used_objects: [],
        source_refs: ["k8s://test"],
        evidence_summary: "Test.",
        created_at: "2026-05-18T10:00:00Z",
      })
    );

    const serialized = JSON.stringify(payload);
    assert.ok(!serialized.includes("http"));
    assert.ok(!serialized.includes("token"));
    assert.ok(!serialized.includes("secret"));
  });

  it("generates valid proposal draft from incident episode", async () => {
    const raw = await readFile("tests/fixtures/k8s/episodes/oomkilled-confirmed.json", "utf8");
    const episode = IncidentEpisodeSchema.parse(JSON.parse(raw));

    const proposal = generateProposalDraft(
      episode,
      "kb/known-fixes/k8s-pod-oomkilled.md",
      "# K8s Pod OOMKilled\n\n## Fix\nRecommendation: increase memory limits.\n",
    );

    const validated = ProposalSchema.parse(proposal);
    assert.equal(validated.target_type, "known_fix");
    assert.equal(validated.action, "create");
    assert.equal(validated.patch.path, "kb/known-fixes/k8s-pod-oomkilled.md");
    assert.ok(validated.evidence.source_hash.startsWith("sha256:"));
    assert.ok(validated.evidence.source_uri.length > 0);
    assert.ok(validated.evidence.excerpt.length > 0);
  });

  it("generateProposalDraft hash is deterministic", async () => {
    const raw = await readFile("tests/fixtures/k8s/episodes/oomkilled-confirmed.json", "utf8");
    const episode = IncidentEpisodeSchema.parse(JSON.parse(raw));

    const a = generateProposalDraft(episode, "kb/test.md", "# content");
    const b = generateProposalDraft(episode, "kb/test.md", "# content");

    assert.equal(a.evidence.source_hash, b.evidence.source_hash);
  });
});
