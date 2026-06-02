import { PROTOCOL_VERSION } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { readJson, writeJson } from "../store/file-store.js";
import type { WikiState } from "./model.js";

const EMPTY_STATE: WikiState = {
  protocol_version: PROTOCOL_VERSION,
  sources: {},
};

export async function readWikiState(root: string): Promise<WikiState> {
  try {
    return await readJson<WikiState>(root, protocolPaths.wikiState);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { ...EMPTY_STATE, sources: {} };
  }
}

export async function writeWikiState(root: string, state: WikiState): Promise<void> {
  await writeJson(root, protocolPaths.wikiState, state);
}

export function getChangedWikiSources(
  current: WikiState,
  incoming: Array<{ id: string; source_hash: string }>
): Array<{ id: string; source_hash: string }> {
  return incoming.filter((src) => {
    const existing = current.sources[src.id];
    return !existing || existing.source_hash !== src.source_hash;
  });
}

export function markWikiSourcesCompiled(
  state: WikiState,
  compiled: Array<{
    id: string;
    source_hash: string;
    candidate_ids: string[];
    page_ids: string[];
  }>,
  compiledAt: string
): WikiState {
  const next: WikiState = {
    protocol_version: state.protocol_version,
    sources: { ...state.sources },
  };
  for (const entry of compiled) {
    next.sources[entry.id] = {
      source_hash: entry.source_hash,
      last_compiled_at: compiledAt,
      candidate_ids: entry.candidate_ids,
      page_ids: entry.page_ids,
    };
  }
  return next;
}
