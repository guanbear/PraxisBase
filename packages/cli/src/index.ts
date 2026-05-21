#!/usr/bin/env node
import { Command } from "commander";
import { initializeWorkspace } from "./commands/init.js";
import { repairContextCommand } from "./commands/repair-context.js";
import { submitEpisode } from "./commands/episode.js";
import { submitProposal } from "./commands/propose.js";
import { reviewAuto } from "./commands/review.js";
import { promoteAuto } from "./commands/promote.js";
import { buildCommand } from "./commands/build.js";
import { checkCommand } from "./commands/check.js";
import { bundleFetchCommand } from "./commands/bundle-fetch.js";
import { feishuSummaryCommand, feishuProposalDraftCommand } from "./commands/feishu-summary.js";
import { synthesizeSkillCommand } from "./commands/synthesize.js";
import { lintCommand } from "./commands/lint.js";
import { captureFinishCommand, captureSubmitCommand } from "./commands/capture.js";
import { installCommand } from "./commands/install.js";
import { memoryCommand } from "./commands/memory.js";
import { doctorCommand } from "./commands/doctor.js";
import { contextCommand } from "./commands/context.js";
import { distillCommand } from "./commands/distill.js";
import { watchCommand } from "./commands/watch.js";
import { wikiCommand } from "./commands/wiki.js";
import { smokeCommand } from "./commands/smoke.js";
import { remoteCommand } from "./commands/remote.js";
import { harvestCommand } from "./commands/harvest.js";
import { agentToolsCommand } from "./commands/agent-tools.js";
import { mcpCommand } from "./commands/mcp.js";

const program = new Command();

function collectOptionValue(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

program
  .name("praxisbase")
  .description("Agent-native knowledge substrate for OpenClaw repair workflows")
  .version("0.1.0");

program
  .command("init")
  .option("--profile <profile>", "knowledge profile: all, openclaw, or k8s", "all")
  .action(async (options: { profile: "all" | "openclaw" | "k8s" }) => {
    await initializeWorkspace(process.cwd(), { profile: options.profile });
    console.log(`PraxisBase workspace initialized (${options.profile}).`);
  });

program
  .command("repair-context")
  .argument("<scenario>")
  .requiredOption("--logs <path>")
  .option("--json")
  .action(async (scenario: string, options: { logs: string; json?: boolean }) => {
    const output = await repairContextCommand(scenario, options);
    console.log(output);
  });

program
  .command("episode")
  .argument("<sub>", "subcommand (submit)")
  .argument("<file>")
  .option("--offline-ok")
  .action(async (sub: string, file: string, options: { offlineOk?: boolean }) => {
    if (sub !== "submit") {
      program.error(`Unknown subcommand "episode ${sub}". Use "episode submit <file>".`, { exitCode: 1 });
    }
    await submitEpisode(process.cwd(), file, { offlineOk: options.offlineOk });
  });

program
  .command("propose")
  .argument("<file>")
  .option("--offline-ok")
  .action(async (file: string, options: { offlineOk?: boolean }) => {
    await submitProposal(process.cwd(), file, { offlineOk: options.offlineOk });
  });

program.command("review").option("--auto").action(async () => {
  await reviewAuto(process.cwd());
  console.log("Review complete.");
});

program.command("promote").option("--auto").action(async () => {
  await promoteAuto(process.cwd());
  console.log("Promotion complete.");
});

program.command("build").action(async () => {
  await buildCommand(process.cwd());
  console.log("Build complete.");
});

program.command("check").action(async () => {
  await checkCommand(process.cwd());
  console.log("Check passed.");
});

program.command("lint").option("--json").action(async (options: { json?: boolean }) => {
  console.log(await lintCommand(process.cwd(), options));
});

program
  .command("bundle")
  .argument("fetch")
  .argument("<scenario>")
  .option("--signature <signature>")
  .action(async (_fetch: string, scenario: string, options: { signature?: string }) => {
    const result = await bundleFetchCommand(scenario, options.signature);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("feishu-summary")
  .argument("<episode-file>")
  .option("--json")
  .action(async (file: string, options: { json?: boolean }) => {
    console.log(await feishuSummaryCommand(file, options));
  });

program
  .command("feishu-proposal-draft")
  .argument("<episode-file>")
  .requiredOption("--path <patch-path>")
  .requiredOption("--content <patch-content>")
  .option("--json")
  .action(async (file: string, options: { path: string; content: string; json?: boolean }) => {
    console.log(await feishuProposalDraftCommand(file, options.path, options.content, options));
  });

program
  .command("synthesize")
  .argument("skill")
  .requiredOption("--signature <signature>")
  .option("--min-episodes <n>", "3")
  .option("--json")
  .action(async (_skill: string, options: { signature: string; minEpisodes?: string; json?: boolean }) => {
    const min = options.minEpisodes ? parseInt(options.minEpisodes, 10) : 3;
    console.log(await synthesizeSkillCommand(process.cwd(), { signature: options.signature, minEpisodes: min, json: options.json }));
  });

program
  .command("install")
  .argument("<agent>", "agent profile")
  .option("--dry-run")
  .option("--json")
  .action(async (
    agent: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic",
    options: { dryRun?: boolean; json?: boolean }
  ) => {
    console.log(await installCommand(process.cwd(), { agent, dryRun: options.dryRun, json: options.json }));
  });

program
  .command("memory")
  .argument("<sub>", "subcommand (scan|ingest|fetch|import|refresh)")
  .requiredOption("--agent <agent>")
  .option("--source <path>", "source file or directory", collectOptionValue, [])
  .option("--limit <n>")
  .option("--dry-run")
  .option("--write")
  .option("--scope <scope>")
  .option("--provider <provider>")
  .option("--remote <remote>")
  .option("--since <since>")
  .option("--out <path>")
  .option("--source-refs <refs>", "comma-separated source refs for memory refresh")
  .option("--target <target>")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      agent: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic";
      source?: string[];
      limit?: string;
      dryRun?: boolean;
      write?: boolean;
      scope?: "personal" | "project" | "team";
      provider?: "exported-json" | "openclaw-api" | "openclaw-cli";
      remote?: string;
      since?: string;
      out?: string;
      sourceRefs?: string;
      target?: "context" | "instruction-snippet" | "patch-proposal";
      json?: boolean;
    }
  ) => {
    console.log(await memoryCommand(process.cwd(), sub, {
      ...options,
      source: options.source?.[0],
      sources: options.source,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      provider: options.provider,
      remote: options.remote,
      since: options.since,
      out: options.out,
      sourceRefs: options.sourceRefs?.split(",").map((ref) => ref.trim()).filter(Boolean),
    }));
  });

program
  .command("smoke")
  .argument("<sub>", "subcommand (real-wiki)")
  .requiredOption("--agent <agent>")
  .option("--source <path>", "source file or directory", collectOptionValue, [])
  .option("--limit <n>")
  .option("--query <query>")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      agent: "codex" | "openclaw";
      source?: string[];
      limit?: string;
      query?: string;
      json?: boolean;
    }
  ) => {
    console.log(await smokeCommand(process.cwd(), sub, {
      ...options,
      source: options.source?.[0],
      sources: options.source,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
    }));
  });

program
  .command("doctor")
  .argument("<sub>", "subcommand (openclaw-remote)")
  .option("--provider <provider>", "provider: exported-json, openclaw-api, or openclaw-cli")
  .option("--write-report")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      provider?: "exported-json" | "openclaw-api" | "openclaw-cli";
      writeReport?: boolean;
      json?: boolean;
    }
  ) => {
    console.log(await doctorCommand(process.cwd(), sub, options));
  });

program
  .command("remote")
  .argument("<sub>", "subcommand (add|list|remove|doctor)")
  .argument("[name]")
  .option("--type <type>")
  .option("--repo <repo>")
  .option("--ref <ref>")
  .option("--path <path>")
  .option("--host <host>")
  .option("--url <url>")
  .option("--remote <remote>")
  .option("--json")
  .action(async (
    sub: string,
    name: string | undefined,
    options: {
      type?: "file" | "git" | "ssh" | "http" | "openclaw-api";
      repo?: string;
      ref?: string;
      path?: string;
      host?: string;
      url?: string;
      remote?: string;
      json?: boolean;
    }
  ) => {
    console.log(await remoteCommand(process.cwd(), sub, { ...options, name }));
  });

program
  .command("harvest")
  .option("--all")
  .option("--codex <path>", "Codex source path", collectOptionValue, [])
  .option("--openclaw <path>", "OpenClaw source path", collectOptionValue, [])
  .option("--openclaw-export <path>", "OpenClaw export JSON", collectOptionValue, [])
  .option("--remote <name>", "registered remote source", collectOptionValue, [])
  .option("--limit <n>")
  .option("--build-site")
  .option("--context-query <query>")
  .option("--team")
  .option("--branch <name>")
  .option("--commit")
  .option("--push")
  .option("--pr")
  .option("--auto-review")
  .option("--auto-promote")
  .option("--dry-run")
  .option("--json")
  .action(async (options: {
    all?: boolean;
    codex?: string[];
    openclaw?: string[];
    openclawExport?: string[];
    remote?: string[];
    limit?: string;
    buildSite?: boolean;
    contextQuery?: string;
    team?: boolean;
    branch?: string;
    commit?: boolean;
    push?: boolean;
    pr?: boolean;
    autoReview?: boolean;
    autoPromote?: boolean;
    dryRun?: boolean;
    json?: boolean;
  }) => {
    console.log(await harvestCommand(process.cwd(), {
      ...options,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      openclawExports: options.openclawExport,
    }));
  });

program
  .command("agent-tools")
  .argument("<sub>", "subcommand (generate|manifest)")
  .option("--agent <agent>", "agent profile (codex, opencode, claude-code, etc.)")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      agent?: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic";
      json?: boolean;
    }
  ) => {
    console.log(await agentToolsCommand(process.cwd(), sub, {
      agent: options.agent,
      json: options.json,
    }));
  });

program
  .command("mcp")
  .argument("<sub>", "subcommand (manifest|serve)")
  .option("--stdio")
  .option("--workspace <path>")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      stdio?: boolean;
      workspace?: string;
      json?: boolean;
    }
  ) => {
    const output = await mcpCommand(process.cwd(), sub, options);
    if (!(sub === "serve" && options.stdio)) {
      console.log(output);
    }
  });

program
  .command("context")
  .argument("<sub>", "subcommand (get)")
  .requiredOption("--agent <agent>")
  .requiredOption("--stage <stage>")
  .option("--query <query>")
  .option("--max-bytes <n>")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      agent: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic";
      stage: "diagnosis" | "repair" | "verification" | "proposal";
      query?: string;
      maxBytes?: string;
      json?: boolean;
    }
  ) => {
    console.log(await contextCommand(process.cwd(), sub, options));
  });

program
  .command("distill")
  .argument("<sub>", "subcommand (run)")
  .option("--json")
  .action(async (sub: string, options: { json?: boolean }) => {
    console.log(await distillCommand(process.cwd(), sub, options));
  });

program
  .command("watch")
  .requiredOption("--agent <agent>")
  .option("--workspace <path>", "workspace path", process.cwd())
  .option("--once")
  .option("--json")
  .action(async (
    options: {
      agent: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic";
      workspace: string;
      once?: boolean;
      json?: boolean;
    }
  ) => {
    console.log(await watchCommand(process.cwd(), options));
  });

program
  .command("wiki")
  .argument("<sub>", "subcommand (compile|graph|build-site)")
  .option("--dry-run")
  .option("--review")
  .option("--mode <mode>", "graph mode: full, overview, or ego")
  .option("--center <slug>", "center slug or id for ego graph")
  .option("--depth <n>", "ego graph BFS depth")
  .option("--limit <n>", "graph slice node limit")
  .option("--type <type>", "graph node kind filter", collectOptionValue, [])
  .option("--json")
  .action(async (sub: string, options: {
    dryRun?: boolean;
    review?: boolean;
    mode?: "full" | "overview" | "ego";
    center?: string;
    depth?: string;
    limit?: string;
    type?: string[];
    json?: boolean;
  }) => {
    console.log(await wikiCommand(process.cwd(), sub, {
      ...options,
      depth: options.depth ? parseInt(options.depth, 10) : undefined,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      types: options.type,
    }));
  });

program
  .command("capture")
  .argument("<sub>", "subcommand (finish|submit)")
  .argument("[file]")
  .option("--agent <agent>")
  .option("--result <result>")
  .option("--source-ref <ref>")
  .option("--source-hash <hash>")
  .option("--summary <summary>")
  .option("--json")
  .action(async (
    sub: string,
    file: string | undefined,
    options: {
      agent?: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic";
      result?: "success" | "failed" | "partial" | "unknown";
      sourceRef?: string;
      sourceHash?: string;
      summary?: string;
      json?: boolean;
    }
  ) => {
    if (sub === "submit") {
      if (!file) program.error("capture submit requires <file>.", { exitCode: 1 });
      console.log(await captureSubmitCommand(process.cwd(), file!, { json: options.json }));
      return;
    }

    if (sub !== "finish") {
      program.error(`Unknown subcommand "capture ${sub}". Use "capture finish" or "capture submit".`, { exitCode: 1 });
    }
    if (!options.agent || !options.result || !options.sourceRef || !options.sourceHash || !options.summary) {
      program.error("capture finish requires --agent, --result, --source-ref, --source-hash, and --summary.", { exitCode: 1 });
    }
    console.log(await captureFinishCommand(process.cwd(), {
      agent: options.agent!,
      result: options.result!,
      sourceRef: options.sourceRef!,
      sourceHash: options.sourceHash!,
      summary: options.summary!,
      json: options.json,
    }));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) {
    const maybeError = error as { code?: string; details?: Record<string, unknown> };
    console.error(JSON.stringify({
      ok: false,
      code: maybeError.code ?? "CLI_ERROR",
      message,
      retryable: false,
      details: {
        ...(maybeError.details ?? {}),
        supported_agents: ["codex", "claude-code", "opencode", "openclaw", "hermes", "openhuman", "generic"],
      },
    }, null, 2));
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
