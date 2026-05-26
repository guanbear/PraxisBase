import { listExperienceSources } from "@praxisbase/core/experience/source-config.js";
import { resolveAgentMemorySource } from "@praxisbase/core/experience/agentmemory-adapter.js";
import { exportAgentMemory } from "@praxisbase/core/experience/agentmemory-export.js";
import { writeExperienceEnvelope } from "@praxisbase/core/experience/source-adapters.js";
import type { ExperienceSourceConfig } from "@praxisbase/core";
import { diagnoseAgentMemorySource } from "./agentmemory-diagnostics.js";

export interface AgentMemoryCommandOptions {
  source?: string;
  mode?: "personal" | "team";
  dryRun?: boolean;
  write?: boolean;
  allowTeamExport?: boolean;
  json?: boolean;
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^([A-Z0-9_]+):/);
  return match?.[1] ?? "AGENTMEMORY_ERROR";
}

async function findSource(root: string, sourceName?: string): Promise<ExperienceSourceConfig> {
  const sources = await listExperienceSources(root);
  const agentmemorySources = sources.filter((source) => source.agent === "agentmemory");
  if (agentmemorySources.length === 0) {
    throw new Error("AGENTMEMORY_NO_SOURCE: no agentmemory source configured. Use 'source add --type agentmemory' first.");
  }
  if (sourceName) {
    const found = agentmemorySources.find((source) => source.name === sourceName);
    if (!found) throw new Error(`AGENTMEMORY_SOURCE_NOT_FOUND: no agentmemory source named "${sourceName}".`);
    return found;
  }
  return agentmemorySources[0];
}

export async function agentmemoryCommand(root: string, subcommand: string, options: AgentMemoryCommandOptions): Promise<string> {
  try {
    if (subcommand === "doctor") {
      const source = await findSource(root, options.source);
      try {
        const checks = await diagnoseAgentMemorySource(source, {
          authorityMode: "personal-local",
          fetchImpl: fetch,
          env: process.env as Record<string, string | undefined>,
        });
        if (options.json) return JSON.stringify({ ok: true, source: { name: source.name, url: source.url }, checks }, null, 2);
        return checks.map((check) => `${check.ok ? "OK" : "WARN"} ${check.id}: ${check.message}`).join("\n") || `AgentMemory ok: ${source.name}`;
      } catch (error) {
        const checks = [{
          id: "agentmemory_health",
          ok: false,
          severity: "warning" as const,
          message: `AgentMemory daemon check failed: ${error instanceof Error ? error.message : String(error)}`,
        }];
        if (options.json) return JSON.stringify({ ok: true, source: { name: source.name, url: source.url }, checks }, null, 2);
        return checks.map((check) => `${check.ok ? "OK" : "WARN"} ${check.id}: ${check.message}`).join("\n");
      }
    }

    if (subcommand === "import") {
      const source = await findSource(root, options.source);
      const authorityMode = options.mode === "team" ? "team-git" : "personal-local";
      const result = await resolveAgentMemorySource(root, source, {
        authorityMode,
        fetchImpl: fetch,
        env: process.env as Record<string, string | undefined>,
      });
      if (options.write) {
        const allowedEnvelopes = result.envelopes.filter((envelope) => envelope.privacy.verdict === "allow");
        for (const envelope of allowedEnvelopes) {
          await writeExperienceEnvelope(root, envelope);
        }
      }
      if (options.json) return JSON.stringify({
        ok: true,
        source: { name: source.name },
        status: result.status,
        scanned: result.scanned,
        fetched: result.fetched,
        enveloped: result.enveloped,
        rejected: result.rejected,
        humanRequired: result.humanRequired,
        warnings: result.warnings,
      }, null, 2);
      return `Import ${result.status}: ${result.enveloped} envelopes from ${source.name}${result.warnings.length > 0 ? ` (${result.warnings.length} warnings)` : ""}`;
    }

    if (subcommand === "export") {
      const mode = options.mode ?? "personal";
      const dryRun = options.dryRun === true || options.write !== true;
      const result = await exportAgentMemory(root, {
        mode,
        dryRun,
        fetchImpl: fetch,
        env: process.env as Record<string, string | undefined>,
        allowTeamExport: options.allowTeamExport === true,
        sourceName: options.source,
      });
      if (options.json) return JSON.stringify({
        ok: result.ok,
        mode: result.mode,
        pages: result.pages,
        payloads: result.payloads.map((payload) => ({
          title: payload.payload.title,
          pagePath: payload.pagePath,
          provenanceHash: payload.provenanceHash,
          idempotencyKey: payload.idempotencyKey,
          concepts: payload.payload.concepts,
        })),
        exported: result.exported,
        already_present: result.already_present,
        skipped: result.skipped,
        summary: result.summary,
        errors: result.errors,
        warnings: result.warnings,
      }, null, 2);
      if (!result.ok) return `Export failed: ${result.errors.join(", ")}`;
      return `Export ${mode}: ${result.pages} pages, ${result.payloads.length} payloads${dryRun ? " (dry-run)" : `, ${result.exported} exported, ${result.already_present} already present`}${result.warnings.length > 0 ? ` (${result.warnings.length} warnings)` : ""}`;
    }

    throw new Error(`AGENTMEMORY_ERROR: Unknown subcommand "agentmemory ${subcommand}". Use "agentmemory doctor", "agentmemory import", or "agentmemory export".`);
  } catch (error) {
    if (!options.json) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ ok: false, code: errorCode(error), message, retryable: false }, null, 2);
  }
}
