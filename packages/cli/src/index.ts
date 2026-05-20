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
import { captureFinishCommand } from "./commands/capture.js";
import { installCommand } from "./commands/install.js";
import { memoryCommand } from "./commands/memory.js";
import { contextCommand } from "./commands/context.js";
import { distillCommand } from "./commands/distill.js";
import { watchCommand } from "./commands/watch.js";

const program = new Command();

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
  .argument("<sub>", "subcommand (import|refresh)")
  .requiredOption("--agent <agent>")
  .option("--source <file>")
  .option("--target <target>")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      agent: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic";
      source?: string;
      target?: "context" | "instruction-snippet" | "patch-proposal";
      json?: boolean;
    }
  ) => {
    console.log(await memoryCommand(process.cwd(), sub, options));
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
  .command("capture")
  .argument("<sub>", "subcommand (finish)")
  .requiredOption("--agent <agent>")
  .requiredOption("--result <result>")
  .requiredOption("--source-ref <ref>")
  .requiredOption("--source-hash <hash>")
  .requiredOption("--summary <summary>")
  .option("--json")
  .action(async (
    sub: string,
    options: {
      agent: "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "generic";
      result: "success" | "failed" | "partial" | "unknown";
      sourceRef: string;
      sourceHash: string;
      summary: string;
      json?: boolean;
    }
  ) => {
    if (sub !== "finish") {
      program.error(`Unknown subcommand "capture ${sub}". Use "capture finish".`, { exitCode: 1 });
    }
    console.log(await captureFinishCommand(process.cwd(), options));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
