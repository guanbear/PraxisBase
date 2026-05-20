import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROTECTED_BRANCHES = new Set(["main", "master", "trunk"]);

export interface TeamGitActionInput {
  team?: boolean;
  branch?: string;
  commit?: boolean;
  push?: boolean;
  pr?: boolean;
  currentBranch?: string;
  message?: string;
}

export interface TeamGitActionPlan {
  authorityMode: "personal-local" | "team-git";
  branch?: string;
  shouldCommit: boolean;
  shouldPush: boolean;
  shouldCreatePr: boolean;
  message: string;
  warnings: string[];
}

export type GitCommandRunner = (command: string, args: string[]) => Promise<string>;

export interface ExecutedTeamGitAction {
  branch?: string;
  committed: boolean;
  pushed: boolean;
  commit_sha?: string;
  pr_url?: string;
}

export async function planTeamGitAction(_root: string, input: TeamGitActionInput): Promise<TeamGitActionPlan> {
  if (input.push && !input.commit) {
    throw new Error("HARVEST_COMMIT_REQUIRED: --push requires --commit.");
  }
  if (input.pr && !input.push) {
    throw new Error("HARVEST_PUSH_REQUIRED: --pr requires --push.");
  }
  const currentBranch = input.currentBranch ?? "unknown";
  if (input.team && input.commit && PROTECTED_BRANCHES.has(currentBranch) && !input.branch) {
    throw new Error("HARVEST_BRANCH_REQUIRED: --team --commit on a protected branch requires --branch.");
  }

  return {
    authorityMode: input.team ? "team-git" : "personal-local",
    branch: input.branch,
    shouldCommit: input.commit ?? false,
    shouldPush: input.push ?? false,
    shouldCreatePr: input.pr ?? false,
    message: input.message ?? "chore: harvest memory",
    warnings: input.pr ? ["pr_creation_not_implemented"] : [],
  };
}

export async function executeTeamGitAction(
  _root: string,
  plan: TeamGitActionPlan,
  runCommand: GitCommandRunner
): Promise<ExecutedTeamGitAction> {
  if (plan.authorityMode !== "team-git") {
    return { branch: plan.branch, committed: false, pushed: false };
  }
  if (plan.branch) {
    await runCommand("git", ["checkout", "-B", plan.branch]);
  }
  let commitSha: string | undefined;
  if (plan.shouldCommit) {
    await runCommand("git", ["add", "."]);
    await runCommand("git", ["commit", "-m", plan.message]);
    commitSha = (await runCommand("git", ["rev-parse", "HEAD"])).trim();
  }
  if (plan.shouldPush) {
    if (!plan.branch) throw new Error("HARVEST_BRANCH_REQUIRED: --push requires a branch.");
    await runCommand("git", ["push", "-u", "origin", plan.branch]);
  }
  return {
    branch: plan.branch,
    committed: plan.shouldCommit,
    pushed: plan.shouldPush,
    commit_sha: commitSha,
  };
}

export function createDefaultGitRunner(root: string): GitCommandRunner {
  return async (command: string, args: string[]) => {
    const { stdout } = await execFileAsync(command, args, { cwd: root });
    return stdout;
  };
}
