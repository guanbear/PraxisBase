import { detectOpenClawProblemSignature } from "./signature.js";

export interface RepairContextInput {
  logs: string;
}

export interface RepairContext {
  protocol_version: "0.1";
  scenario: "openclaw";
  problem_signature: string;
  skills: string[];
  known_fixes: string[];
  diagnostic_commands: string[];
  forbidden_operations: string[];
  verification_steps: string[];
  rollback_steps: string[];
  escalation_conditions: string[];
}

const BASELINE_SKILL = "skills/openclaw/baseline-diagnostics/SKILL.md";
const BASELINE_FORBIDDEN = [
  "modify production systems",
  "delete user workspace data",
  "print secrets into chat",
];

const SIGNATURE_CONTEXTS: Record<string, Partial<RepairContext>> = {
  "openclaw:claude-auth-expired": {
    skills: [BASELINE_SKILL, "skills/openclaw/auth-repair/SKILL.md"],
    known_fixes: ["kb/known-fixes/openclaw-auth-expired.md"],
    diagnostic_commands: [
      "openclaw status",
      "claude --version",
      "env | grep -E 'CLAUDE|OPENAI|ANTHROPIC|MODEL'",
    ],
    verification_steps: [
      "Run a minimal model call from the sandbox",
      "Confirm OpenClaw session resumes",
    ],
    rollback_steps: [
      "Restore previous auth state snapshot if available",
      "Revert local credential file changes",
    ],
    escalation_conditions: [
      "Auth refresh fails twice",
      "Logs mention production credentials",
      "Verification command cannot run",
    ],
  },
  "openclaw:workspace-lock-stuck": {
    skills: [BASELINE_SKILL],
    known_fixes: [],
    diagnostic_commands: [
      "ls -la .openclaw/*.lock",
      "openclaw status",
    ],
    verification_steps: [
      "Confirm workspace lock is released",
      "Run a minimal workspace command",
    ],
    rollback_steps: [
      "Restore previous workspace state if available",
    ],
    escalation_conditions: [
      "Lock cannot be safely removed",
      "Workspace appears corrupted",
    ],
  },
  "openclaw:node-runtime-missing": {
    skills: [BASELINE_SKILL],
    known_fixes: [],
    diagnostic_commands: [
      "which node || echo 'node not found'",
      "node --version || true",
      "echo $PATH",
    ],
    verification_steps: [
      "Confirm node is available in PATH",
      "Run node --version",
    ],
    rollback_steps: [
      "Restore previous PATH if modified",
    ],
    escalation_conditions: [
      "Node cannot be installed in sandbox",
      "Runtime version mismatch",
    ],
  },
};

export function buildOpenClawRepairContext(input: RepairContextInput): RepairContext {
  const signature = detectOpenClawProblemSignature(input.logs);
  const ctx = SIGNATURE_CONTEXTS[signature];

  if (ctx) {
    return {
      protocol_version: "0.1",
      scenario: "openclaw",
      problem_signature: signature,
      skills: ctx.skills ?? [BASELINE_SKILL],
      known_fixes: ctx.known_fixes ?? [],
      diagnostic_commands: ctx.diagnostic_commands ?? ["openclaw status"],
      forbidden_operations: BASELINE_FORBIDDEN,
      verification_steps: ctx.verification_steps ?? ["Record diagnostic results"],
      rollback_steps: ctx.rollback_steps ?? ["Do not apply changes until a known fix is identified"],
      escalation_conditions: ctx.escalation_conditions ?? ["No known signature matched"],
    };
  }

  return {
    protocol_version: "0.1",
    scenario: "openclaw",
    problem_signature: signature,
    skills: [BASELINE_SKILL],
    known_fixes: [],
    diagnostic_commands: ["openclaw status", "tail -n 200 openclaw.log"],
    forbidden_operations: BASELINE_FORBIDDEN,
    verification_steps: ["Record diagnostic results"],
    rollback_steps: ["Do not apply changes until a known fix is identified"],
    escalation_conditions: ["No known signature matched"],
  };
}
