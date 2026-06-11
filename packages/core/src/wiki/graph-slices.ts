import { PROTOCOL_VERSION } from "../protocol/types.js";
import { WikiGraphSliceSchema, type WikiGraphSlice, type WikiGraphSliceMode } from "../protocol/schemas.js";
import type { WikiGraph, WikiGraphLink, WikiGraphNode } from "./resolver.js";

export interface WikiGraphSliceOptions {
  mode: WikiGraphSliceMode;
  center?: string;
  depth?: number;
  limit?: number;
  types?: string[];
}

export function buildWikiGraphSlice(graph: WikiGraph, options: WikiGraphSliceOptions): WikiGraphSlice {
  const limit = Math.max(1, options.limit ?? 25);
  const depth = Math.max(0, options.depth ?? (options.mode === "ego" ? 1 : 0));
  const typeSet = new Set(options.types ?? []);
  const eligibleNodes = typeSet.size > 0
    ? graph.nodes.filter((node) => typeSet.has(node.kind))
    : [...graph.nodes];
  const eligibleIds = new Set(eligibleNodes.map((node) => node.id));

  const selectedIds = options.mode === "ego"
    ? egoNodeIds(graph, options.center, depth, eligibleIds)
    : overviewNodeIds(graph, eligibleNodes);

  const selectedNodes = selectedIds
    .map((id) => graph.nodes.find((node) => node.id === id))
    .filter((node): node is WikiGraphNode => Boolean(node));
  const truncated = selectedNodes.length > limit;
  const limitedNodes = selectedNodes.slice(0, limit);
  const limitedIds = new Set(limitedNodes.map((node) => node.id));
  const links = graph.links
    .filter((link) => limitedIds.has(link.from) && limitedIds.has(link.to))
    .sort(compareLinks);

  return WikiGraphSliceSchema.parse({
    protocol_version: PROTOCOL_VERSION,
    type: "wiki_graph_slice",
    mode: options.mode,
    center: options.mode === "ego" ? resolveCenter(graph, options.center).id : undefined,
    depth,
    limit,
    types: [...typeSet].sort(),
    truncated,
    truncated_node_count: truncated ? selectedNodes.length - limitedNodes.length : 0,
    nodes: limitedNodes,
    links,
  });
}

function overviewNodeIds(graph: WikiGraph, nodes: WikiGraphNode[]): string[] {
  const inDegree = new Map<string, number>();
  const totalDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    totalDegree.set(node.id, 0);
  }
  for (const link of graph.links) {
    if (totalDegree.has(link.from)) totalDegree.set(link.from, totalDegree.get(link.from)! + 1);
    if (totalDegree.has(link.to)) totalDegree.set(link.to, totalDegree.get(link.to)! + 1);
    if (inDegree.has(link.to)) inDegree.set(link.to, inDegree.get(link.to)! + 1);
  }

  return [...nodes]
    .sort((a, b) =>
      (inDegree.get(b.id)! - inDegree.get(a.id)!)
      || (totalDegree.get(b.id)! - totalDegree.get(a.id)!)
      || a.slug.localeCompare(b.slug)
      || a.id.localeCompare(b.id)
    )
    .map((node) => node.id);
}

function egoNodeIds(graph: WikiGraph, center: string | undefined, depth: number, eligibleIds: Set<string>): string[] {
  const centerNode = resolveCenter(graph, center);
  if (!eligibleIds.has(centerNode.id)) return [];

  const adjacency = new Map<string, string[]>();
  for (const link of graph.links) {
    pushAdjacent(adjacency, link.from, link.to);
    pushAdjacent(adjacency, link.to, link.from);
  }
  for (const [id, neighbors] of adjacency) {
    adjacency.set(id, [...new Set(neighbors)].sort());
  }

  const visited = new Set<string>([centerNode.id]);
  const queue: Array<{ id: string; distance: number }> = [{ id: centerNode.id, distance: 0 }];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current.distance >= depth) continue;
    for (const next of adjacency.get(current.id) ?? []) {
      if (visited.has(next) || !eligibleIds.has(next)) continue;
      visited.add(next);
      queue.push({ id: next, distance: current.distance + 1 });
    }
  }

  const order = new Map(queue.map((item, index) => [item.id, index]));
  return [...visited].sort((a, b) => order.get(a)! - order.get(b)!);
}

function resolveCenter(graph: WikiGraph, center: string | undefined): WikiGraphNode {
  if (!center) {
    throw new Error("WIKI_GRAPH_CENTER_REQUIRED: ego graph slices require --center.");
  }
  const node = graph.nodes.find((candidate) => candidate.id === center || candidate.slug === center);
  if (!node) {
    throw new Error(`WIKI_GRAPH_CENTER_NOT_FOUND: ${center}`);
  }
  return node;
}

function pushAdjacent(map: Map<string, string[]>, from: string, to: string): void {
  const existing = map.get(from);
  if (existing) existing.push(to);
  else map.set(from, [to]);
}

function compareLinks(a: WikiGraphLink, b: WikiGraphLink): number {
  return a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.type.localeCompare(b.type);
}
