import type { ExperienceSourceConfig } from "../protocol/schemas.js";
import type { GitCommandRunner } from "./git-workflow.js";

export interface FeishuFetchOptions {
  runCommand?: GitCommandRunner;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

export interface FeishuFetchResult {
  ok: boolean;
  rawText?: string;
  warnings: string[];
}

export function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

export function isSecureFeishuApiUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function requiredCredentialWarnings(source: ExperienceSourceConfig, env: Record<string, string | undefined>): string[] {
  const warnings: string[] = [];
  if (!source.feishu_app_id_env) warnings.push("feishu_app_id_env_missing");
  else if (!env[source.feishu_app_id_env]) warnings.push(`feishu_app_id_env_unset:${source.feishu_app_id_env}`);
  if (!source.feishu_app_secret_env) warnings.push("feishu_app_secret_env_missing");
  else if (!env[source.feishu_app_secret_env]) warnings.push(`feishu_app_secret_env_unset:${source.feishu_app_secret_env}`);
  if (!source.feishu_target) warnings.push("feishu_target_missing");
  return warnings;
}

export async function fetchFeishuSourcePayload(source: ExperienceSourceConfig, options: FeishuFetchOptions): Promise<FeishuFetchResult> {
  const env = options.env ?? process.env;
  const credentialWarnings = requiredCredentialWarnings(source, env);
  if (credentialWarnings.length > 0) {
    return { ok: false, warnings: credentialWarnings };
  }

  if (source.feishu_cli_path) {
    if (!options.runCommand) return { ok: false, warnings: ["feishu_cli_requires_runCommand"] };
    try {
      const rawText = await options.runCommand(source.feishu_cli_path, [
        "fetch",
        "--target",
        source.feishu_target!,
        "--parser",
        source.parser,
        "--json",
      ]);
      return { ok: true, rawText, warnings: [] };
    } catch (error) {
      return { ok: false, warnings: [`feishu_cli_failed:${error instanceof Error ? error.message : String(error)}`] };
    }
  }

  if (!source.url) return { ok: false, warnings: ["feishu_source_requires_cli_or_api_url"] };
  if (!isSecureFeishuApiUrl(source.url) && !isLoopbackUrl(source.url)) {
    return { ok: false, warnings: [`FEISHU_API_REQUIRES_HTTPS:${source.url}`] };
  }

  try {
    const base = source.url.replace(/\/+$/, "");
    const url = new URL("/praxisbase/mock-feishu-fetch", base);
    url.searchParams.set("target", source.feishu_target!);
    url.searchParams.set("parser", source.parser);
    const response = await (options.fetchImpl ?? fetch)(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Feishu-App-Id-Env": source.feishu_app_id_env!,
        "X-Feishu-App-Secret-Env": source.feishu_app_secret_env!,
      },
    });
    if (!response.ok) return { ok: false, warnings: [`feishu_api_error:${response.status}:${response.statusText}`] };
    return { ok: true, rawText: await response.text(), warnings: [] };
  } catch (error) {
    return { ok: false, warnings: [`feishu_api_failed:${error instanceof Error ? error.message : String(error)}`] };
  }
}
