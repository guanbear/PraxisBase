import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  topicKeyForObservation,
  buildWikiTopics,
  loadExistingWikiPages,
  planWikiPages,
} from "@praxisbase/core";
import type { WikiObservation, ExistingWikiPage } from "@praxisbase/core";
import type { WikiRelationshipPlan } from "@praxisbase/core/wiki/relationship-planner.js";

function obs(overrides: Partial<WikiObservation> = {}): WikiObservation {
  return {
    id: "obs-1",
    evidence_id: "ev-obs-1",
    source_ref: "raw-vault://codex/s1",
    source_hash: "sha256:abc",
    scope: "personal",
    agent: "codex",
    kind: "fix",
    problem: "ACK timing slow",
    action: "Refresh login",
    outcome: "success",
    verification: "Verification passed",
    reusable_lesson: "Reuse this fix for the same trigger",
    entities: ["openclaw", "auth"],
    topics: [],
    raw_excerpt: "ACK timing slow",
    confidence: 0.85,
    privacy_verdict: "safe",
    filtered_out: false,
    ...overrides,
  };
}

describe("topicKeyForObservation", () => {
  it("uses normalized problem + action + entities + scope, not source id/hash", () => {
    const o1 = obs({ source_ref: "raw-vault://codex/s1", source_hash: "sha256:abc" });
    const o2 = obs({ source_ref: "raw-vault://codex/s2", source_hash: "sha256:def" });
    assert.equal(topicKeyForObservation(o1), topicKeyForObservation(o2));
  });

  it("produces different keys for different problems", () => {
    const o1 = obs({ problem: "ACK timing slow" });
    const o2 = obs({ problem: "stdin closed unexpectedly" });
    assert.notEqual(topicKeyForObservation(o1), topicKeyForObservation(o2));
  });

  it("produces different keys for different scopes", () => {
    const o1 = obs({ scope: "personal" });
    const o2 = obs({ scope: "team" });
    assert.notEqual(topicKeyForObservation(o1), topicKeyForObservation(o2));
  });

  it("sorts entities so order does not matter", () => {
    const o1 = obs({ entities: ["auth", "openclaw"] });
    const o2 = obs({ entities: ["openclaw", "auth"] });
    assert.equal(topicKeyForObservation(o1), topicKeyForObservation(o2));
  });

  it("handles missing optional fields", () => {
    const o = obs({ problem: undefined, action: undefined, entities: [] });
    const key = topicKeyForObservation(o);
    assert.ok(key.includes("unknown-problem"));
    assert.ok(key.includes("unknown-action"));
    assert.ok(key.includes("no-entities"));
  });
});

describe("buildWikiTopics", () => {
  it("merges repeated ACK timing observations into one topic", () => {
    const observations = [
      obs({
        id: "obs-ack-1",
        source_ref: "s://ack-1",
        source_hash: "sha256:ack1",
        problem: "ACK timing slow on repeated runs",
        action: "Refresh OpenClaw login",
        entities: ["openclaw", "auth"],
      }),
      obs({
        id: "obs-ack-2",
        source_ref: "s://ack-2",
        source_hash: "sha256:ack2",
        problem: "ACK timing slow on repeated runs",
        action: "Refresh OpenClaw login",
        entities: ["openclaw", "auth"],
      }),
    ];
    const topics = buildWikiTopics(observations);
    const ackTopics = topics.filter((t) =>
      t.title.includes("ACK timing"),
    );
    assert.equal(ackTopics.length, 1);
    assert.equal(ackTopics[0].observation_ids.length, 2);
    assert.ok(ackTopics[0].source_refs.includes("s://ack-1"));
    assert.ok(ackTopics[0].source_refs.includes("s://ack-2"));
  });

  it("merges repeated stdin-closed observations into one topic", () => {
    const observations = [
      obs({
        id: "obs-stdin-1",
        source_ref: "s://stdin-1",
        source_hash: "sha256:stdin1",
        problem: "stdin closed unexpectedly",
        action: "Restart agent session",
        entities: ["codex"],
      }),
      obs({
        id: "obs-stdin-2",
        source_ref: "s://stdin-2",
        source_hash: "sha256:stdin2",
        problem: "stdin closed unexpectedly",
        action: "Restart agent session",
        entities: ["codex"],
      }),
    ];
    const topics = buildWikiTopics(observations);
    const stdinTopics = topics.filter((t) =>
      t.title.includes("stdin"),
    );
    assert.equal(stdinTopics.length, 1);
    assert.equal(stdinTopics[0].observation_ids.length, 2);
  });

  it("keeps separate topics for different problems", () => {
    const observations = [
      obs({ id: "o1", problem: "ACK timing slow", action: "Refresh" }),
      obs({ id: "o2", problem: "stdin closed", action: "Restart" }),
    ];
    const topics = buildWikiTopics(observations);
    assert.equal(topics.length, 2);
  });

  it("filters out observations with filtered_out=true", () => {
    const observations = [
      obs({ id: "o1", filtered_out: true }),
      obs({ id: "o2", filtered_out: false }),
    ];
    const topics = buildWikiTopics(observations);
    assert.equal(topics.length, 1);
    assert.deepEqual(topics[0].observation_ids, ["o2"]);
  });

  it("filters out observations with privacy_verdict=reject", () => {
    const observations = [
      obs({ id: "o1", privacy_verdict: "reject" }),
      obs({ id: "o2", privacy_verdict: "safe" }),
    ];
    const topics = buildWikiTopics(observations);
    assert.equal(topics.length, 1);
  });

  it("returns empty array for no observations", () => {
    assert.deepEqual(buildWikiTopics([]), []);
  });
});

describe("loadExistingWikiPages", () => {
  it("reads kb/ and skills/ markdown files", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "wiki-planner-"));
    await mkdir(join(tmp, "kb", "known-fixes"), { recursive: true });
    await mkdir(join(tmp, "skills", "my-skill"), { recursive: true });
    await writeFile(
      join(tmp, "kb", "known-fixes", "auth-expired.md"),
      [
        "---",
        "title: OpenClaw auth expired",
        "scope: project",
        "sources:",
        "  - uri: \"raw-vault://codex/s1\"",
        "    hash: \"sha256:abc\"",
        "---",
        "# OpenClaw auth expired",
      ].join("\n"),
    );
    await writeFile(
      join(tmp, "skills", "my-skill", "SKILL.md"),
      [
        "---",
        "title: My skill",
        "scope: team",
        "sources:",
        "  - uri: \"skill://ref\"",
        "    hash: \"sha256:skill1\"",
        "---",
        "# My skill",
      ].join("\n"),
    );

    const pages = await loadExistingWikiPages(tmp);
    assert.equal(pages.length, 2);
    const authPage = pages.find((p) => p.title === "OpenClaw auth expired");
    assert.ok(authPage);
    assert.equal(authPage.scope, "project");
    assert.deepEqual(authPage.source_hashes, ["sha256:abc"]);
    assert.equal(authPage.path, "kb/known-fixes/auth-expired.md");

    const skillPage = pages.find((p) => p.title === "My skill");
    assert.ok(skillPage);
    assert.equal(skillPage.scope, "team");
  });

  it("returns empty when kb/ and skills/ do not exist", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "wiki-planner-"));
    const pages = await loadExistingWikiPages(tmp);
    assert.deepEqual(pages, []);
  });
});

describe("planWikiPages", () => {
  it("creates plans when no existing pages", () => {
    const topics = buildWikiTopics([
      obs({ id: "o1", problem: "ACK timing slow", action: "Refresh" }),
    ]);
    const plans = planWikiPages(topics, []);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, "create");
    assert.equal(plans[0].existing_path, undefined);
  });

  it("creates update plan when stable matching page exists by target path", () => {
    const topics = buildWikiTopics([
      obs({ id: "o1", problem: "ACK timing slow", action: "Refresh login", entities: ["openclaw"] }),
    ]);
    const existing: ExistingWikiPage[] = [
      {
        path: topics[0].target_path,
        title: "ACK timing slow",
        slug: "ack-timing-slow",
        source_hashes: ["sha256:old"],
        entities: ["openclaw"],
        scope: "personal",
        frontmatter_sources: [],
      },
    ];
    const plans = planWikiPages(topics, existing);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, "update");
    assert.equal(plans[0].existing_path, topics[0].target_path);
  });

  it("creates update plan when source hash matches existing page", () => {
    const topics = buildWikiTopics([
      obs({
        id: "o1",
        problem: "ACK timing slow",
        action: "Refresh login",
        source_hash: "sha256:same",
      }),
    ]);
    const existing: ExistingWikiPage[] = [
      {
        path: "kb/known-fixes/different-slug.md",
        title: "Different title",
        slug: "different-slug",
        source_hashes: ["sha256:same"],
        entities: [],
        scope: "personal",
        frontmatter_sources: [],
      },
    ];
    const plans = planWikiPages(topics, existing);
    assert.equal(plans[0].action, "update");
    assert.equal(plans[0].existing_path, "kb/known-fixes/different-slug.md");
    assert.equal(plans[0].existing_source_hash, "sha256:same");
  });

  it("same source hash does not produce multiple create plans", () => {
    const observations = [
      obs({
        id: "o1",
        problem: "Problem A",
        action: "Fix A",
        entities: ["x"],
        source_hash: "sha256:shared",
        source_ref: "s://1",
      }),
      obs({
        id: "o2",
        problem: "Problem B",
        action: "Fix B",
        entities: ["y"],
        source_hash: "sha256:shared",
        source_ref: "s://2",
      }),
    ];
    const topics = buildWikiTopics(observations);
    const plans = planWikiPages(topics, []);
    const createPlans = plans.filter((p) => p.action === "create");
    assert.equal(
      createPlans.length,
      plans.length - 1,
      `Expected at most ${plans.length - 1} create plans, got ${createPlans.length}`,
    );
  });

  it("produces update plan for existing page matching by normalized slug", () => {
    const topics = buildWikiTopics([
      obs({
        id: "o1",
        problem: "OpenClaw auth expired",
        action: "Refresh login",
        entities: ["openclaw"],
      }),
    ]);
    const existing: ExistingWikiPage[] = [
      {
        path: "kb/known-fixes/openclaw-auth-expired.md",
        title: "OpenClaw Auth Expired",
        slug: "openclaw-auth-expired",
        source_hashes: ["sha256:old"],
        entities: ["openclaw"],
        scope: "personal",
        frontmatter_sources: [],
      },
    ];
    const plans = planWikiPages(topics, existing);
    assert.equal(plans[0].action, "update");
  });
});

describe("planWikiPages with relationship plans", () => {
  it("rewrites create to update when a canonical relationship exists", () => {
    const topics = buildWikiTopics([
      obs({
        id: "o1",
        problem: "ACK timing slow",
        action: "Refresh login",
        entities: ["openclaw"],
        source_hash: "sha256:ack",
      }),
    ]);
    const existing: ExistingWikiPage[] = [
      {
        path: "kb/known-fixes/openclaw-ack-timing.md",
        title: "OpenClaw ACK timing",
        slug: "openclaw-ack-timing",
        source_hashes: ["sha256:ack"],
        entities: ["openclaw"],
        scope: "personal",
        frontmatter_sources: [],
      },
    ];
    const relationships: WikiRelationshipPlan[] = [
      {
        topic_id: topics[0].id,
        target_page_id: "kb/known-fixes/openclaw-ack-timing.md",
        target_path: "kb/known-fixes/openclaw-ack-timing.md",
        target_title: "OpenClaw ACK timing",
        target_slug: "openclaw-ack-timing",
        strength: "canonical",
        reasons: ["shared_source_hash"],
        required_link: true,
        suggested_label: "OpenClaw ACK timing",
        merge_candidate: true,
      },
    ];

    const plans = planWikiPages(topics, existing, { relationships });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, "update");
    assert.equal(plans[0].existing_path, "kb/known-fixes/openclaw-ack-timing.md");
    assert.ok(plans[0].reasons.includes("canonical_relationship"));
    assert.equal(plans[0].existing_source_hash, "sha256:ack");
  });

  it("produces merge with ambiguous_merge_target when multiple canonical pages match", () => {
    const topics = buildWikiTopics([
      obs({
        id: "o1",
        problem: "ACK timing slow",
        action: "Refresh login",
        entities: ["openclaw"],
        source_hash: "sha256:shared",
      }),
    ]);
    const existing: ExistingWikiPage[] = [
      {
        path: "kb/known-fixes/openclaw-ack-v1.md",
        title: "OpenClaw ACK v1",
        slug: "openclaw-ack-v1",
        source_hashes: ["sha256:shared"],
        entities: ["openclaw"],
        scope: "personal",
        frontmatter_sources: [],
      },
      {
        path: "kb/known-fixes/openclaw-ack-v2.md",
        title: "OpenClaw ACK v2",
        slug: "openclaw-ack-v2",
        source_hashes: ["sha256:shared"],
        entities: ["openclaw"],
        scope: "personal",
        frontmatter_sources: [],
      },
    ];
    const relationships: WikiRelationshipPlan[] = [
      {
        topic_id: topics[0].id,
        target_page_id: "kb/known-fixes/openclaw-ack-v1.md",
        target_path: "kb/known-fixes/openclaw-ack-v1.md",
        target_title: "OpenClaw ACK v1",
        target_slug: "openclaw-ack-v1",
        strength: "canonical",
        reasons: ["shared_source_hash"],
        required_link: true,
        suggested_label: "OpenClaw ACK v1",
        merge_candidate: true,
      },
      {
        topic_id: topics[0].id,
        target_page_id: "kb/known-fixes/openclaw-ack-v2.md",
        target_path: "kb/known-fixes/openclaw-ack-v2.md",
        target_title: "OpenClaw ACK v2",
        target_slug: "openclaw-ack-v2",
        strength: "canonical",
        reasons: ["shared_source_hash"],
        required_link: true,
        suggested_label: "OpenClaw ACK v2",
        merge_candidate: true,
      },
    ];

    const plans = planWikiPages(topics, existing, { relationships });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, "merge");
    assert.ok(plans[0].reasons.includes("ambiguous_merge_target"));
    assert.ok(plans[0].reasons.includes("multiple_canonical_targets"));
    assert.equal(plans[0].existing_path, "kb/known-fixes/openclaw-ack-v1.md");
  });

  it("keeps create but adds required_links for strong relationships", () => {
    const topics = buildWikiTopics([
      obs({
        id: "o1",
        problem: "New auth issue",
        action: "Refresh token",
        entities: ["openclaw", "auth"],
        source_hash: "sha256:new-issue",
      }),
    ]);
    const existing: ExistingWikiPage[] = [
      {
        path: "kb/known-fixes/auth-expired.md",
        title: "Auth expired fix",
        slug: "auth-expired",
        source_hashes: ["sha256:old"],
        entities: ["auth"],
        scope: "personal",
        frontmatter_sources: [],
      },
    ];
    const relationships: WikiRelationshipPlan[] = [
      {
        topic_id: topics[0].id,
        target_page_id: "kb/known-fixes/auth-expired.md",
        target_path: "kb/known-fixes/auth-expired.md",
        target_title: "Auth expired fix",
        target_slug: "auth-expired",
        strength: "strong",
        reasons: ["shared_signature"],
        required_link: true,
        suggested_label: "Auth expired fix",
        merge_candidate: false,
      },
    ];

    const plans = planWikiPages(topics, existing, { relationships });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, "create");
    assert.ok(plans[0].required_links.includes("auth-expired"));
  });

  it("keeps create but adds related_paths for related relationships", () => {
    const topics = buildWikiTopics([
      obs({
        id: "o1",
        problem: "New networking issue",
        action: "Restart proxy",
        entities: ["network", "proxy"],
        source_hash: "sha256:net-issue",
      }),
    ]);
    const relationships: WikiRelationshipPlan[] = [
      {
        topic_id: topics[0].id,
        target_page_id: "kb/notes/proxy-notes.md",
        target_path: "kb/notes/proxy-notes.md",
        target_title: "Proxy notes",
        target_slug: "proxy-notes",
        strength: "related",
        reasons: ["entity_overlap"],
        required_link: false,
        suggested_label: "Proxy notes",
        merge_candidate: false,
      },
    ];

    const plans = planWikiPages(topics, [], { relationships });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].action, "create");
    assert.ok(plans[0].related_paths.includes("kb/notes/proxy-notes.md"));
  });

  it("falls back to existing matching when no relationships are provided", () => {
    const topics = buildWikiTopics([
      obs({
        id: "o1",
        problem: "ACK timing slow",
        action: "Refresh login",
        source_hash: "sha256:same",
        entities: ["openclaw"],
      }),
    ]);
    const existing: ExistingWikiPage[] = [
      {
        path: "kb/known-fixes/different-slug.md",
        title: "Different title",
        slug: "different-slug",
        source_hashes: ["sha256:same"],
        entities: [],
        scope: "personal",
        frontmatter_sources: [],
      },
    ];

    const plans = planWikiPages(topics, existing);
    assert.equal(plans[0].action, "update");
    assert.equal(plans[0].existing_path, "kb/known-fixes/different-slug.md");
  });
});
