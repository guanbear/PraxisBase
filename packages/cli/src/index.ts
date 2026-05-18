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

const program = new Command();

program
  .name("praxisbase")
  .description("Agent-native knowledge substrate for OpenClaw repair workflows")
  .version("0.1.0");

program.command("init").action(async () => {
  await initializeWorkspace(process.cwd());
  console.log("PraxisBase workspace initialized.");
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

program
  .command("bundle")
  .argument("fetch")
  .argument("<scenario>")
  .option("--signature <signature>")
  .action(async (_fetch: string, scenario: string, options: { signature?: string }) => {
    const result = await bundleFetchCommand(scenario, options.signature);
    console.log(JSON.stringify(result, null, 2));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
