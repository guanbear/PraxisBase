#!/usr/bin/env node
import { Command } from "commander";
import { initializeWorkspace } from "./commands/init.js";
import { repairContextCommand } from "./commands/repair-context.js";
import { submitEpisode } from "./commands/episode.js";
import { submitProposal } from "./commands/propose.js";
import { reviewAuto, reviewPolicyInit, reviewAutoWithPolicy } from "./commands/review.js";
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
import { kbCommand } from "./commands/kb.js";
import { smokeCommand } from "./commands/smoke.js";
import { remoteCommand } from "./commands/remote.js";
import { sourceCommand } from "./commands/source.js";
import { dailyCommand } from "./commands/daily.js";
import { aiCommand } from "./commands/ai.js";
import { privacyCommand } from "./commands/privacy.js";
import { bootstrapCommand } from "./commands/bootstrap.js";
import { personalCommand } from "./commands/personal.js";
import { harvestCommand } from "./commands/harvest.js";
import { agentToolsCommand } from "./commands/agent-tools.js";
import { mcpCommand } from "./commands/mcp.js";
import { agentmemoryCommand } from "./commands/agentmemory.js";
import { skillCommand } from "./commands/skill.js";
import { gbrainCommand } from "./commands/gbrain.js";

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

{
  const reviewCmd = program.commands.find((c) => c.name() === "review")!;

  reviewCmd
    .command("policy")
    .argument("<sub>", "subcommand (init)")
    .requiredOption("--mode <mode>", "personal or team")
    .option("--json")
    .action(async (
      sub: string,
      options: { mode: "personal" | "team"; json?: boolean },
    ) => {
      if (sub !== "init") {
        reviewCmd.error(`Unknown subcommand "review policy ${sub}". Use "review policy init".`, { exitCode: 1 });
      }
      const result = await reviewPolicyInit(process.cwd(), options.mode);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Review policy initialized (${result.mode}).`);
      }
    });

  reviewCmd
    .command("auto")
    .option("--promote-approved")
    .option("--json")
    .action(async (options: { promoteApproved?: boolean; json?: boolean }) => {
      const result = await reviewAutoWithPolicy(process.cwd(), { promoteApproved: options.promoteApproved });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Review auto complete: ${result.reviewed} reviewed, ${result.auto_promoted} promoted.`);
      }
    });
}

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
  .command("source")
  .argument("<sub>", "subcommand (add|list|remove|doctor)")
  .argument("[name]")
  .option("--agent <agent>")
  .option("--type <type>")
  .option("--channel <channel>")
  .option("--parser <parser>")
  .option("--scope <scope>")
  .option("--repo <repo>")
  .option("--ref <ref>")
  .option("--path <path>")
  .option("--host <host>")
  .option("--url <url>")
  .option("--remote <remote>")
  .option("--bearer-token-env <name>", "environment variable name containing bearer token")
  .option("--json")
  .action(async (
    sub: string,
    name: string | undefined,
    options: {
      agent?: "codex" | "openclaw" | "claude-code" | "agentmemory" | "generic";
      type?: "local" | "file" | "git" | "ssh" | "http" | "openclaw-api" | "agentmemory" | "gbrain";
      channel?: "local" | "terminal" | "feishu" | "ci" | "gitlab" | "log-system" | "unknown";
      parser?: "codex-session" | "openclaw-export" | "openclaw-log" | "claude-code-repair-log" | "agentmemory-memory" | "gbrain-memory";
      scope?: "personal" | "project" | "team" | "org";
      repo?: string;
      ref?: string;
      path?: string;
      host?: string;
      url?: string;
      remote?: string;
      bearerTokenEnv?: string;
      json?: boolean;
    }
  ) => {
    console.log(await sourceCommand(process.cwd(), sub, { ...options, name, bearerTokenEnv: options.bearerTokenEnv }));
  });

program
  .command("daily")
  .argument("<sub>", "subcommand (init|run|doctor|schedule)")
  .option("--mode <mode>", "personal or team-git", "personal")
  .option("--runner <runner>", "cron, launchd, or gitlab")
  .option("--limit <n>")
  .option("--build-site")
  .option("--branch <name>")
  .option("--commit")
  .option("--push")
  .option("--pr")
  .option("--degraded", "run deterministic fallback without production AI distill")
  .option("--no-ai", "disable AI distill for this run")
  .option("--max-ai-chunks <n>", "maximum production AI distill chunks for the whole run")
  .option("--ai-timeout-ms <n>", "override AI provider timeout for this daily run")
  .option("--ai-concurrency <n>", "maximum concurrent AI distill and curation calls")
  .option("--retry-failed-distill-only", "retry only chunks with cached AI distill failures")
  .option("--max-curation-proposals <n>", "maximum AI wiki curation proposals for this daily run")
  .option("--no-context-economy", "disable context economy reduction for this daily run")
  .option("--semantic-review", "enable semantic review for wiki curation proposals")
  .option("--skill-synthesis", "enable skill candidate synthesis for this daily run")
  .option("--publish-gbrain", "publish changed stable PraxisBase knowledge to GBrain")
  .option("--allow-team-gbrain-export", "allow team-mode stable wiki export to GBrain")
  .option("--gbrain-executable <path>", "gbrain executable path or command")
  .option("--progress", "print stage progress to stderr while the daily run is active")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      mode?: "personal" | "team-git";
      runner?: "cron" | "launchd" | "gitlab";
      limit?: string;
      buildSite?: boolean;
      branch?: string;
      commit?: boolean;
      push?: boolean;
      pr?: boolean;
      degraded?: boolean;
      noAi?: boolean;
      ai?: boolean;
      maxAiChunks?: string;
      aiTimeoutMs?: string;
      aiConcurrency?: string;
      retryFailedDistillOnly?: boolean;
      maxCurationProposals?: string;
      noContextEconomy?: boolean;
      semanticReview?: boolean;
      skillSynthesis?: boolean;
      publishGbrain?: boolean;
      allowTeamGbrainExport?: boolean;
      gbrainExecutable?: string;
      progress?: boolean;
      json?: boolean;
    }
  ) => {
    console.log(await dailyCommand(process.cwd(), sub, {
      ...options,
      noAi: options.noAi ?? options.ai === false,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      maxAiChunks: options.maxAiChunks ? parseInt(options.maxAiChunks, 10) : undefined,
      aiTimeoutMs: options.aiTimeoutMs ? parseInt(options.aiTimeoutMs, 10) : undefined,
      aiConcurrency: options.aiConcurrency ? parseInt(options.aiConcurrency, 10) : undefined,
      maxCurationProposals: options.maxCurationProposals ? parseInt(options.maxCurationProposals, 10) : undefined,
    }));
  });

program
  .command("skill")
  .argument("<sub>", "subcommand (synthesize|curate|review|promote|export)")
  .option("--mode <mode>", "personal, team, or team-git", "personal")
  .option("--agent <agent>", "agent profile for skill export")
  .option("--review")
  .option("--dry-run")
  .option("--proposal <id>")
  .option("--max-clusters <n>")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      mode?: "personal" | "team" | "team-git";
      agent?: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "agentmemory" | "generic";
      review?: boolean;
      dryRun?: boolean;
      proposal?: string;
      maxClusters?: string;
      json?: boolean;
    }
  ) => {
    console.log(await skillCommand(process.cwd(), sub, {
      ...options,
      maxClusters: options.maxClusters ? parseInt(options.maxClusters, 10) : undefined,
    }));
  });

program
  .command("ai")
  .argument("<sub>", "subcommand (init|doctor)")
  .option("--provider <provider>")
  .option("--model <model>")
  .option("--distill-model <model>")
  .option("--curation-model <model>")
  .option("--review-model <model>")
  .option("--base-url <url>")
  .option("--base-url-env <name>")
  .option("--api-key-env <name>")
  .option("--ai-timeout-ms <n>")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      provider?: "openai-compatible";
      model?: string;
      distillModel?: string;
      curationModel?: string;
      reviewModel?: string;
      baseUrl?: string;
      baseUrlEnv?: string;
      apiKeyEnv?: string;
      aiTimeoutMs?: string;
      json?: boolean;
    }
  ) => {
    console.log(await aiCommand(process.cwd(), sub, {
      ...options,
      aiTimeoutMs: options.aiTimeoutMs ? parseInt(options.aiTimeoutMs, 10) : undefined,
    }));
  });

program
  .command("privacy")
  .argument("<sub>", "subcommand (triage)")
  .option("--mode <mode>", "personal or team-git", "personal")
  .option("--auto-release", "auto-release high-confidence safe personal triage items")
  .option("--limit <n>")
  .option("--ai-concurrency <n>", "maximum concurrent privacy triage AI calls")
  .option("--ai-timeout-ms <n>")
  .option("--include-triaged", "reprocess already triaged privacy exceptions")
  .option("--progress", "print privacy triage progress to stderr")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      mode?: "personal" | "team-git";
      autoRelease?: boolean;
      limit?: string;
      aiConcurrency?: string;
      aiTimeoutMs?: string;
      includeTriaged?: boolean;
      progress?: boolean;
      json?: boolean;
    }
  ) => {
    console.log(await privacyCommand(process.cwd(), sub, {
      ...options,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      aiConcurrency: options.aiConcurrency ? parseInt(options.aiConcurrency, 10) : undefined,
      aiTimeoutMs: options.aiTimeoutMs ? parseInt(options.aiTimeoutMs, 10) : undefined,
    }));
  });

program
  .command("bootstrap")
  .argument("<sub>", "subcommand (personal)")
  .option("--agent <agent>", "agent profile", "codex")
  .option("--install-skill")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      agent?: "codex" | "opencode" | "claude-code" | "openclaw" | "hermes" | "openhuman" | "generic";
      installSkill?: boolean;
      json?: boolean;
    }
  ) => {
    console.log(await bootstrapCommand(process.cwd(), sub, options));
  });

program
  .command("personal")
  .argument("<sub>", "subcommand (init|connect|doctor|run|schedule)")
  .argument("[target]", "connect target (codex|openclaw|agentmemory)")
  .option("--agent <agent>", "agent profile", "codex")
  .option("--name <name>")
  .option("--path <path>")
  .option("--url <url>")
  .option("--bearer-token-env <name>")
  .option("--runner <runner>", "cron or launchd")
  .option("--print")
  .option("--open")
  .option("--limit <n>")
  .option("--degraded")
  .option("--no-ai")
  .option("--max-ai-chunks <n>")
  .option("--ai-timeout-ms <n>")
  .option("--ai-concurrency <n>")
  .option("--max-curation-proposals <n>")
  .option("--json")
  .action(async (
    sub: string,
    target: "codex" | "openclaw" | "agentmemory" | undefined,
    options: {
      agent?: "codex" | "opencode" | "claude-code" | "openclaw" | "hermes" | "openhuman" | "generic";
      name?: string;
      path?: string;
      url?: string;
      bearerTokenEnv?: string;
      runner?: "cron" | "launchd";
      print?: boolean;
      open?: boolean;
      limit?: string;
      degraded?: boolean;
      noAi?: boolean;
      ai?: boolean;
      maxAiChunks?: string;
      aiTimeoutMs?: string;
      aiConcurrency?: string;
      maxCurationProposals?: string;
      json?: boolean;
    }
  ) => {
    console.log(await personalCommand(process.cwd(), sub, {
      ...options,
      target,
      noAi: options.noAi ?? options.ai === false,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      maxAiChunks: options.maxAiChunks ? parseInt(options.maxAiChunks, 10) : undefined,
      aiTimeoutMs: options.aiTimeoutMs ? parseInt(options.aiTimeoutMs, 10) : undefined,
      aiConcurrency: options.aiConcurrency ? parseInt(options.aiConcurrency, 10) : undefined,
      maxCurationProposals: options.maxCurationProposals ? parseInt(options.maxCurationProposals, 10) : undefined,
    }));
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
  .command("agentmemory")
  .argument("<sub>", "subcommand (doctor|import|export)")
  .option("--source <name>", "agentmemory source name")
  .option("--mode <mode>", "personal or team", "personal")
  .option("--dry-run", "report without writing")
  .option("--write", "write results to staging")
  .option("--allow-team-export", "allow team-mode stable wiki export to AgentMemory")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      source?: string;
      mode?: "personal" | "team";
      dryRun?: boolean;
      write?: boolean;
      allowTeamExport?: boolean;
      json?: boolean;
    }
  ) => {
    console.log(await agentmemoryCommand(process.cwd(), sub, options));
  });

program
  .command("gbrain")
  .argument("<sub>", "subcommand (init|doctor|import|export)")
  .option("--executable <path>", "gbrain executable path or command")
  .option("--mode <mode>", "personal or team", "personal")
  .option("--source <source>", "GBrain source id")
  .option("--query <query>", "GBrain query for explicit import")
  .option("--limit <n>", "maximum GBrain hits to import")
  .option("--dry-run", "report without writing")
  .option("--write", "write stable PB pages to GBrain")
  .option("--allow-team-export", "allow team-mode stable wiki export to GBrain")
  .option("--timeout-ms <n>", "GBrain command or MCP timeout in ms")
  .option("--publish-mode <mode>", "local publish mode: capture or mcp_put_page")
  .option("--remote", "write remote MCP config instead of local CLI config")
  .option("--issuer-url <url>", "remote OAuth issuer URL")
  .option("--mcp-url <url>", "remote GBrain MCP endpoint")
  .option("--oauth-client-id <id>", "remote OAuth client id")
  .option("--secret-env <name>", "environment variable containing remote bearer/client secret")
  .option("--federated-read <sources>", "comma-separated source ids allowed for remote diagnostics")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      executable?: string;
      mode?: "personal" | "team";
      source?: string;
      query?: string;
      limit?: string;
      dryRun?: boolean;
      write?: boolean;
      allowTeamExport?: boolean;
      timeoutMs?: string;
      publishMode?: "capture" | "mcp_put_page";
      remote?: boolean;
      issuerUrl?: string;
      mcpUrl?: string;
      oauthClientId?: string;
      secretEnv?: string;
      federatedRead?: string;
      json?: boolean;
    }
  ) => {
    console.log(await gbrainCommand(process.cwd(), sub, {
      ...options,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      timeoutMs: options.timeoutMs ? parseInt(options.timeoutMs, 10) : undefined,
      federatedRead: options.federatedRead?.split(",").map((source) => source.trim()).filter(Boolean),
    }));
  });

program
  .command("context")
  .argument("<sub>", "subcommand (get)")
  .requiredOption("--agent <agent>")
  .requiredOption("--stage <stage>")
  .option("--query <query>")
  .option("--max-bytes <n>")
  .option("--with-agentmemory")
  .option("--with-gbrain")
  .option("--with-backend <name>", "optional sidecar backend (agentmemory|gbrain)", collectOptionValue, [])
  .option("--json")
  .action(async (
    sub: string,
    options: {
      agent: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic";
      stage: "diagnosis" | "repair" | "verification" | "proposal";
      query?: string;
      maxBytes?: string;
      withAgentMemory?: boolean;
      withGbrain?: boolean;
      withBackend?: string[];
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
  .command("kb")
  .argument("<sub>", "subcommand (audit|prune|rebuild)")
  .option("--yes", "confirm destructive prune before rebuild")
  .option("--dry-run", "force prune to report without deleting files")
  .option("--mode <mode>", "personal or team-git")
  .option("--limit <n>")
  .option("--build-site")
  .option("--branch <name>")
  .option("--commit")
  .option("--push")
  .option("--pr")
  .option("--degraded", "run deterministic fallback without production AI distill")
  .option("--no-ai", "disable AI distill for this run")
  .option("--max-ai-chunks <n>", "maximum production AI distill chunks for this run")
  .option("--ai-timeout-ms <n>", "override AI provider timeout for this run")
  .option("--ai-concurrency <n>", "maximum concurrent AI distill and curation calls")
  .option("--retry-failed-distill-only", "retry only chunks with cached AI distill failures")
  .option("--max-curation-proposals <n>", "maximum AI wiki curation proposals for this run")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      yes?: boolean;
      dryRun?: boolean;
      mode?: "personal" | "team-git";
      limit?: string;
      buildSite?: boolean;
      branch?: string;
      commit?: boolean;
      push?: boolean;
      pr?: boolean;
      degraded?: boolean;
      noAi?: boolean;
      ai?: boolean;
      maxAiChunks?: string;
      aiTimeoutMs?: string;
      aiConcurrency?: string;
      retryFailedDistillOnly?: boolean;
      maxCurationProposals?: string;
      json?: boolean;
    }
  ) => {
    console.log(await kbCommand(process.cwd(), sub, {
      ...options,
      noAi: options.noAi ?? options.ai === false,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      maxAiChunks: options.maxAiChunks ? parseInt(options.maxAiChunks, 10) : undefined,
      aiTimeoutMs: options.aiTimeoutMs ? parseInt(options.aiTimeoutMs, 10) : undefined,
      aiConcurrency: options.aiConcurrency ? parseInt(options.aiConcurrency, 10) : undefined,
      maxCurationProposals: options.maxCurationProposals ? parseInt(options.maxCurationProposals, 10) : undefined,
    }));
  });

program
  .command("wiki")
  .argument("<sub>", "subcommand (compile|curate|graph|build-site)")
  .option("--dry-run")
  .option("--review")
  .option("--degraded")
  .option("--ai-timeout-ms <n>", "override AI provider timeout for wiki curate")
  .option("--concurrency <n>", "maximum concurrent AI synthesis calls for wiki curate")
  .option("--semantic-review", "enable semantic review for wiki curate proposals")
  .option("--no-semantic-review", "disable semantic review for wiki curate proposals")
  .option("--min-source-count <n>", "minimum source count for wiki curate proposals")
  .option("--mode <mode>", "graph mode: full, overview, or ego")
  .option("--center <slug>", "center slug or id for ego graph")
  .option("--depth <n>", "ego graph BFS depth")
  .option("--limit <n>", "graph slice node limit")
  .option("--type <type>", "graph node kind filter", collectOptionValue, [])
  .option("--json")
  .action(async (sub: string, options: {
    dryRun?: boolean;
    review?: boolean;
    degraded?: boolean;
    aiTimeoutMs?: string;
    concurrency?: string;
    minSourceCount?: string;
    semanticReview?: boolean;
    mode?: "full" | "overview" | "ego";
    center?: string;
    depth?: string;
    limit?: string;
    type?: string[];
    json?: boolean;
  }) => {
    console.log(await wikiCommand(process.cwd(), sub, {
      ...options,
      aiTimeoutMs: options.aiTimeoutMs ? parseInt(options.aiTimeoutMs, 10) : undefined,
      concurrency: options.concurrency ? parseInt(options.concurrency, 10) : undefined,
      minSourceCount: options.minSourceCount ? parseInt(options.minSourceCount, 10) : undefined,
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
