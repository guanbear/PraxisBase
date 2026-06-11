import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import matter from "gray-matter";
import { appearsToBeRawLog } from "../protocol/redact.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import { protocolPaths } from "../protocol/paths.js";
import { writeJson } from "../store/file-store.js";
import type { LintFinding, LintReport, LintRule, LintSeverity, RunRecord, ExceptionRecord } from "../protocol/schemas.js";

export interface LintResult {
  report: LintReport;
  runRecord: RunRecord;
  exceptions: ExceptionRecord[];
}

interface ParsedKnowledgeObject {
  path: string;
  id?: string;
  type?: string;
  knowledge_type?: string;
  signatures?: string[];
  sources?: Array<{ uri: string; hash: string }>;
  superseded_by?: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
  parseError?: string;
}

async function listFilesRecursive(root: string, dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(join(root, dir), { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await listFilesRecursive(root, fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // directory may not exist
  }
  return results;
}

function normalizeAction(action: string): string {
  return action.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function scanKnowledgeFiles(root: string): Promise<ParsedKnowledgeObject[]> {
  const objects: ParsedKnowledgeObject[] = [];
  const dirs = [
    "kb/known-fixes",
    "kb/pitfalls",
    "kb/procedures",
    "kb/notes",
    "kb/memory",
    "kb/sources",
    "skills/openclaw",
    "skills/k8s",
  ];

  for (const dir of dirs) {
    const files = await listFilesRecursive(root, dir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      try {
        const content = await readFile(join(root, file), "utf8");
        const parsed = matter(content);
        const data = parsed.data as Record<string, unknown>;
        objects.push({
          path: file,
          id: typeof data.id === "string" ? data.id : undefined,
          type: typeof data.type === "string" ? data.type : undefined,
          knowledge_type: typeof data.knowledge_type === "string" ? data.knowledge_type : undefined,
          signatures: Array.isArray(data.signatures) ? data.signatures as string[] : undefined,
          sources: Array.isArray(data.sources) ? data.sources as Array<{ uri: string; hash: string }> : undefined,
          superseded_by: data.superseded_by != null ? String(data.superseded_by) : null,
          frontmatter: data,
          body: parsed.content,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        objects.push({
          path: file,
          frontmatter: {},
          body: "",
          parseError: message,
        });
      }
    }
  }

  return objects;
}

function lintInvalidFrontmatter(obj: ParsedKnowledgeObject): LintFinding | null {
  if (obj.path.startsWith("skills/")) return null;
  if (!obj.parseError) return null;

  return {
    rule: "invalid_frontmatter" as LintRule,
    severity: "error" as LintSeverity,
    path: obj.path,
    message: `Invalid frontmatter: ${obj.parseError}`,
  };
}

function lintMissingFrontmatter(obj: ParsedKnowledgeObject): LintFinding | null {
  if (obj.path.startsWith("skills/")) return null;
  if (obj.parseError) return null;

  const fm = obj.frontmatter;
  if (Object.keys(fm).length === 0) {
    return {
      rule: "missing_frontmatter" as LintRule,
      severity: "error" as LintSeverity,
      path: obj.path,
      message: "Missing frontmatter",
    };
  }
  return null;
}

function lintMissingGovernanceMetadata(obj: ParsedKnowledgeObject): LintFinding | null {
  if (obj.path.startsWith("skills/")) return null;
  if (obj.parseError) return null;
  if (!obj.frontmatter || Object.keys(obj.frontmatter).length === 0) return null;

  const required = ["protocol_version", "id", "type", "knowledge_type"] as const;
  const missing = required.filter((key) => !obj.frontmatter[key]);

  if (missing.length > 0) {
    return {
      rule: "missing_governance_metadata" as LintRule,
      severity: "error" as LintSeverity,
      path: obj.path,
      message: `Missing required governance metadata: ${missing.join(", ")}`,
      object_id: obj.id,
    };
  }
  return null;
}

function lintMissingEvidenceSource(obj: ParsedKnowledgeObject): LintFinding | null {
  if (obj.path.startsWith("skills/")) return null;
  if (obj.parseError) return null;
  if (!obj.frontmatter || Object.keys(obj.frontmatter).length === 0) return null;

  const status = typeof obj.frontmatter.status === "string" ? obj.frontmatter.status : undefined;
  const maturity = typeof obj.frontmatter.maturity === "string" ? obj.frontmatter.maturity : undefined;
  const requiresEvidence = status === "published" || maturity === "proven";
  if (!requiresEvidence) return null;

  const sources = obj.sources ?? [];
  const hasEvidenceSource = sources.some(
    (source) => typeof source.uri === "string" && source.uri.length > 0 && typeof source.hash === "string" && source.hash.length > 0
  );
  if (hasEvidenceSource) return null;

  return {
    rule: "missing_evidence_source" as LintRule,
    severity: "error" as LintSeverity,
    path: obj.path,
    message: "Published or proven knowledge must include evidence source uri and hash",
    object_id: obj.id,
  };
}

function lintRawLogContent(obj: ParsedKnowledgeObject): LintFinding | null {
  if (!obj.path.startsWith("kb/")) return null;

  if (appearsToBeRawLog(obj.body)) {
    return {
      rule: "raw_log_content" as LintRule,
      severity: "error" as LintSeverity,
      path: obj.path,
      message: "Raw log-like content detected under kb/",
      object_id: obj.id,
    };
  }
  return null;
}

function lintDuplicateIds(objects: ParsedKnowledgeObject[]): { findings: LintFinding[]; exceptions: ExceptionRecord[] } {
  const findings: LintFinding[] = [];
  const exceptions: ExceptionRecord[] = [];
  const idMap = new Map<string, ParsedKnowledgeObject[]>();

  for (const obj of objects) {
    if (!obj.id) continue;
    const existing = idMap.get(obj.id) ?? [];
    existing.push(obj);
    idMap.set(obj.id, existing);
  }

  for (const [id, objs] of idMap) {
    if (objs.length > 1) {
      findings.push({
        rule: "duplicate_id" as LintRule,
        severity: "error" as LintSeverity,
        path: objs.map((o) => o.path).join(", "),
        message: `Duplicate id '${id}' found in ${objs.length} objects`,
        object_id: id,
        details: { paths: objs.map((o) => o.path) },
      });

      exceptions.push({
        id: `exc_${randomUUID().slice(0, 8)}`,
        protocol_version: PROTOCOL_VERSION,
        type: "exception_record",
        category: "conflict",
        source_id: id,
        reason: `Duplicate id '${id}' found in ${objs.length} objects: ${objs.map((o) => o.path).join(", ")}`,
        details: { paths: objs.map((o) => o.path) },
        created_at: new Date().toISOString(),
      });
    }
  }

  return { findings, exceptions };
}

function lintDuplicateSourceHashes(objects: ParsedKnowledgeObject[]): LintFinding[] {
  const findings: LintFinding[] = [];
  const hashMap = new Map<string, ParsedKnowledgeObject[]>();

  for (const obj of objects) {
    if (!obj.sources) continue;
    for (const src of obj.sources) {
      if (!src.hash || src.hash === "sha256:seed") continue;
      const existing = hashMap.get(src.hash) ?? [];
      existing.push(obj);
      hashMap.set(src.hash, existing);
    }
  }

  for (const [hash, objs] of hashMap) {
    if (objs.length > 1) {
      const ids = [...new Set(objs.map((o) => o.id).filter(Boolean))];
      if (ids.length <= 1) continue;

      findings.push({
        rule: "duplicate_source_hash" as LintRule,
        severity: "warning" as LintSeverity,
        path: objs[0].path,
        message: `Duplicate source hash '${hash.slice(0, 20)}...' across ${objs.length} objects`,
        details: { hash, object_ids: ids },
      });
    }
  }

  return findings;
}

function lintDuplicateSignatures(objects: ParsedKnowledgeObject[]): LintFinding[] {
  const findings: LintFinding[] = [];
  const sigMap = new Map<string, Map<string, ParsedKnowledgeObject[]>>();

  for (const obj of objects) {
    if (!obj.knowledge_type) continue;
    if (!obj.signatures) continue;
    for (const sig of obj.signatures) {
      const typeMap = sigMap.get(sig) ?? new Map<string, ParsedKnowledgeObject[]>();
      const existing = typeMap.get(obj.knowledge_type) ?? [];
      existing.push(obj);
      typeMap.set(obj.knowledge_type, existing);
      sigMap.set(sig, typeMap);
    }
  }

  for (const [sig, typeMap] of sigMap) {
    for (const [knowledgeType, objs] of typeMap) {
      if (objs.length <= 1) continue;
      const ids = [...new Set(objs.map((o) => o.id).filter(Boolean))];
      if (ids.length <= 1) continue;

      findings.push({
        rule: "duplicate_signature" as LintRule,
        severity: "warning" as LintSeverity,
        path: objs[0].path,
        message: `Duplicate signature '${sig}' across ${knowledgeType} objects: ${ids.join(", ")}`,
        signature: sig,
        details: { knowledge_type: knowledgeType, object_ids: ids },
      });
    }
  }

  return findings;
}

function lintContradictions(objects: ParsedKnowledgeObject[]): { findings: LintFinding[]; exceptions: ExceptionRecord[] } {
  const findings: LintFinding[] = [];
  const exceptions: ExceptionRecord[] = [];

  const pitfallMap = new Map<string, Array<{ path: string; id?: string; forbidden_actions: string[] }>>();
  for (const obj of objects) {
    if (obj.frontmatter.type !== "pitfall") continue;
    if (!obj.signatures) continue;
    const forbidden = Array.isArray(obj.frontmatter.forbidden_actions)
      ? (obj.frontmatter.forbidden_actions as string[])
      : [];
    for (const sig of obj.signatures) {
      const list = pitfallMap.get(sig) ?? [];
      list.push({ path: obj.path, id: obj.id, forbidden_actions: forbidden });
      pitfallMap.set(sig, list);
    }
  }

  for (const obj of objects) {
    if (obj.frontmatter.type !== "known_fix" && obj.frontmatter.type !== "procedure") continue;
    if (!obj.signatures) continue;

    const recommendedActions = extractRecommendedActions(obj.body);
    if (recommendedActions.length === 0) continue;

    for (const sig of obj.signatures) {
      const pitfalls = pitfallMap.get(sig);
      if (!pitfalls) continue;

      for (const pitfall of pitfalls) {
        for (const action of recommendedActions) {
          const normalizedAction = normalizeAction(action);
          for (const forbidden of pitfall.forbidden_actions) {
            const normalizedForbidden = normalizeAction(forbidden);
            if (normalizedAction === normalizedForbidden) {
              findings.push({
                rule: "contradiction_action_forbidden" as LintRule,
                severity: "error" as LintSeverity,
                path: obj.path,
                message: `Contradiction: '${obj.id}' recommends '${action}' but pitfall '${pitfall.id}' forbids '${forbidden}' for same signature '${sig}'`,
                object_id: obj.id,
                signature: sig,
                details: {
                  recommended_action: action,
                  forbidden_action: forbidden,
                  pitfall_path: pitfall.path,
                  pitfall_id: pitfall.id,
                },
              });

              exceptions.push({
                id: `exc_${randomUUID().slice(0, 8)}`,
                protocol_version: PROTOCOL_VERSION,
                type: "exception_record",
                category: "human_required",
                source_id: obj.id ?? obj.path,
                reason: `Contradiction: recommended action '${action}' conflicts with forbidden action '${forbidden}' for signature '${sig}'`,
                details: {
                  recommended_action: action,
                  forbidden_action: forbidden,
                  knowledge_path: obj.path,
                  pitfall_path: pitfall.path,
                  signature: sig,
                },
                created_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    }
  }

  return { findings, exceptions };
}

function extractRecommendedActions(body: string): string[] {
  const actions: string[] = [];
  const sections = body.split(/^## /m);

  const actionSections = ["Fix", "Remediation", "Steps", "Recommendation", "Resolution"];
  for (const section of sections) {
    const newline = section.indexOf("\n");
    if (newline === -1) continue;
    const heading = section.slice(0, newline).trim();
    if (!actionSections.includes(heading)) continue;

    const lines = section.slice(newline + 1).split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^[-*]\s+(.+)/);
      if (match) {
        actions.push(match[1]);
      }
    }
  }

  return actions;
}

function lintSupersededActive(objects: ParsedKnowledgeObject[]): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const obj of objects) {
    if (obj.superseded_by && obj.frontmatter.status === "published") {
      findings.push({
        rule: "superseded_active" as LintRule,
        severity: "warning" as LintSeverity,
        path: obj.path,
        message: `Object '${obj.id}' has superseded_by='${obj.superseded_by}' but is still published`,
        object_id: obj.id,
        details: { superseded_by: obj.superseded_by },
      });
    }
  }

  return findings;
}

export async function lintWorkspace(root: string): Promise<LintResult> {
  const startedAt = new Date().toISOString();
  const allFindings: LintFinding[] = [];
  const allExceptions: ExceptionRecord[] = [];

  const objects = await scanKnowledgeFiles(root);

  for (const obj of objects) {
    const invalidFrontmatter = lintInvalidFrontmatter(obj);
    if (invalidFrontmatter) allFindings.push(invalidFrontmatter);

    const f1 = lintMissingFrontmatter(obj);
    if (f1) allFindings.push(f1);

    const f2 = lintMissingGovernanceMetadata(obj);
    if (f2) allFindings.push(f2);

    const missingEvidence = lintMissingEvidenceSource(obj);
    if (missingEvidence) allFindings.push(missingEvidence);

    const f3 = lintRawLogContent(obj);
    if (f3) allFindings.push(f3);
  }

  const { findings: dupIdFindings, exceptions: dupIdExceptions } = lintDuplicateIds(objects);
  allFindings.push(...dupIdFindings);
  allExceptions.push(...dupIdExceptions);

  allFindings.push(...lintDuplicateSourceHashes(objects));
  allFindings.push(...lintDuplicateSignatures(objects));

  const { findings: contradictionFindings, exceptions: contradictionExceptions } = lintContradictions(objects);
  allFindings.push(...contradictionFindings);
  allExceptions.push(...contradictionExceptions);

  allFindings.push(...lintSupersededActive(objects));

  const errorCount = allFindings.filter((f) => f.severity === "error").length;
  const warningCount = allFindings.filter((f) => f.severity === "warning").length;

  const runId = `run_lint_${randomUUID().slice(0, 8)}`;
  const reportId = `report_lint_${randomUUID().slice(0, 8)}`;

  const report: LintReport = {
    id: reportId,
    protocol_version: PROTOCOL_VERSION,
    type: "lint_report",
    run_id: runId,
    findings: allFindings,
    summary: { errors: errorCount, warnings: warningCount },
    created_at: new Date().toISOString(),
  };

  const runRecord: RunRecord = {
    id: runId,
    protocol_version: PROTOCOL_VERSION,
    command: "lint",
    status: errorCount > 0 ? "partial" : "completed",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    counts: { errors: errorCount, warnings: warningCount, findings: allFindings.length },
    errors: [],
  };

  await mkdir(join(root, protocolPaths.reportsLint), { recursive: true });
  await writeJson(root, `${protocolPaths.reportsLint}/${reportId}.json`, report);

  await mkdir(join(root, protocolPaths.runsLint), { recursive: true });
  await writeJson(root, `${protocolPaths.runsLint}/${runId}.json`, runRecord);

  for (const exception of allExceptions) {
    if (exception.category === "conflict") {
      await mkdir(join(root, protocolPaths.exceptionsConflicts), { recursive: true });
      await writeJson(root, `${protocolPaths.exceptionsConflicts}/${exception.id}.json`, exception);
    } else if (exception.category === "human_required") {
      await mkdir(join(root, protocolPaths.exceptionsHumanRequired), { recursive: true });
      await writeJson(root, `${protocolPaths.exceptionsHumanRequired}/${exception.id}.json`, exception);
    }
  }

  return { report, runRecord, exceptions: allExceptions };
}
