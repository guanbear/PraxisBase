import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  MemoryImportReportSchema,
  MemoryRefreshPlanSchema,
  NativeMemorySourceSchema,
  type MemoryImportReport,
  type MemoryRefreshPlan,
  type NativeMemorySource,
} from "../protocol/schemas.js";
import { makeId } from "../protocol/id.js";
import { PROTOCOL_VERSION, type AgentProfile } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { readJson, writeJson } from "../store/file-store.js";
import { validateRawArtifactRef } from "./raw-vault.js";
import { PraxisBaseError } from "./errors.js";

export interface ImportNativeMemoryInput {
  agent: AgentProfile;
  source: string;
  json?: boolean;
}

export interface PlanMemoryRefreshInput {
  agent: AgentProfile;
  target: "context" | "instruction-snippet" | "patch-proposal";
  contextRefs: string[];
}

async function listJsonFiles(root: string, relativePath: string): Promise<string[]> {
  try {
    return (await readdir(join(root, relativePath))).filter((entry) => entry.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function hasImportedSourceHash(root: string, sourceHash: string): Promise<boolean> {
  const reportFiles = await listJsonFiles(root, protocolPaths.reportsMemory);

  for (const file of reportFiles) {
    const report = await readJson<{ source_hashes?: string[] }>(root, `${protocolPaths.reportsMemory}/${file}`);
    if (report.source_hashes?.includes(sourceHash)) return true;
  }

  return false;
}

function defaultScopeFor(source: NativeMemorySource): "personal" | "project" | "team" | "global" | "org" {
  if (source.agent === "openhuman" || source.kind === "preference") return "personal";
  return source.scope_hint;
}

function shouldCreateProposal(source: NativeMemorySource): boolean {
  return source.agent === "hermes" && source.kind === "skill_summary";
}

function refreshKind(target: PlanMemoryRefreshInput["target"]): "context_bundle" | "install_snippet" | "patch_proposal" {
  if (target === "instruction-snippet") return "install_snippet";
  if (target === "patch-proposal") return "patch_proposal";
  return "context_bundle";
}

export async function importNativeMemory(root: string, input: ImportNativeMemoryInput): Promise<MemoryImportReport> {
  const source = NativeMemorySourceSchema.parse(await readJson(root, input.source));
  if (source.agent !== input.agent) {
    throw new PraxisBaseError(
      "NATIVE_MEMORY_AGENT_MISMATCH",
      "Native memory source agent must match the import agent.",
      { expected: input.agent, actual: source.agent }
    );
  }

  validateRawArtifactRef(source.source_ref);

  const id = makeId("memory-import", `${input.agent}-${source.source_hash}`);
  const createdAt = new Date().toISOString();
  const duplicate = await hasImportedSourceHash(root, source.source_hash);
  const warnings = duplicate ? [`Duplicate native memory source hash: ${source.source_hash}`] : [];
  const proposalCandidates: string[] = [];

  if (!duplicate && shouldCreateProposal(source)) {
    const proposalId = makeId("native-memory-proposal", `${input.agent}-${source.source_hash}`);
    const proposalPath = `.praxisbase/inbox/proposals/${proposalId}.json`;
    await writeJson(root, proposalPath, {
      id: proposalId,
      protocol_version: PROTOCOL_VERSION,
      type: "native_memory_proposal_candidate",
      agent: input.agent,
      kind: source.kind,
      source_ref: source.source_ref,
      source_hash: source.source_hash,
      redacted_summary: source.redacted_summary,
      scope_hint: defaultScopeFor(source),
      changed_stable_knowledge: false,
      created_at: createdAt,
    });
    proposalCandidates.push(proposalPath);
  }

  const report = MemoryImportReportSchema.parse({
    id,
    protocol_version: PROTOCOL_VERSION,
    type: "memory_import_report",
    agent: input.agent,
    imported_sources: duplicate ? 0 : 1,
    proposal_candidates: proposalCandidates,
    capture_candidates: [],
    default_scope: defaultScopeFor(source),
    changed_stable_knowledge: false,
    warnings,
    created_at: createdAt,
  });

  const reportWithSourceHashes = {
    ...report,
    source_hashes: [source.source_hash],
  };

  await writeJson(root, `${protocolPaths.reportsMemory}/${id}.json`, reportWithSourceHashes);
  await writeJson(root, `${protocolPaths.runsMemoryImport}/${id}.json`, {
    id,
    protocol_version: PROTOCOL_VERSION,
    command: "memory-import",
    status: duplicate ? "partial" : "completed",
    source_file: basename(input.source),
    source_hashes: duplicate ? [] : [source.source_hash],
    started_at: createdAt,
    finished_at: createdAt,
    counts: {
      imported_sources: report.imported_sources,
      proposal_candidates: proposalCandidates.length,
    },
    errors: [],
    warnings,
  });

  return report;
}

export async function planMemoryRefresh(input: PlanMemoryRefreshInput): Promise<MemoryRefreshPlan> {
  return MemoryRefreshPlanSchema.parse({
    agent: input.agent,
    target: input.target,
    writes_native_memory: false,
    outputs: [
      {
        kind: refreshKind(input.target),
        source_refs: input.contextRefs,
        target_path: input.target === "context" ? ".praxisbase/memory-refresh/context.json" : undefined,
      },
    ],
    created_at: new Date().toISOString(),
  });
}
