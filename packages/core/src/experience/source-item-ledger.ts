import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { computeHash } from "../protocol/id.js";
import { protocolPaths } from "../protocol/paths.js";
import type { ExperienceSourceParser } from "../protocol/schemas.js";
import { readJson, writeJson } from "../store/file-store.js";

export const SOURCE_ITEM_LEDGER_VERSION = "source-item-ledger-v1";

export type SourceItemLedgerStatus = "distilled" | "human_required" | "failed" | "skipped";
export type SourceItemLedgerAuthorityMode = "personal-local" | "team-git";

export interface SourceItemLedgerKeyInput {
  source_id: string;
  source_ref: string;
  source_hash: string;
  chunk_hash: string;
  authority_mode: SourceItemLedgerAuthorityMode;
  model: string;
  parser: ExperienceSourceParser;
  reducer_identity_salt?: string;
}

export interface SourceItemLedgerEntry extends SourceItemLedgerKeyInput {
  type: "source_item_ledger_entry";
  version: typeof SOURCE_ITEM_LEDGER_VERSION;
  key: string;
  reducer_identity: string;
  status: SourceItemLedgerStatus;
  chunk_hashes: string[];
  distill_cache_path?: string;
  envelope_ids: string[];
  warnings: string[];
  processed_at: string;
  updated_at: string;
}

function reducerIdentity(input: SourceItemLedgerKeyInput): string {
  return input.reducer_identity_salt && input.reducer_identity_salt.trim()
    ? input.reducer_identity_salt
    : "none";
}

export function sourceItemLedgerKey(input: SourceItemLedgerKeyInput): string {
  return computeHash(JSON.stringify({
    source_id: input.source_id,
    source_ref: input.source_ref,
    source_hash: input.source_hash,
    chunk_hash: input.chunk_hash,
    authority_mode: input.authority_mode,
    model: input.model,
    parser: input.parser,
    reducer_identity: reducerIdentity(input),
  }));
}

export function sourceItemLedgerPath(input: SourceItemLedgerKeyInput): string {
  return `${protocolPaths.cacheSourceItems}/${sourceItemLedgerKey(input).replace(/^sha256:/, "")}.json`;
}

function parseLedgerEntry(value: unknown): SourceItemLedgerEntry | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<SourceItemLedgerEntry>;
  if (record.type !== "source_item_ledger_entry") return undefined;
  if (record.version !== SOURCE_ITEM_LEDGER_VERSION) return undefined;
  if (typeof record.key !== "string" || !record.key) return undefined;
  if (!["distilled", "human_required", "failed", "skipped"].includes(String(record.status))) return undefined;
  return record as SourceItemLedgerEntry;
}

export async function readSourceItemLedger(
  root: string,
  input: SourceItemLedgerKeyInput,
): Promise<SourceItemLedgerEntry | undefined> {
  try {
    return parseLedgerEntry(await readJson(root, sourceItemLedgerPath(input)));
  } catch {
    return undefined;
  }
}

export async function writeSourceItemLedger(
  root: string,
  input: SourceItemLedgerKeyInput,
  update: {
    status: SourceItemLedgerStatus;
    chunk_hashes?: string[];
    distill_cache_path?: string;
    envelope_ids?: string[];
    warnings?: string[];
    now: string;
  },
): Promise<SourceItemLedgerEntry> {
  const existing = await readSourceItemLedger(root, input);
  const entry: SourceItemLedgerEntry = {
    ...input,
    type: "source_item_ledger_entry",
    version: SOURCE_ITEM_LEDGER_VERSION,
    key: sourceItemLedgerKey(input),
    reducer_identity: reducerIdentity(input),
    status: update.status,
    chunk_hashes: update.chunk_hashes ?? [input.chunk_hash],
    ...(update.distill_cache_path ? { distill_cache_path: update.distill_cache_path } : {}),
    envelope_ids: update.envelope_ids ?? [],
    warnings: update.warnings ?? [],
    processed_at: existing?.processed_at ?? update.now,
    updated_at: update.now,
  };
  await writeJson(root, sourceItemLedgerPath(input), entry);
  return entry;
}

export async function listSourceItemLedgerEntries(root: string): Promise<SourceItemLedgerEntry[]> {
  let files: string[];
  try {
    files = await readdir(join(root, protocolPaths.cacheSourceItems));
  } catch {
    return [];
  }
  const entries: SourceItemLedgerEntry[] = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    try {
      const entry = parseLedgerEntry(await readJson(root, `${protocolPaths.cacheSourceItems}/${file}`));
      if (entry) entries.push(entry);
    } catch {
      // Ignore corrupt ledger entries; daily will rebuild them from source and cache state.
    }
  }
  return entries;
}
