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
