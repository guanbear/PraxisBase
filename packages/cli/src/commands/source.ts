import {
  addExperienceSource,
  listExperienceSources,
  readExperienceSource,
  removeExperienceSource,
} from "@praxisbase/core/experience/source-config.js";
import { diagnoseAgentMemorySource } from "./agentmemory-diagnostics.js";
import type {
  ExperienceScopeHint,
  ExperienceSourceAgent,
  ExperienceSourceChannel,
  ExperienceSourceParser,
  ExperienceSourceType,
} from "@praxisbase/core";

export interface SourceCommandOptions {
  name?: string;
  agent?: ExperienceSourceAgent;
  type?: ExperienceSourceType;
  channel?: ExperienceSourceChannel;
  parser?: ExperienceSourceParser;
  scope?: ExperienceScopeHint;
  path?: string;
  repo?: string;
  ref?: string;
  host?: string;
  url?: string;
  remote?: string;
  bearerTokenEnv?: string;
  json?: boolean;
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^([A-Z0-9_]+):/);
  return match?.[1] ?? "SOURCE_CONFIG_INVALID";
}

export async function sourceCommand(root: string, subcommand: string, options: SourceCommandOptions): Promise<string> {
  try {
    if (subcommand === "add") {
      if (!options.name || !options.agent || !options.type || !options.scope) {
        throw new Error("SOURCE_CONFIG_INVALID: source add requires name, --agent, --type, and --scope.");
      }
      const source = await addExperienceSource(root, {
        name: options.name,
        agent: options.agent,
        sourceType: options.type,
        channel: options.channel,
        parser: options.parser,
        scopeDefault: options.scope,
        path: options.path,
        repo: options.repo,
        ref: options.ref,
        host: options.host,
        url: options.url,
        remote: options.remote,
        bearerTokenEnv: options.bearerTokenEnv,
      });
      return options.json ? JSON.stringify({ ok: true, source }, null, 2) : `Source added: ${source.name}`;
    }

    if (subcommand === "list") {
      const sources = await listExperienceSources(root);
      return options.json ? JSON.stringify({ ok: true, sources }, null, 2) : sources.map((source) => source.name).join("\n");
    }

    if (subcommand === "remove") {
      if (!options.name) throw new Error("SOURCE_CONFIG_INVALID: source remove requires name.");
      await removeExperienceSource(root, options.name);
      return options.json ? JSON.stringify({ ok: true }, null, 2) : `Source removed: ${options.name}`;
    }

    if (subcommand === "doctor") {
      if (!options.name) throw new Error("SOURCE_CONFIG_INVALID: source doctor requires name.");
      const source = await readExperienceSource(root, options.name);
      const checks: Array<{ id: string; ok: boolean; severity: "info" | "warning" | "error"; message: string }> = [];
      if (source.source_type === "agentmemory") {
        try {
          checks.push(...await diagnoseAgentMemorySource(source, {
            authorityMode: "personal-local",
            fetchImpl: fetch,
            env: process.env as Record<string, string | undefined>,
          }));
        } catch (error) {
          checks.push({
            id: "agentmemory_health",
            ok: false,
            severity: "warning",
            message: `AgentMemory daemon check failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      if (options.json) return JSON.stringify({ ok: true, source, checks }, null, 2);
      if (checks.length > 0) {
        return checks.map((check) => `${check.ok ? "OK" : "WARN"} ${check.id}: ${check.message}`).join("\n");
      }
      return `Source ok: ${source.name}`;
    }

    throw new Error(`SOURCE_CONFIG_INVALID: Unknown subcommand "source ${subcommand}".`);
  } catch (error) {
    if (!options.json) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ ok: false, code: errorCode(error), message, retryable: false }, null, 2);
  }
}
