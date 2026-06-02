import {
  createOpenAiCompatibleJsonClient,
  renderRuntimeLessonBlock,
  retrieveRuntimeLessons,
  runLessonPipeline,
  runM25GoldenValidation,
} from "@praxisbase/core";
import { readAiProviderConfig } from "@praxisbase/core/ai/config.js";

type LessonAgent = "codex" | "openclaw" | "claude-code" | "opencode" | "hermes" | "openhuman" | "generic";

export interface LessonCommandOptions {
  source?: string;
  agent?: LessonAgent;
  scope?: "personal" | "project" | "team" | "global" | "org";
  mode?: "personal" | "team-git";
  query?: string;
  maxSpans?: number;
  ai?: boolean;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  json?: boolean;
}

function authorityMode(mode?: "personal" | "team-git"): "personal-local" | "team-git" {
  return mode === "team-git" ? "team-git" : "personal-local";
}

function requireSource(options: LessonCommandOptions): string {
  if (!options.source) throw new Error("LESSON_SOURCE_REQUIRED: pass --source <path>.");
  return options.source;
}

export async function lessonCommand(root: string, sub: string, options: LessonCommandOptions): Promise<string> {
  const agent = options.agent ?? "generic";
  const scope = options.scope ?? "personal";
  const maxSpans = options.maxSpans ?? 50;

  if (sub === "golden") {
    const results = await runM25GoldenValidation();
    return JSON.stringify({ ok: true, results }, null, 2);
  }

  const sourcePath = requireSource(options);
  const aiConfig = options.ai ? await readAiProviderConfig(root) : null;
  if (options.ai && !aiConfig) {
    throw new Error("LESSON_AI_CONFIG_REQUIRED: run praxisbase ai init before lesson extract --ai.");
  }
  const aiClient = aiConfig
    ? createOpenAiCompatibleJsonClient({
      config: aiConfig,
      env: options.env,
      fetchImpl: options.fetchImpl,
    })
    : undefined;
  const report = await runLessonPipeline(root, {
    sourcePath,
    agent,
    scope,
    authorityMode: authorityMode(options.mode),
    maxSpans,
    aiClient,
    ...(aiConfig ? { aiCacheIdentity: `lesson-cli:${aiConfig.model}` } : {}),
  });

  if (sub === "inventory") {
    return JSON.stringify({
      ok: true,
      source_items: report.source_items,
      selected_spans: report.selected_spans,
    }, null, 2);
  }

  if (sub === "extract" || sub === "cache") {
    return JSON.stringify({ ok: true, report }, null, 2);
  }

  if (sub === "inject-preview") {
    const hits = retrieveRuntimeLessons(report.lessons, {
      query: options.query,
      agent,
      maxHits: 5,
    });
    const block = renderRuntimeLessonBlock(hits, { maxBytes: 2048 });
    return JSON.stringify({ ok: true, query: options.query, block }, null, 2);
  }

  throw new Error(`LESSON_COMMAND_INVALID: unknown subcommand lesson ${sub}.`);
}
