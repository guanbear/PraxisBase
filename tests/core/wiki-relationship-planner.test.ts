import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWikiRelationshipPlans,
  type RelationshipTopic,
  type RelationshipWikiPage,
} from "@praxisbase/core/wiki/relationship-planner.js";

function topic(overrides: Partial<RelationshipTopic> = {}): RelationshipTopic {
  return {
    id: "topic_1",
    title: "Test Topic",
    source_hashes: [],
    entities: [],
    ...overrides,
  };
}

function page(overrides: Partial<RelationshipWikiPage> = {}): RelationshipWikiPage {
  return {
    id: "page_1",
    path: "kb/notes/test.md",
    title: "Test Page",
    slug: "test-page",
    source_hashes: [],
    ...overrides,
  };
}

describe("buildWikiRelationshipPlans", () => {
  it("marks same source hash as canonical, required, and merge_candidate", () => {
    const plans = buildWikiRelationshipPlans({
      topics: [topic({
        id: "topic_ack",
        title: "OpenClaw ACK timing",
        source_hashes: ["sha256:ack"],
        entities: ["openclaw", "ack"],
        problem: "OpenClaw waits too long before acknowledging delegated tasks",
        action: "Send accepted ack before async processing",
      })],
      existingPages: [page({
        id: "openclaw-ack-timing",
        path: "kb/known-fixes/openclaw-ack-timing.md",
        title: "OpenClaw ACK timing",
        slug: "openclaw-ack-timing",
        source_hashes: ["sha256:ack"],
        signatures: ["openclaw:ack"],
        body_text: "Existing ACK page.",
      })],
    });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].strength, "canonical");
    assert.equal(plans[0].required_link, true);
    assert.equal(plans[0].merge_candidate, true);
    assert.ok(plans[0].reasons.includes("shared_source_hash"));
    assert.equal(plans[0].topic_id, "topic_ack");
    assert.equal(plans[0].target_page_id, "openclaw-ack-timing");
  });

  it("marks shared signature as strong and required but not merge_candidate", () => {
    const plans = buildWikiRelationshipPlans({
      topics: [topic({
        id: "topic_sig",
        title: "Auth token refresh flow",
        source_hashes: ["sha256:new"],
        signatures: ["auth:token"],
        entities: ["auth"],
      })],
      existingPages: [page({
        id: "auth-refresh",
        path: "kb/known-fixes/auth-refresh.md",
        title: "Auth token expired handling",
        slug: "auth-refresh",
        source_hashes: ["sha256:old"],
        signatures: ["auth:token"],
      })],
    });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].strength, "strong");
    assert.equal(plans[0].required_link, true);
    assert.equal(plans[0].merge_candidate, false);
    assert.ok(plans[0].reasons.includes("shared_signature"));
  });

  it("marks same title or slug as canonical", () => {
    const plans = buildWikiRelationshipPlans({
      topics: [topic({
        id: "topic_title",
        title: "OpenClaw ACK Timing",
        source_hashes: ["sha256:unique"],
        entities: [],
      })],
      existingPages: [page({
        id: "ack-page",
        path: "kb/known-fixes/ack.md",
        title: "OpenClaw ACK timing",
        slug: "openclaw-ack-timing",
        source_hashes: ["sha256:other"],
      })],
    });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].strength, "canonical");
    assert.equal(plans[0].required_link, true);
    assert.equal(plans[0].merge_candidate, true);
    assert.ok(plans[0].reasons.includes("same_title_or_slug"));
  });

  it("marks entity overlap as related but not required", () => {
    const plans = buildWikiRelationshipPlans({
      topics: [topic({
        id: "topic_ent",
        title: "K8s pod restart loop",
        source_hashes: ["sha256:k8s"],
        entities: ["kubernetes", "pod"],
      })],
      existingPages: [page({
        id: "k8s-page",
        path: "kb/procedures/k8s-deploy.md",
        title: "Kubernetes deployment",
        slug: "k8s-deploy",
        source_hashes: ["sha256:deploy"],
        entities: ["kubernetes", "deployment"],
      })],
    });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].strength, "related");
    assert.equal(plans[0].required_link, false);
    assert.equal(plans[0].merge_candidate, false);
    assert.ok(plans[0].reasons.includes("entity_overlap"));
  });

  it("produces no plan when no signal matches", () => {
    const plans = buildWikiRelationshipPlans({
      topics: [topic({
        id: "topic_isolated",
        title: "Completely unrelated topic",
        source_hashes: ["sha256:unique"],
        entities: ["frobnicator"],
        problem: "Frobnicator fails on startup",
        action: "Check the flange bolts",
      })],
      existingPages: [page({
        id: "unrelated-page",
        path: "kb/notes/different.md",
        title: "Totally different page",
        slug: "different-page",
        source_hashes: ["sha256:other"],
        entities: ["widget"],
        body_text: "Widget assembly instructions.",
      })],
    });

    assert.equal(plans.length, 0);
  });

  it("respects maxRelatedPerTopic and sorts deterministically", () => {
    const t = topic({
      id: "topic_multi",
      title: "Multi-match topic",
      source_hashes: ["sha256:multi"],
      signatures: ["shared-sig"],
      entities: ["shared-entity", "unique-entity"],
    });

    const pages: RelationshipWikiPage[] = [
      page({ id: "p_weak", title: "Z Weak", slug: "z-weak", source_hashes: ["sha256:other"], entities: [] }),
      page({ id: "p_ent", title: "M Entity", slug: "m-entity", source_hashes: ["sha256:other2"], entities: ["shared-entity"] }),
      page({ id: "p_sig", title: "A Sig", slug: "a-sig", source_hashes: ["sha256:other3"], signatures: ["shared-sig"] }),
      page({ id: "p_hash", title: "B Hash", slug: "b-hash", source_hashes: ["sha256:multi"] }),
      page({ id: "p_extra", title: "C Extra", slug: "c-extra", source_hashes: ["sha256:other4"], entities: ["shared-entity"] }),
      page({ id: "p_extra2", title: "D Extra2", slug: "d-extra2", source_hashes: ["sha256:other5"], entities: ["shared-entity"] }),
    ];

    const plans = buildWikiRelationshipPlans({
      topics: [t],
      existingPages: pages,
      maxRelatedPerTopic: 3,
    });

    assert.equal(plans.length, 3);

    assert.equal(plans[0].target_page_id, "p_hash");
    assert.equal(plans[0].strength, "canonical");
    assert.equal(plans[1].target_page_id, "p_sig");
    assert.equal(plans[1].strength, "strong");
    assert.equal(plans[2].strength, "related");
    assert.ok(["p_extra", "p_extra2", "p_ent"].includes(plans[2].target_page_id));
  });

  it("sorts deterministically across multiple topics", () => {
    const t1 = topic({ id: "topic_z", title: "Z topic", source_hashes: ["sha256:shared"], entities: ["entity"] });
    const t2 = topic({ id: "topic_a", title: "A topic", source_hashes: ["sha256:shared"], entities: ["entity"] });

    const p = page({
      id: "shared-page",
      title: "Shared page",
      slug: "shared",
      source_hashes: ["sha256:shared"],
    });

    const plans = buildWikiRelationshipPlans({
      topics: [t1, t2],
      existingPages: [p],
    });

    assert.equal(plans.length, 2);
    // Same strength/title/path, so sorted by topic_id: "topic_a" < "topic_z"
    assert.equal(plans[0].topic_id, "topic_a");
    assert.equal(plans[1].topic_id, "topic_z");
  });

  it("marks problem_action_overlap as strong", () => {
    const plans = buildWikiRelationshipPlans({
      topics: [topic({
        id: "topic_pao",
        title: "DNS resolution timeout",
        source_hashes: ["sha256:dns"],
        entities: [],
        problem: "DNS resolution times out after 30 seconds",
        action: "Increase DNS timeout and add fallback resolver",
      })],
      existingPages: [page({
        id: "dns-page",
        path: "kb/known-fixes/dns.md",
        title: "DNS issues",
        slug: "dns-issues",
        source_hashes: ["sha256:other"],
        body_text: "DNS resolution times out. Increase DNS timeout to fix.",
      })],
    });

    assert.equal(plans.length, 1);
    assert.equal(plans[0].strength, "strong");
    assert.equal(plans[0].required_link, true);
    assert.ok(plans[0].reasons.includes("problem_action_overlap"));
  });
});
