import { GBrainClient, type GBrainCommandRunner } from "@praxisbase/core/experience/gbrain-client.js";
import { gbrainExecutable, resolveGBrainConfig, writeGBrainConfig, type GBrainConfig } from "@praxisbase/core/experience/gbrain-config.js";
import { exportGBrain } from "@praxisbase/core/experience/gbrain-export.js";
import { importGBrain } from "@praxisbase/core/experience/gbrain-import.js";
import type { FetchLike } from "@praxisbase/core/experience/gbrain-remote.js";

export interface GBrainCommandOptions {
  json?: boolean;
  executable?: string;
  mode?: "personal" | "team";
  source?: string;
  query?: string;
  limit?: number;
  dryRun?: boolean;
  write?: boolean;
  allowTeamExport?: boolean;
  timeoutMs?: number;
  publishMode?: "capture" | "mcp_put_page";
  remote?: boolean;
  issuerUrl?: string;
  mcpUrl?: string;
  oauthClientId?: string;
  secretEnv?: string;
  federatedRead?: string[];
  runCommand?: GBrainCommandRunner;
  fetchImpl?: FetchLike;
}

export async function gbrainCommand(root: string, subcommand: string, options: GBrainCommandOptions): Promise<string> {
  if (subcommand === "init") {
    let config: GBrainConfig;
    if (options.remote) {
      if (!options.issuerUrl || !options.mcpUrl || !options.oauthClientId || !options.secretEnv) {
        throw new Error("GBRAIN_ERROR: remote gbrain init requires --issuer-url, --mcp-url, --oauth-client-id, and --secret-env.");
      }
      config = {
        mode: "remote",
        issuer_url: options.issuerUrl,
        mcp_url: options.mcpUrl,
        oauth_client_id: options.oauthClientId,
        secret_env: options.secretEnv,
        source_id: options.source ?? "praxisbase",
        federated_read: options.federatedRead ?? [],
        timeout_ms: options.timeoutMs ?? 15_000,
      };
    } else {
      config = {
        mode: "local",
        cli_path: options.executable,
        executable: options.executable ?? "gbrain",
        source_id: options.source ?? "praxisbase",
        timeout_ms: options.timeoutMs ?? 15_000,
        publish_mode: options.publishMode ?? "capture",
      };
    }
    await writeGBrainConfig(root, config);
    if (options.json) return JSON.stringify({ ok: true, config }, null, 2);
    return `GBrain ${config.mode} config written for source ${config.source_id}.`;
  }

  const config = await resolveGBrainConfig(root);
  const executable = options.executable ?? gbrainExecutable(config);
  const sourceId = options.source ?? config.source_id;

  if (subcommand === "import") {
    if (!options.query) throw new Error("GBRAIN_ERROR: gbrain import requires --query.");
    const result = await importGBrain(root, {
      query: options.query,
      sourceId,
      limit: options.limit,
      write: options.write === true,
      executable,
      timeoutMs: config.mode === "local" ? config.timeout_ms : undefined,
      runCommand: options.runCommand,
      config,
      fetchImpl: options.fetchImpl,
    });
    if (options.json) return JSON.stringify(result, null, 2);
    return `GBrain import ${result.ok ? "ok" : "failed"}: ${result.imported} imported, ${result.candidates} candidate(s).`;
  }

  if (subcommand === "export") {
    const result = await exportGBrain(root, {
      mode: options.mode ?? "personal",
      dryRun: options.write ? false : (options.dryRun ?? true),
      allowTeamExport: options.allowTeamExport,
      sourceId,
      executable,
      config,
      runCommand: options.runCommand,
    });
    if (options.json) return JSON.stringify(result, null, 2);
    return `GBrain export ${result.ok ? "ok" : "failed"}: ${result.exported} exported, ${result.skipped} skipped, ${result.errors.length} error(s).`;
  }

  if (subcommand !== "doctor") {
    throw new Error(`GBRAIN_ERROR: Unknown subcommand "gbrain ${subcommand}". Use "gbrain init", "gbrain doctor", "gbrain import", or "gbrain export".`);
  }

  if (config.mode === "remote") {
    const sourceScopeOk = config.federated_read.length === 0 || config.federated_read.includes(sourceId);
    const output = {
      ok: sourceScopeOk,
      backend: "gbrain",
      config: {
        mode: "remote",
        source_id: config.source_id,
        mcp_url: config.mcp_url,
        secret_env: config.secret_env,
      },
      checks: [
        {
          id: "gbrain_remote_config",
          ok: true,
          severity: "info",
          message: "GBrain remote MCP config is present.",
        },
        {
          id: "gbrain_source_scope",
          ok: sourceScopeOk,
          severity: sourceScopeOk ? "info" : "warning",
          message: sourceScopeOk
            ? `GBrain remote source ${sourceId} is allowed by configured federated_read diagnostics.`
            : `GBrain remote source ${sourceId} is not listed in federated_read diagnostics.`,
          details: { source_id: sourceId, federated_read: config.federated_read },
        },
      ],
    };
    if (options.json) return JSON.stringify(output, null, 2);
    return output.checks.map((check) => `${check.ok ? "OK" : "WARN"} ${check.id}: ${check.message}`).join("\n");
  }

  const client = new GBrainClient({
    executable,
    timeoutMs: config.mode === "local" ? config.timeout_ms : undefined,
    runCommand: options.runCommand,
  });
  const result = await client.doctor({ sourceId });
  const output = {
    ok: result.ok,
    backend: "gbrain",
    config: {
      mode: config.mode,
      source_id: config.source_id,
      executable: gbrainExecutable(config),
    },
    checks: result.checks,
  };

  if (options.json) return JSON.stringify(output, null, 2);
  return result.checks.map((check) => `${check.ok ? "OK" : "WARN"} ${check.id}: ${check.message}`).join("\n");
}
