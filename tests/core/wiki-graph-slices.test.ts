import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WikiGraphSliceSchema } from "@praxisbase/core/protocol/schemas.js";
import { buildWikiGraph } from "@praxisbase/core/wiki/resolver.js";
import { buildWikiGraphSlice } from "@praxisbase/core/wiki/graph-slices.js";

const graph = buildWikiGraph([
  {
    id: "auth",
    slug: "auth",
    title: "Auth",
    page_kind: "known_fix",
    scope: "team",
    maturity: "proven",
    source_ids: ["sha256:auth"],
    body_markdown: "[[worker]]\n[[deploy]]",
  },
  {
    id: "worker",
    slug: "worker",
    title: "Worker",
    page_kind: "procedure",
    scope: "team",
    maturity: "verified",
    source_ids: ["sha256:worker"],
    body_markdown: "[[deploy]]",
  },
  {
    id: "deploy",
    slug: "deploy",
    title: "Deploy",
    page_kind: "decision",
    scope: "team",
    maturity: "draft",
    source_ids: ["sha256:deploy"],
    body_markdown: "",
  },
  {
    id: "pitfall",
    slug: "pitfall",
    title: "Pitfall",
    page_kind: "pitfall",
    scope: "team",
    maturity: "draft",
    source_ids: ["sha256:pitfall"],
    body_markdown: "",
  },
]);

describe("buildWikiGraphSlice", () => {
  it("builds deterministic overview slices with truncation metadata", () => {
    const slice = buildWikiGraphSlice(graph, { mode: "overview", limit: 2 });

    assert.equal(slice.mode, "overview");
    assert.deepEqual(slice.nodes.map((node) => node.id), ["deploy", "worker"]);
    assert.equal(slice.truncated, true);
    assert.equal(slice.truncated_node_count, 2);
    assert.ok(WikiGraphSliceSchema.safeParse(slice).success);
  });

  it("builds ego slices with bounded BFS depth", () => {
    const slice = buildWikiGraphSlice(graph, { mode: "ego", center: "auth", depth: 1, limit: 10 });

    assert.equal(slice.mode, "ego");
    assert.equal(slice.center, "auth");
    assert.deepEqual(slice.nodes.map((node) => node.id).sort(), ["auth", "deploy", "worker"]);
    assert.ok(slice.links.every((link) => slice.nodes.some((node) => node.id === link.from) && slice.nodes.some((node) => node.id === link.to)));
  });

  it("filters by node kind before slicing", () => {
    const slice = buildWikiGraphSlice(graph, { mode: "overview", limit: 10, types: ["procedure"] });

    assert.deepEqual(slice.nodes.map((node) => node.kind), ["procedure"]);
    assert.equal(slice.links.length, 0);
  });

  it("throws for missing ego centers", () => {
    assert.throws(
      () => buildWikiGraphSlice(graph, { mode: "ego", center: "missing", depth: 1, limit: 10 }),
      /WIKI_GRAPH_CENTER_NOT_FOUND/
    );
  });
});
