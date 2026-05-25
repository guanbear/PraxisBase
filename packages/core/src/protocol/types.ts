export const PROTOCOL_VERSION = "0.1" as const;

export type Scope = "personal" | "project" | "team" | "global" | "org";
export type Layer = "preference" | "convention" | "technical" | "domain" | "project";
export type AgentProfile = "codex" | "claude-code" | "opencode" | "openclaw" | "hermes" | "openhuman" | "agentmemory" | "generic";
export type AgentType =
  | "temporary_repair_agent"
  | "persistent_bot"
  | "reviewer"
  | "curator"
  | "system_ingest"
  | "live_incident_analyzer";
export type RepairResult = "success" | "failed" | "partial" | "unknown";
export type IncidentResult = "confirmed" | "ruled_out" | "inconclusive" | "data_gap";
export type CaptureResult = "success" | "failed" | "partial" | "unknown";
export type RiskLevel = "low" | "medium" | "high";
export type ProposalAction = "create" | "patch" | "archive" | "link";
export type TargetType = "note" | "known_fix" | "procedure" | "skill" | "policy" | "decision" | "pitfall";
export type ReviewDecision = "approve" | "reject" | "needs_human" | "conflict";
export type KnowledgeType = "known_fix" | "procedure" | "skill" | "decision" | "policy" | "pitfall" | "guideline" | "model" | "note";
export type Maturity = "draft" | "verified" | "proven";
export type ExceptionCategory = "human_required" | "conflict" | "failed_check";
export type RunCommand = "review" | "promote" | "build" | "lint" | "capture" | "distill" | "memory-import";
export type RunStatus = "completed" | "partial" | "failed";

export interface Evidence {
  source_uri: string;
  source_hash: string;
  excerpt: string;
  repair_result: RepairResult;
  verification: string;
  source_refs?: Array<{ uri: string; hash: string }>;
  redacted_summary?: string;
}
