import type { ExperienceSourceConfig } from "@praxisbase/core";
import { createAgentMemoryClient } from "@praxisbase/core/experience/agentmemory-adapter.js";

export interface AgentMemoryDiagnosticCheck {
  id: string;
  ok: boolean;
  severity: "info" | "warning" | "error";
  message: string;
}

function routeDiagnostic(error?: string): string {
  if (!error) return "unknown error";
  if (/404\s+Not Found/i.test(error)) {
    return "agentmemory_http_error: 404 Not Found. The HTTP daemon is reachable, but AgentMemory routes are not registered. Restart AgentMemory with its worker active; if using iii directly, run it from the AgentMemory package and ensure `node dist/index.mjs` is also running.";
  }
  return error;
}

export async function diagnoseAgentMemorySource(
  source: ExperienceSourceConfig,
  options: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    authorityMode?: "personal-local" | "team-git";
  } = {},
): Promise<AgentMemoryDiagnosticCheck[]> {
  const checks: AgentMemoryDiagnosticCheck[] = [];
  const env = options.env ?? process.env;

  if (source.bearer_token_env) {
    const present = Boolean(env[source.bearer_token_env]);
    checks.push({
      id: "agentmemory_bearer_token",
      ok: present,
      severity: present ? "info" : "warning",
      message: present
        ? `Bearer token env ${source.bearer_token_env} is set.`
        : `Bearer token env ${source.bearer_token_env} is not set.`,
    });
  }

  const client = createAgentMemoryClient(source, {
    authorityMode: options.authorityMode ?? "personal-local",
    fetchImpl: options.fetchImpl ?? fetch,
    env,
  });

  const health = await client.health();
  checks.push({
    id: "agentmemory_health",
    ok: health.ok,
    severity: health.ok ? "info" : "warning",
    message: health.ok
      ? `AgentMemory daemon healthy (${health.status ?? "ok"})`
      : `AgentMemory daemon unhealthy: ${routeDiagnostic(health.error)}`,
  });
  if (!health.ok) return checks;

  const search = await client.smartSearch("praxisbase health check", 1);
  checks.push({
    id: "agentmemory_smart_search",
    ok: search.ok,
    severity: search.ok ? "info" : "warning",
    message: search.ok
      ? `AgentMemory smart-search reachable (${search.hits?.length ?? 0} hit(s)).`
      : `AgentMemory smart-search failed: ${routeDiagnostic(search.error)}`,
  });

  return checks;
}
