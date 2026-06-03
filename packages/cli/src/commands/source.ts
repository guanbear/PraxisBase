import {
  addExperienceSource,
  listExperienceSources,
  readExperienceSource,
  removeExperienceSource,
} from "@praxisbase/core/experience/source-config.js";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { diagnoseAgentMemorySource } from "./agentmemory-diagnostics.js";
import { fetchFeishuSourcePayload, isLoopbackUrl, isSecureFeishuApiUrl } from "@praxisbase/core";
import type {
  ExperienceScopeHint,
  ExperienceSourceAgent,
  ExperienceSourceChannel,
  ExperienceSourceParser,
  ExperienceSourcePrivacyTrust,
  ExperienceSourceType,
} from "@praxisbase/core";

const execFileAsync = promisify(execFile);

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
  feishuAppIdEnv?: string;
  feishuAppSecretEnv?: string;
  feishuTarget?: string;
  feishuCliPath?: string;
  privacyTrust?: ExperienceSourcePrivacyTrust;
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
        feishuAppIdEnv: options.feishuAppIdEnv,
        feishuAppSecretEnv: options.feishuAppSecretEnv,
        feishuTarget: options.feishuTarget,
        feishuCliPath: options.feishuCliPath,
        privacyTrust: options.privacyTrust,
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
      if (source.source_type === "feishu") {
        const env = process.env as Record<string, string | undefined>;
        const appIdEnv = source.feishu_app_id_env;
        const appSecretEnv = source.feishu_app_secret_env;
        checks.push({
          id: "feishu_target",
          ok: Boolean(source.feishu_target),
          severity: source.feishu_target ? "info" : "error",
          message: source.feishu_target ? "Feishu target is configured." : "Feishu target is missing.",
        });
        checks.push({
          id: "feishu_app_id_env",
          ok: Boolean(appIdEnv && env[appIdEnv]),
          severity: appIdEnv && env[appIdEnv] ? "info" : "error",
          message: appIdEnv ? `Feishu app id env ${appIdEnv} ${env[appIdEnv] ? "is set" : "is not set"}.` : "Feishu app id env is missing.",
        });
        checks.push({
          id: "feishu_app_secret_env",
          ok: Boolean(appSecretEnv && env[appSecretEnv]),
          severity: appSecretEnv && env[appSecretEnv] ? "info" : "error",
          message: appSecretEnv ? `Feishu app secret env ${appSecretEnv} ${env[appSecretEnv] ? "is set" : "is not set"}.` : "Feishu app secret env is missing.",
        });
        if (source.url) {
          const secure = isSecureFeishuApiUrl(source.url) || isLoopbackUrl(source.url);
          checks.push({
            id: "feishu_api_https",
            ok: secure,
            severity: secure ? "info" : "error",
            message: secure ? "Feishu API base URL is HTTPS or loopback." : "Feishu API base URL must be HTTPS unless loopback.",
          });
        }
        if (source.feishu_cli_path) {
          checks.push({
            id: "feishu_cli_configured",
            ok: true,
            severity: "info",
            message: `Feishu CLI wrapper is configured: ${source.feishu_cli_path}`,
          });
        }
        const hasStaticBlocker = checks.some((check) => !check.ok && check.severity === "error");
        if (!hasStaticBlocker) {
          const reachable = await fetchFeishuSourcePayload(source, {
            env,
            fetchImpl: fetch,
            runCommand: async (command, args) => {
              const result = await execFileAsync(command, args, {
                env: process.env,
                maxBuffer: 8 * 1024 * 1024,
              });
              return result.stdout;
            },
          });
          checks.push({
            id: "feishu_target_readable",
            ok: reachable.ok,
            severity: reachable.ok ? "info" : "error",
            message: reachable.ok
              ? "Feishu target is readable through the configured transport."
              : `Feishu target read failed: ${reachable.warnings.join(", ")}`,
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
