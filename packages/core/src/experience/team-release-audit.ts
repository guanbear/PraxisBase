import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import matter from "gray-matter";
import { protocolPaths } from "../protocol/paths.js";
import {
  AnyEpisodeSchema,
  K8sIncidentManifestSchema,
  ProposalSchema,
  ReviewSchema,
  TeamReleaseAuditReportSchema,
} from "../protocol/schemas.js";

export type TeamReleaseGateStatus = "pass" | "fail" | "warning" | "not_run";

export interface TeamReleaseAuditGate {
  status: TeamReleaseGateStatus;
  blockers: string[];
  warnings: string[];
  evidence_reports: string[];
  next_commands: string[];
}

export interface TeamReleaseAuditReport {
  type: "team_release_audit_report";
  ok: boolean;
  team_ga: TeamReleaseGateStatus;
  team_repair_loop_ga: TeamReleaseGateStatus;
  skill_self_evolution_ga: TeamReleaseGateStatus;
  governance_ga: TeamReleaseGateStatus;
  privacy_boundary_ga: TeamReleaseGateStatus;
  k8s_bundle_ga: TeamReleaseGateStatus;
  incident_episode_intake_ga: TeamReleaseGateStatus;
  k8s_boundary_ga: TeamReleaseGateStatus;
  gates: {
    team_repair_loop_ga: TeamReleaseAuditGate;
    skill_self_evolution_ga: TeamReleaseAuditGate;
    governance_ga: TeamReleaseAuditGate;
    privacy_boundary_ga: TeamReleaseAuditGate;
    k8s_bundle_ga: TeamReleaseAuditGate;
    incident_episode_intake_ga: TeamReleaseAuditGate;
    k8s_boundary_ga: TeamReleaseAuditGate;
  };
  blocking_reasons: string[];
  warnings: string[];
  evidence_reports: string[];
  next_commands: string[];
  generated_at: string;
}

interface LatestJsonReport {
  path: string;
  value: Record<string, unknown>;
  sortKey: string;
}

interface K8sDomainState {
  enabled: boolean;
  evidence_reports: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function gate(
  status: TeamReleaseGateStatus,
  blockers: string[],
  warnings: string[],
  evidenceReports: string[],
  nextCommands: string[],
): TeamReleaseAuditGate {
  return {
    status,
    blockers: Array.from(new Set(blockers)).sort(),
    warnings: Array.from(new Set(warnings)).sort(),
    evidence_reports: Array.from(new Set(evidenceReports)).sort(),
    next_commands: Array.from(new Set(nextCommands)),
  };
}

async function collectJsonFiles(root: string, relativeDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(root, relativeDir), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collectJsonFiles(root, relativePath));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(relativePath);
  }
  return files.sort();
}

async function latestJsonReport(root: string, relativeDir: string): Promise<LatestJsonReport | undefined> {
  const candidates: LatestJsonReport[] = [];
  for (const path of await collectJsonFiles(root, relativeDir)) {
    try {
      const raw = JSON.parse(await readFile(join(root, path), "utf8")) as unknown;
      if (!isRecord(raw)) continue;
      const stats = await stat(join(root, path));
      const created = typeof raw.created_at === "string" ? raw.created_at : undefined;
      const generated = typeof raw.generated_at === "string" ? raw.generated_at : undefined;
      const finished = typeof raw.finished_at === "string" ? raw.finished_at : undefined;
      candidates.push({
        path,
        value: raw,
        sortKey: `${created ?? generated ?? finished ?? stats.mtime.toISOString()}|${path}`,
      });
    } catch {
      continue;
    }
  }
  return candidates.sort((a, b) => b.sortKey.localeCompare(a.sortKey))[0];
}

async function listFiles(root: string, relativeDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(root, relativeDir), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(root, relativePath));
    else if (entry.isFile()) files.push(relative(root, join(root, relativePath)).replace(/\\/g, "/"));
  }
  return files.sort();
}

async function buildTeamRepairLoopGate(root: string): Promise<TeamReleaseAuditGate> {
  const episodeFiles = await collectJsonFiles(root, protocolPaths.inboxEpisodes);
  const proposalFiles = await collectJsonFiles(root, protocolPaths.inboxProposals);
  const reviewFiles = await collectJsonFiles(root, protocolPaths.inboxReviews);
  const buildRun = await latestJsonReport(root, protocolPaths.runsBuild);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const evidence: string[] = [];

  const successfulTeamEpisodes = [];
  for (const path of episodeFiles) {
    try {
      const parsed = AnyEpisodeSchema.safeParse(JSON.parse(await readFile(join(root, path), "utf8")));
      if (!parsed.success) continue;
      const episode = parsed.data;
      if (episode.scope !== "team") continue;
      if ((episode.result === "success" || episode.result === "confirmed") && episode.knowledge_references.length > 0) {
        successfulTeamEpisodes.push(episode);
        evidence.push(path);
      }
    } catch {
      continue;
    }
  }

  const teamProposals = [];
  for (const path of proposalFiles) {
    try {
      const parsed = ProposalSchema.safeParse(JSON.parse(await readFile(join(root, path), "utf8")));
      if (parsed.success && parsed.data.scope === "team") {
        teamProposals.push(parsed.data);
        evidence.push(path);
      }
    } catch {
      continue;
    }
  }
  const proposalIds = new Set(teamProposals.map((proposal) => proposal.id));
  const approvedReviews = [];
  for (const path of reviewFiles) {
    try {
      const parsed = ReviewSchema.safeParse(JSON.parse(await readFile(join(root, path), "utf8")));
      if (parsed.success && parsed.data.decision === "approve" && proposalIds.has(parsed.data.proposal_id)) {
        approvedReviews.push(parsed.data);
        evidence.push(path);
      }
    } catch {
      continue;
    }
  }

  if (successfulTeamEpisodes.length === 0) blockers.push("team_success_episode_with_knowledge_reference_missing");
  if (teamProposals.length === 0) blockers.push("team_repair_proposal_missing");
  if (approvedReviews.length === 0) blockers.push("team_repair_review_missing");
  if (!buildRun || buildRun.value.status !== "completed") blockers.push("team_build_run_missing");
  else evidence.push(buildRun.path);
  if (teamProposals.length > 0 && approvedReviews.length === 0) warnings.push("team_proposals_waiting_for_git_review");

  return gate(
    blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    evidence,
    blockers.length === 0
      ? []
      : [
        "praxisbase repair-context openclaw --logs <logs> --json",
        "praxisbase episode submit <episode.json>",
        "praxisbase propose <proposal.json>",
        "praxisbase review auto",
        "praxisbase promote --auto",
        "praxisbase build",
      ],
  );
}

async function buildSkillSelfEvolutionGate(root: string): Promise<TeamReleaseAuditGate> {
  const latest = await latestJsonReport(root, ".praxisbase/reports/skill-synthesis");
  const blockers: string[] = [];
  const warnings: string[] = [];
  const evidence = latest ? [latest.path, ...stringArray(latest.value.outputs)] : [];
  if (!latest) {
    blockers.push("team_skill_synthesis_report_missing");
  } else {
    if (latest.value.authority_mode !== "team-git") blockers.push("team_skill_synthesis_not_team_git");
    if (latest.value.mode !== "review") blockers.push("team_skill_synthesis_not_review_mode");
    if (numberValue(latest.value.candidates) === 0) blockers.push("team_skill_candidate_missing");
    if (numberValue(latest.value.needs_human) === 0) blockers.push("team_skill_human_review_gate_missing");
    if (numberValue(latest.value.promoted) > 0) blockers.push("team_skill_auto_promoted");
    warnings.push(...stringArray(latest.value.warnings));
  }
  return gate(
    blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    evidence,
    blockers.length === 0 ? [] : ["praxisbase skill synthesize --mode team-git --review --json"],
  );
}

async function buildGovernanceGate(root: string): Promise<TeamReleaseAuditGate> {
  const paths = [
    "dist/progressive-index/layer-a-catalog.json",
    "dist/progressive-index/layer-b-known-fixes.json",
    "dist/progressive-index/layer-c-objects.json",
  ];
  const blockers: string[] = [];
  const evidence: string[] = [];
  for (const path of paths) {
    try {
      await stat(join(root, path));
      evidence.push(path);
    } catch {
      blockers.push(`progressive_index_missing:${path}`);
    }
  }

  let referencedObjects = 0;
  try {
    const layerC = JSON.parse(await readFile(join(root, "dist/progressive-index/layer-c-objects.json"), "utf8")) as unknown;
    const objects = isRecord(layerC) && Array.isArray(layerC.objects) ? layerC.objects : [];
    referencedObjects = objects.filter((item) => isRecord(item) && numberValue(item.reference_count) > 0).length;
  } catch {
    // Missing layer C is reported above.
  }
  if (referencedObjects === 0) blockers.push("governance_reference_count_missing");

  return gate(
    blockers.length === 0 ? "pass" : "fail",
    blockers,
    [],
    evidence,
    blockers.length === 0 ? [] : ["praxisbase build"],
  );
}

function nonEmptyStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function hasWriteCommand(text: string): boolean {
  return /\bkubectl\s+(?:delete|apply|patch|replace|scale|rollout|cordon|drain|taint|label|annotate)\b/i.test(text);
}

async function detectK8sDomainState(root: string): Promise<K8sDomainState> {
  const evidence = new Set<string>();

  for (const path of await listFiles(root, "kb")) {
    if (!path.endsWith(".md")) continue;
    try {
      const parsed = matter(await readFile(join(root, path), "utf8"));
      const signatures = stringArray(parsed.data.signatures);
      if (signatures.some((signature) => signature.startsWith("k8s:"))) evidence.add(path);
    } catch {
      continue;
    }
  }

  for (const path of await listFiles(root, "skills/k8s")) {
    if (path.endsWith("/SKILL.md")) evidence.add(path);
  }

  const manifestPath = "dist/repair-bundles/k8s-incident/manifest.json";
  try {
    const manifest = K8sIncidentManifestSchema.parse(JSON.parse(await readFile(join(root, manifestPath), "utf8")));
    if (manifest.entries.length > 0) evidence.add(manifestPath);
  } catch {
    // Missing or invalid manifests are handled by the bundle gate once K8s is enabled.
  }

  return {
    enabled: evidence.size > 0,
    evidence_reports: Array.from(evidence).sort(),
  };
}

function k8sDomainNotEnabledGate(): TeamReleaseAuditGate {
  return gate(
    "not_run",
    [],
    ["k8s_domain_not_enabled"],
    [],
    ["praxisbase init --profile k8s", "praxisbase build"],
  );
}

async function buildK8sBundleGate(root: string, k8sDomain: K8sDomainState): Promise<TeamReleaseAuditGate> {
  if (!k8sDomain.enabled) return k8sDomainNotEnabledGate();

  const blockers: string[] = [];
  const warnings: string[] = [];
  const evidence: string[] = [];
  const manifestPath = "dist/repair-bundles/k8s-incident/manifest.json";

  let manifest;
  try {
    manifest = K8sIncidentManifestSchema.parse(JSON.parse(await readFile(join(root, manifestPath), "utf8")));
    evidence.push(manifestPath);
  } catch {
    blockers.push("k8s_incident_manifest_missing_or_invalid");
    return gate("fail", blockers, warnings, evidence, ["praxisbase build"]);
  }

  if (manifest.entries.length < 5) blockers.push("k8s_seed_pack_too_small");

  const seenSignatures = new Set<string>();
  for (const entry of manifest.entries) {
    if (seenSignatures.has(entry.signature)) blockers.push(`k8s_duplicate_signature:${entry.signature}`);
    seenSignatures.add(entry.signature);

    const relativePath = `dist/repair-bundles/${entry.path}`;
    let raw = "";
    let bundle: Record<string, unknown> | undefined;
    try {
      raw = await readFile(join(root, relativePath), "utf8");
      evidence.push(relativePath);
      if (sha256(raw) !== entry.checksum) blockers.push(`k8s_entry_checksum_mismatch:${entry.signature}`);
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed)) bundle = parsed;
      else blockers.push(`k8s_entry_invalid:${entry.signature}`);
    } catch {
      blockers.push(`k8s_entry_missing:${entry.signature}`);
      continue;
    }

    if (!bundle) continue;
    if (bundle.signature !== entry.signature) blockers.push(`k8s_entry_signature_mismatch:${entry.signature}`);
    if (bundle.domain !== "k8s") blockers.push(`k8s_entry_domain_missing:${entry.signature}`);
    if (bundle.recommendation_only !== true) blockers.push(`k8s_entry_not_recommendation_only:${entry.signature}`);
    if (nonEmptyStringArray(bundle.forbidden_operations).length === 0) blockers.push(`k8s_entry_forbidden_operations_missing:${entry.signature}`);
    if (nonEmptyStringArray(bundle.verification_steps).length === 0) blockers.push(`k8s_entry_verification_steps_missing:${entry.signature}`);
    if (nonEmptyStringArray(bundle.source_refs).length === 0) blockers.push(`k8s_entry_source_refs_missing:${entry.signature}`);
    if (containsPrivateMaterial(raw)) blockers.push(`k8s_entry_contains_private_material:${entry.signature}`);
    if (hasWriteCommand(raw)) blockers.push(`k8s_entry_contains_write_command:${entry.signature}`);

    const fixes = Array.isArray(bundle.known_fixes) ? bundle.known_fixes : [];
    if (fixes.length === 0) blockers.push(`k8s_entry_known_fixes_missing:${entry.signature}`);
    for (const fix of fixes) {
      if (!isRecord(fix)) {
        blockers.push(`k8s_entry_known_fix_invalid:${entry.signature}`);
        continue;
      }
      if (nonEmptyStringArray(fix.forbidden_operations).length === 0) blockers.push(`k8s_known_fix_forbidden_operations_missing:${entry.signature}`);
      if (nonEmptyStringArray(fix.verification_steps).length === 0) blockers.push(`k8s_known_fix_verification_steps_missing:${entry.signature}`);
      if (nonEmptyStringArray(fix.source_refs).length === 0) blockers.push(`k8s_known_fix_source_refs_missing:${entry.signature}`);
    }
  }

  return gate(
    blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    evidence,
    blockers.length === 0 ? [] : ["praxisbase init --profile k8s", "praxisbase build"],
  );
}

async function buildIncidentEpisodeIntakeGate(root: string, k8sDomain: K8sDomainState): Promise<TeamReleaseAuditGate> {
  if (!k8sDomain.enabled) return k8sDomainNotEnabledGate();

  const episodeFiles = [
    ...(await collectJsonFiles(root, protocolPaths.inboxEpisodes)),
    ...(await collectJsonFiles(root, protocolPaths.outboxEpisodes)),
  ];
  const proposalFiles = [
    ...(await collectJsonFiles(root, protocolPaths.inboxProposals)),
    ...(await collectJsonFiles(root, protocolPaths.outboxProposals)),
  ];
  const reviewFiles = await collectJsonFiles(root, protocolPaths.inboxReviews);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const evidence: string[] = [];

  const incidentEpisodes = [];
  for (const path of episodeFiles) {
    try {
      const parsed = AnyEpisodeSchema.safeParse(JSON.parse(await readFile(join(root, path), "utf8")));
      if (!parsed.success || parsed.data.type !== "incident_episode") continue;
      const episode = parsed.data;
      if (episode.scope === "team" && episode.problem_signature.startsWith("k8s:") && episode.source_refs.length > 0) {
        incidentEpisodes.push(episode);
        evidence.push(path);
      }
    } catch {
      continue;
    }
  }

  const k8sProposals = [];
  for (const path of proposalFiles) {
    try {
      const parsed = ProposalSchema.safeParse(JSON.parse(await readFile(join(root, path), "utf8")));
      if (!parsed.success) continue;
      const proposal = parsed.data;
      if (
        proposal.scope === "team"
        && (proposal.patch.path.startsWith("kb/known-fixes/k8s-") || proposal.patch.path.startsWith("skills/k8s/"))
      ) {
        k8sProposals.push(proposal);
        evidence.push(path);
      }
    } catch {
      continue;
    }
  }

  const proposalIds = new Set(k8sProposals.map((proposal) => proposal.id));
  const k8sReviews = [];
  for (const path of reviewFiles) {
    try {
      const parsed = ReviewSchema.safeParse(JSON.parse(await readFile(join(root, path), "utf8")));
      if (parsed.success && proposalIds.has(parsed.data.proposal_id)) {
        k8sReviews.push(parsed.data);
        evidence.push(path);
      }
    } catch {
      continue;
    }
  }

  if (incidentEpisodes.length === 0) blockers.push("k8s_incident_episode_missing");
  if (k8sProposals.length === 0) blockers.push("k8s_incident_proposal_missing");
  if (k8sProposals.length > 0 && k8sReviews.length === 0) blockers.push("k8s_incident_review_missing");
  return gate(
    blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    evidence,
    blockers.length === 0 ? [] : ["praxisbase episode sync-outbox", "praxisbase review --auto"],
  );
}

async function buildK8sBoundaryGate(root: string, k8sDomain: K8sDomainState): Promise<TeamReleaseAuditGate> {
  if (!k8sDomain.enabled) return k8sDomainNotEnabledGate();

  const blockers: string[] = [];
  const warnings: string[] = [];
  const evidence: string[] = [];

  for (const path of await listFiles(root, "kb")) {
    if (!path.endsWith(".md")) continue;
    let raw = "";
    let parsed;
    try {
      raw = await readFile(join(root, path), "utf8");
      parsed = matter(raw);
    } catch {
      continue;
    }
    const signatures = stringArray(parsed.data.signatures).filter((signature) => signature.startsWith("k8s:"));
    if (signatures.length === 0) continue;
    evidence.push(path);
    if (parsed.data.scope !== "team") blockers.push(`k8s_stable_not_team_scope:${path}`);
    if (containsPrivateMaterial(raw)) blockers.push(`k8s_stable_contains_private_material:${path}`);
    if (hasWriteCommand(raw)) blockers.push(`k8s_stable_contains_write_command:${path}`);
  }

  for (const path of await listFiles(root, "skills/k8s")) {
    if (!path.endsWith("/SKILL.md")) continue;
    const raw = await readFile(join(root, path), "utf8").catch(() => "");
    evidence.push(path);
    if (containsPrivateMaterial(raw)) blockers.push(`k8s_skill_contains_private_material:${path}`);
    if (hasWriteCommand(raw)) blockers.push(`k8s_skill_contains_write_command:${path}`);
  }

  const proposals = await collectJsonFiles(root, protocolPaths.inboxProposals);
  const reviews = await collectJsonFiles(root, protocolPaths.inboxReviews);
  const reviewsByProposal = new Map<string, { decision: string; risk: string }>();
  for (const path of reviews) {
    try {
      const parsed = ReviewSchema.safeParse(JSON.parse(await readFile(join(root, path), "utf8")));
      if (parsed.success) reviewsByProposal.set(parsed.data.proposal_id, parsed.data);
    } catch {
      continue;
    }
  }
  for (const path of proposals) {
    try {
      const parsed = ProposalSchema.safeParse(JSON.parse(await readFile(join(root, path), "utf8")));
      if (!parsed.success) continue;
      const proposal = parsed.data;
      if (proposal.scope !== "team" || proposal.target_type !== "skill" || !proposal.patch.path.startsWith("skills/k8s/")) continue;
      evidence.push(path);
      const review = reviewsByProposal.get(proposal.id);
      if (!review) warnings.push(`k8s_skill_proposal_waiting_for_review:${proposal.id}`);
      else if (review.decision !== "needs_human" || review.risk !== "high") blockers.push(`k8s_skill_proposal_not_human_required:${proposal.id}`);
    } catch {
      continue;
    }
  }

  if (evidence.length === 0) blockers.push("k8s_boundary_evidence_missing");

  return gate(
    blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    evidence,
    blockers.length === 0 ? [] : ["praxisbase review --auto"],
  );
}

function containsPrivateMaterial(text: string): boolean {
  return /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i.test(text)
    || /\b(api[_-]?key|token|password|secret)\s*[:=]\s*\S{6,}/i.test(text)
    || /\b(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[0-1])|192\.168)\.\d{1,3}\.\d{1,3}\b/.test(text)
    || /\broot@[A-Za-z0-9._-]+\b/.test(text);
}

async function buildPrivacyBoundaryGate(root: string): Promise<TeamReleaseAuditGate> {
  const blockers: string[] = [];
  const evidence: string[] = [];
  for (const path of [
    ...(await collectJsonFiles(root, protocolPaths.inboxEpisodes)),
    ...(await collectJsonFiles(root, protocolPaths.outboxEpisodes)),
    ...(await collectJsonFiles(root, protocolPaths.inboxProposals)),
    ...(await collectJsonFiles(root, protocolPaths.outboxProposals)),
  ]) {
    try {
      const raw = await readFile(join(root, path), "utf8");
      const value = JSON.parse(raw) as unknown;
      const scope = isRecord(value) && typeof value.scope === "string" ? value.scope : undefined;
      if (scope === "team" || scope === "org" || scope === "global") {
        if (containsPrivateMaterial(raw)) blockers.push(`team_channel_contains_private_material:${path}`);
        evidence.push(path);
      }
    } catch {
      continue;
    }
  }

  const files = [
    ...(await listFiles(root, "kb")).filter((path) => path.endsWith(".md")),
    ...(await listFiles(root, "skills")).filter((path) => path.endsWith("/SKILL.md")),
  ];
  for (const path of files) {
    let parsed;
    let raw;
    try {
      raw = await readFile(join(root, path), "utf8");
      parsed = matter(raw);
    } catch {
      continue;
    }
    const scope = typeof parsed.data.scope === "string" ? parsed.data.scope : undefined;
    if ((scope === "team" || scope === "org" || scope === "global") && containsPrivateMaterial(raw)) {
      blockers.push(`team_stable_contains_private_material:${path}`);
    }
    evidence.push(path);
  }
  return gate(
    blockers.length === 0 ? "pass" : "fail",
    blockers,
    [],
    evidence,
    blockers.length === 0 ? [] : ["praxisbase privacy triage --mode team-git --json"],
  );
}

const requiredTeamGateKeys = [
  "team_repair_loop_ga",
  "skill_self_evolution_ga",
  "governance_ga",
  "privacy_boundary_ga",
] as const satisfies readonly (keyof TeamReleaseAuditReport["gates"])[];

const optionalK8sGateKeys = [
  "k8s_bundle_ga",
  "incident_episode_intake_ga",
  "k8s_boundary_ga",
] as const satisfies readonly (keyof TeamReleaseAuditReport["gates"])[];

function aggregateTeamGaStatus(gates: TeamReleaseAuditReport["gates"]): TeamReleaseGateStatus {
  const requiredStatuses = requiredTeamGateKeys.map((key) => gates[key].status);
  const optionalK8sStatuses = optionalK8sGateKeys.map((key) => gates[key].status);
  if (requiredStatuses.some((status) => status === "fail" || status === "not_run")) return "fail";
  if (optionalK8sStatuses.some((status) => status === "fail")) return "fail";
  if (
    requiredStatuses.every((status) => status === "pass")
    && optionalK8sStatuses.every((status) => status === "pass" || status === "not_run")
  ) return "pass";
  return "warning";
}

export async function readTeamReleaseAuditReport(
  root: string,
  options: { now?: string } = {},
): Promise<TeamReleaseAuditReport> {
  const teamRepairLoop = await buildTeamRepairLoopGate(root);
  const skillSelfEvolution = await buildSkillSelfEvolutionGate(root);
  const governance = await buildGovernanceGate(root);
  const privacy = await buildPrivacyBoundaryGate(root);
  const k8sDomain = await detectK8sDomainState(root);
  const k8sBundle = await buildK8sBundleGate(root, k8sDomain);
  const incidentEpisodeIntake = await buildIncidentEpisodeIntakeGate(root, k8sDomain);
  const k8sBoundary = await buildK8sBoundaryGate(root, k8sDomain);
  const gates = {
    team_repair_loop_ga: teamRepairLoop,
    skill_self_evolution_ga: skillSelfEvolution,
    governance_ga: governance,
    privacy_boundary_ga: privacy,
    k8s_bundle_ga: k8sBundle,
    incident_episode_intake_ga: incidentEpisodeIntake,
    k8s_boundary_ga: k8sBoundary,
  };
  const teamGa = aggregateTeamGaStatus(gates);
  const blockingReasons = Array.from(new Set(Object.values(gates).flatMap((item) => item.blockers))).sort();
  const warnings = Array.from(new Set(Object.values(gates).flatMap((item) => item.warnings))).sort();
  const evidenceReports = Array.from(new Set(Object.values(gates).flatMap((item) => item.evidence_reports))).sort();
  const nextCommands = Array.from(new Set(Object.values(gates).flatMap((item) => item.next_commands)));

  return TeamReleaseAuditReportSchema.parse({
    type: "team_release_audit_report",
    ok: teamGa === "pass",
    team_ga: teamGa,
    team_repair_loop_ga: teamRepairLoop.status,
    skill_self_evolution_ga: skillSelfEvolution.status,
    governance_ga: governance.status,
    privacy_boundary_ga: privacy.status,
    k8s_bundle_ga: k8sBundle.status,
    incident_episode_intake_ga: incidentEpisodeIntake.status,
    k8s_boundary_ga: k8sBoundary.status,
    gates,
    blocking_reasons: blockingReasons,
    warnings,
    evidence_reports: evidenceReports,
    next_commands: nextCommands,
    generated_at: options.now ?? new Date().toISOString(),
  }) as TeamReleaseAuditReport;
}
