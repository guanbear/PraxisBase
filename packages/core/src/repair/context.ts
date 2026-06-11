import { readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { readJson, readText } from "../store/file-store.js";
import { detectOpenClawProblemSignature, type OpenClawSignatureCandidate } from "./signature.js";

export interface RepairContextInput {
  logs: string;
  root?: string;
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
  truncated?: boolean;
  warnings?: string[];
}

interface ContextBudgetPolicy {
  openclaw_repair_context_bytes: number;
}

interface RepairKnowledgeObject {
  path: string;
  kind: "known_fix" | "procedure" | "pitfall" | "skill";
  signatures: string[];
  maturity: string;
  referenceCount: number;
  contentBytes: number;
  title: string;
  matchTerms: string[];
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

const DEFAULT_CONTEXT_BUDGET_BYTES = 6000;

async function listFiles(root: string, dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(join(root, dir), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        results.push(...await listFiles(root, relativePath));
      } else {
        results.push(relativePath);
      }
    }
  } catch {
    // Optional knowledge directories may not exist.
  }
  return results;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function maturityWeight(value: string): number {
  if (value === "proven") return 3;
  if (value === "verified") return 2;
  if (value === "draft") return 1;
  return 0;
}

function termsForObject(data: Record<string, unknown>, content: string): string[] {
  const base = [
    stringValue(data.id),
    stringValue(data.title),
    stringValue(data.name),
    content.slice(0, 800),
  ].filter((item): item is string => Boolean(item));
  return Array.from(new Set(base.flatMap((item) =>
    item
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((term) => term.length >= 4)
  )));
}

async function readRepairKnowledge(root: string): Promise<RepairKnowledgeObject[]> {
  const files = [
    ...(await listFiles(root, "kb/known-fixes")),
    ...(await listFiles(root, "kb/procedures")),
    ...(await listFiles(root, "kb/pitfalls")),
    ...(await listFiles(root, "skills/openclaw")),
  ].filter((file) => file.endsWith(".md"));

  const objects: RepairKnowledgeObject[] = [];
  for (const file of files) {
    const content = await readText(root, file);
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;
    const signatures = stringArray(data.signatures).filter((signature) => signature.startsWith("openclaw:"));
    if (signatures.length === 0) continue;
    const kind = file.startsWith("skills/")
      ? "skill"
      : file.startsWith("kb/procedures/")
        ? "procedure"
        : file.startsWith("kb/pitfalls/")
          ? "pitfall"
          : "known_fix";
    objects.push({
      path: file,
      kind,
      signatures,
      maturity: stringValue(data.maturity) ?? (kind === "skill" ? "verified" : "draft"),
      referenceCount: numberValue(data.reference_count),
      contentBytes: Buffer.byteLength(content, "utf8"),
      title: stringValue(data.title) ?? stringValue(data.name) ?? file,
      matchTerms: termsForObject(data, content),
    });
  }
  return objects;
}

async function readBudget(root: string | undefined): Promise<number> {
  if (!root) return DEFAULT_CONTEXT_BUDGET_BYTES;
  try {
    const policy = await readJson<Partial<ContextBudgetPolicy>>(root, ".praxisbase/policies/context-budget.json");
    const configured = policy.openclaw_repair_context_bytes;
    if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) return configured;
  } catch {
    // Missing policy uses the safe default.
  }
  return DEFAULT_CONTEXT_BUDGET_BYTES;
}

function fallbackContext(signature: string): RepairContext {
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

export async function buildOpenClawRepairContext(input: RepairContextInput): Promise<RepairContext> {
  const objects = input.root ? await readRepairKnowledge(input.root) : [];
  const candidates: OpenClawSignatureCandidate[] = objects.flatMap((object) =>
    object.signatures.map((signature) => ({
      signature,
      terms: object.matchTerms,
    }))
  );
  const signature = detectOpenClawProblemSignature(input.logs, candidates);
  const matching = objects
    .filter((object) => object.signatures.includes(signature))
    .sort((a, b) =>
      maturityWeight(b.maturity) - maturityWeight(a.maturity)
      || b.referenceCount - a.referenceCount
      || a.path.localeCompare(b.path)
    );

  if (input.root && matching.length > 0) {
    const budget = await readBudget(input.root);
    const totalBytes = matching.reduce((sum, object) => sum + object.contentBytes, 0);
    return {
      protocol_version: "0.1",
      scenario: "openclaw",
      problem_signature: signature,
      skills: matching.filter((object) => object.kind === "skill").map((object) => object.path),
      known_fixes: matching.filter((object) => object.kind === "known_fix").map((object) => object.path),
      diagnostic_commands: ["openclaw status"],
      forbidden_operations: BASELINE_FORBIDDEN,
      verification_steps: ["Review matched PraxisBase knowledge and run its verification steps"],
      rollback_steps: ["Do not apply changes until the matched knowledge has a rollback or safe stop condition"],
      escalation_conditions: ["Matched knowledge is over budget or lacks verification evidence"],
      truncated: totalBytes > budget,
      warnings: totalBytes > budget ? [`repair context exceeded budget ${budget} bytes; compact output returned`] : [],
    };
  }

  return fallbackContext(signature);
}
