import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { makeId, computeHash } from "../protocol/id.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { readJson, writeJson } from "../store/file-store.js";
import {
  SkillValidationReportSchema,
  type SkillValidationReport,
  type SkillValidationCheck,
  type SkillValidationDecision,
} from "../protocol/schemas.js";
import { SkillSynthesisCandidateSchema, type SkillSynthesisCandidate } from "./skill-model.js";

const REQUIRED_SECTIONS = ["When To Use", "Procedure", "Verification", "Pitfalls"];
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/).+$/;
const SKILL_MD_PATH = /^skills\/[^/]+\/[^/]+\/SKILL\.md$/;
const SUPPORT_FILE_PATH = /^skills\/[^/]+\/[^/]+\/(references\/[^/]+\.md|templates\/[^/]+\.[A-Za-z0-9._-]+|scripts\/[^/]+\.[A-Za-z0-9._-]+)$/;

interface ValidateSkillOptions {
  now?: string;
  write?: boolean;
  root?: string;
  replayEnabled?: boolean;
}

function checkSafePath(candidate: SkillSynthesisCandidate): SkillValidationCheck {
  const expectedPath = candidate.action === "skill_support_file" ? SUPPORT_FILE_PATH : SKILL_MD_PATH;
  const passed = SAFE_RELATIVE_PATH.test(candidate.target_path) && expectedPath.test(candidate.target_path);
  return { check: "safe_path", passed, details: passed ? undefined : `Invalid target_path: ${candidate.target_path}` };
}

function checkRequiredSections(body: string): SkillValidationCheck {
  const missing = REQUIRED_SECTIONS.filter((heading) => !new RegExp(`^##\\s+${heading}\\s*$`, "im").test(body));
  return {
    check: "required_sections",
    passed: missing.length === 0,
    details: missing.length === 0 ? undefined : `Missing sections: ${missing.join(", ")}`,
  };
}

function checkProvenanceAndSourceHashes(candidate: SkillSynthesisCandidate): SkillValidationCheck {
  const hasRefs = candidate.source_refs.length > 0;
  const hasHashes = candidate.source_hashes.length > 0;
  return {
    check: "provenance_source_hashes",
    passed: hasRefs && hasHashes,
    details: hasRefs && hasHashes ? undefined : "Missing source refs or source hashes",
  };
}

function checkFrontmatterShape(candidate: SkillSynthesisCandidate): SkillValidationCheck {
  const hasTitle = candidate.title.trim().length > 0;
  const hasSummary = candidate.summary.trim().length > 0;
  const hasScope = Boolean(candidate.scope);
  return {
    check: "frontmatter_shape",
    passed: hasTitle && hasSummary && hasScope,
    details: hasTitle && hasSummary && hasScope ? undefined : "Missing title, summary, or scope",
  };
}

function checkBodyShape(candidate: SkillSynthesisCandidate): SkillValidationCheck {
  const body = candidate.body_markdown;
  const lines = body.trim().split(/\r?\n/);
  const minimumContentLines = candidate.action === "skill_support_file" ? 1 : 5;
  const hasContent = lines.filter((l) => l.trim().length > 0).length >= minimumContentLines;
  return {
    check: "body_shape",
    passed: hasContent,
    details: hasContent ? undefined : "Body too short or empty",
  };
}

function simulateEvidence(candidate: SkillSynthesisCandidate): SkillValidationCheck {
  const sourceCount = candidate.source_count;
  const confidence = candidate.confidence;
  const adequate = sourceCount >= 2 && confidence >= 0.5;
  return {
    check: "evidence_simulation",
    passed: adequate,
    details: adequate
      ? `Source count ${sourceCount} and confidence ${confidence.toFixed(2)} meet threshold.`
      : `Insufficient evidence: source_count=${sourceCount}, confidence=${confidence.toFixed(2)}`,
  };
}

export function validateSkillCandidate(candidate: SkillSynthesisCandidate, options?: ValidateSkillOptions): SkillValidationReport {
  const now = options?.now ?? new Date().toISOString();
  const checks: SkillValidationCheck[] = [];

  checks.push(checkSafePath(candidate));
  if (candidate.action !== "skill_support_file") {
    checks.push(checkRequiredSections(candidate.body_markdown));
  }
  checks.push(checkProvenanceAndSourceHashes(candidate));
  checks.push(checkFrontmatterShape(candidate));
  checks.push(checkBodyShape(candidate));
  checks.push(simulateEvidence(candidate));

  const allPassed = checks.every((c) => c.passed);
  const hasNeedsHuman = checks.some((c) => !c.passed && c.check === "evidence_simulation");

  let decision: SkillValidationDecision;
  if (allPassed) {
    decision = "pass";
  } else if (hasNeedsHuman) {
    decision = "needs_human";
  } else {
    decision = "fail";
  }

  const reasons: string[] = checks.filter((c) => !c.passed).map((c) => `${c.check}: ${c.details ?? "failed"}`);
  const reason = reasons.length > 0 ? reasons.join("; ") : "All checks passed.";

  const report = SkillValidationReportSchema.parse({
    id: makeId("skill-validation", computeHash(JSON.stringify({ candidate_id: candidate.id, now }))),
    protocol_version: PROTOCOL_VERSION,
    type: "skill_validation_report",
    candidate_id: candidate.id,
    target_path: candidate.target_path,
    source_hashes: candidate.source_hashes,
    mode: options?.replayEnabled ? "replay" : "static",
    evidence_ids: candidate.evidence_ids,
    checks,
    decision,
    reason,
    created_at: now,
  });

  return report;
}

export async function writeSkillValidationReport(root: string, report: SkillValidationReport): Promise<string> {
  const path = `${protocolPaths.reportsSkillValidation}/${report.id}.json`;
  await writeJson(root, path, report);
  return path;
}

export async function validateSkillCandidateFromProposal(root: string, proposalId: string, options?: ValidateSkillOptions): Promise<{ report: SkillValidationReport; reportPath?: string }> {
  const candidateValue = await readJson<unknown>(root, `${protocolPaths.inboxProposals}/${proposalId}.json`);
  const candidate = SkillSynthesisCandidateSchema.parse(candidateValue);
  const report = validateSkillCandidate(candidate, { ...options, now: options?.now });

  if (options?.write) {
    const reportPath = await writeSkillValidationReport(root, report);
    return { report, reportPath };
  }

  return { report };
}

export type ValidationMatchResult =
  | { status: "pass"; report: SkillValidationReport }
  | { status: "missing" }
  | { status: "stale"; reason: string }
  | { status: "mismatched"; reason: string }
  | { status: "failing"; reason: string };

function sameSourceHashes(report: SkillValidationReport, candidate: SkillValidationCandidateIdentity): boolean {
  if (!report.source_hashes) return false;
  const reportHashes = [...report.source_hashes].sort();
  const candidateHashes = [...candidate.source_hashes].sort();
  return reportHashes.length === candidateHashes.length && reportHashes.every((hash, index) => hash === candidateHashes[index]);
}

export type SkillValidationCandidateIdentity = Pick<SkillSynthesisCandidate, "id" | "target_path" | "source_hashes">;

export async function findFreshPassingValidationReport(
  root: string,
  candidate: SkillValidationCandidateIdentity,
): Promise<ValidationMatchResult> {
  const dir = join(root, protocolPaths.reportsSkillValidation);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return { status: "missing" };
  }

  const matchingReports: SkillValidationReport[] = [];
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const value = await readJson<unknown>(root, `${protocolPaths.reportsSkillValidation}/${file}`);
      const parsed = SkillValidationReportSchema.safeParse(value);
      if (parsed.success && parsed.data.candidate_id === candidate.id) {
        matchingReports.push(parsed.data);
      }
    } catch {
      continue;
    }
  }

  if (matchingReports.length === 0) {
    return { status: "missing" };
  }

  const sortedReports = matchingReports.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const exactReport = sortedReports.find((report) => report.target_path === candidate.target_path && sameSourceHashes(report, candidate));
  if (exactReport) {
    if (exactReport.decision === "pass") {
      return { status: "pass", report: exactReport };
    }
    return { status: "failing", reason: `Latest matching validation decision is ${exactReport.decision}: ${exactReport.reason}` };
  }

  const sameTarget = sortedReports.some((report) => report.target_path === candidate.target_path);
  if (sameTarget) {
    return { status: "stale", reason: "No validation report has matching candidate_id, target_path, source_hashes, and decision=pass." };
  }

  const latestWithTarget = sortedReports.find((report) => report.target_path);
  if (latestWithTarget) {
    return { status: "mismatched", reason: `Validation target_path "${latestWithTarget.target_path}" does not match candidate target_path "${candidate.target_path}"` };
  }

  return { status: "stale", reason: "Validation report is missing target_path/source_hashes metadata and cannot prove freshness." };
}

export async function collectValidationSummaries(root: string): Promise<{
  total: number;
  by_decision: Record<string, number>;
  candidates_without_passing: Array<{ candidate_id: string; latest_decision: string }>;
}> {
  const dir = join(root, protocolPaths.reportsSkillValidation);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return { total: 0, by_decision: {}, candidates_without_passing: [] };
  }

  const reports: SkillValidationReport[] = [];
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    try {
      const value = await readJson<unknown>(root, `${protocolPaths.reportsSkillValidation}/${file}`);
      const parsed = SkillValidationReportSchema.safeParse(value);
      if (parsed.success) reports.push(parsed.data);
    } catch {
      continue;
    }
  }

  const byDecision: Record<string, number> = {};
  for (const report of reports) {
    byDecision[report.decision] = (byDecision[report.decision] ?? 0) + 1;
  }

  const candidateReports = new Map<string, SkillValidationReport[]>();
  for (const report of reports) {
    const list = candidateReports.get(report.candidate_id) ?? [];
    list.push(report);
    candidateReports.set(report.candidate_id, list);
  }

  const candidatesWithoutPassing: Array<{ candidate_id: string; latest_decision: string }> = [];
  for (const [candidateId, candidateReportList] of candidateReports) {
    const sorted = candidateReportList.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latest = sorted[0];
    if (latest && latest.decision !== "pass") {
      candidatesWithoutPassing.push({ candidate_id: candidateId, latest_decision: latest.decision });
    }
  }

  return { total: reports.length, by_decision: byDecision, candidates_without_passing: candidatesWithoutPassing };
}
