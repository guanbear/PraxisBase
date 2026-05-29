import { type EvidenceSpan, type ExperienceLesson, ExperienceLessonSchema } from "./lesson-model.js";
import { computeHash } from "../protocol/id.js";

export interface DeterministicLessonOptions {
  now: string;
  scope: string;
  agent: string;
}

type PatternFamily = {
  id: string;
  matches: (excerpt: string) => boolean;
  problem: string;
  trigger: string;
  action: string;
  verification?: string;
  negative_case?: string;
  applies_to_systems: string[];
  portability: ExperienceLesson["portability"];
  confidence: number;
};

const PATTERN_FAMILIES: PatternFamily[] = [
  {
    id: "ack_before_slow_work",
    matches: (excerpt) => /ack|acknowledg/i.test(excerpt) && /slow|tool|network|dispatch|long/i.test(excerpt),
    problem: "Slow tool, network, dispatch, or long-running work can leave users without timely feedback.",
    trigger: "Before starting slow work or work involving tools, network calls, or delegation dispatch.",
    action: "Send a short acknowledgement first, then proceed with the slow operation.",
    verification: "Confirm the acknowledgement is emitted before the long-running step begins.",
    negative_case: "Do not stay silent while beginning slow or externally dispatched work.",
    applies_to_systems: ["agent-runtime", "tooling", "network", "dispatch"],
    portability: "universal",
    confidence: 0.9,
  },
  {
    id: "fail_closed_honesty",
    matches: (excerpt) => /fail.closed|must not pretend|do not claim.*success/i.test(excerpt),
    problem: "Agents can mislead users if failures are reported as successful outcomes.",
    trigger: "When an operation, delegation, or guard fails or returns uncertain status.",
    action: "Fail closed and state the failure honestly instead of claiming success.",
    verification: "Check that success is only reported after confirmed successful completion.",
    negative_case: "Do not pretend success when the underlying work failed or was not verified.",
    applies_to_systems: ["agent-runtime", "delegation", "reporting"],
    portability: "agent_family",
    confidence: 0.94,
  },
  {
    id: "hide_internal_tool_failures",
    matches: (excerpt) => /internal.*tool.*fail|do not expose.*tool.*fail|tool.*failure.*should not/i.test(excerpt),
    problem: "Internal tool failures can leak implementation details or confuse users.",
    trigger: "When a tool fails internally while producing a user-facing response.",
    action: "Translate internal tool failures into appropriate user-facing status without exposing internals.",
    negative_case: "Do not expose raw internal tool failure details unless explicitly appropriate.",
    applies_to_systems: ["tooling", "agent-runtime", "user-interface"],
    portability: "agent_family",
    confidence: 0.91,
  },
  {
    id: "main_session_completion_honesty",
    matches: (excerpt) => /main session.*(already|directly).*(did|completed|wrote)|do not say.*dispatch.*failed.*already/i.test(excerpt),
    problem: "Agents can misreport task state when fallback or main-session work already completed the user-visible task.",
    trigger: "When delegation failed but the main session already completed or directly handled the work.",
    action: "Report the completed main-session work accurately instead of saying the task was not dispatched.",
    verification: "Compare the user-visible work done in the main session with the delegation status before replying.",
    negative_case: "Do not claim dispatch failure as the outcome when the requested work was already completed elsewhere.",
    applies_to_systems: ["agent-runtime", "delegation", "reporting"],
    portability: "agent_family",
    confidence: 0.9,
  },
  {
    id: "memory_truncation",
    matches: (excerpt) => /memory.*truncat|truncat.*memory|MEMORY\.md.*truncat/i.test(excerpt),
    problem: "Long memory files can be truncated during context injection and lose important instructions.",
    trigger: "When memory content grows large or depends on MEMORY.md injection.",
    action: "Keep critical memory concise and account for truncation limits during injection.",
    verification: "Check injected context for truncation when memory files approach size limits.",
    applies_to_systems: ["memory", "context-injection"],
    portability: "agent_family",
    confidence: 0.93,
  },
  {
    id: "daily_log_long_term_memory_distinction",
    matches: (excerpt) => /daily.*log.*raw|raw.*record.*MEMORY|long.term.*memory|distill.*MEMORY/i.test(excerpt),
    problem: "Raw daily logs and long-term memory have different roles, and mixing them can bury reusable guidance.",
    trigger: "When maintaining agent memory over time.",
    action: "Distill durable lessons from raw daily logs into concise long-term memory.",
    verification: "Check that long-term memory contains reusable lessons rather than unfiltered daily records.",
    negative_case: "Do not treat raw daily logs as the injected long-term memory surface.",
    applies_to_systems: ["memory", "context-injection", "daily-logs"],
    portability: "agent_family",
    confidence: 0.9,
  },
  {
    id: "openclaw_export_mapping",
    matches: (excerpt) => /openclaw.*dist.*hash|hash.suffixed.*export|export mapping|export.*mapping/i.test(excerpt),
    problem: "Bundled OpenClaw distribution files can hide real export names behind hash-suffixed artifacts or mappings.",
    trigger: "When debugging OpenClaw bundled distribution files or locating runtime functions.",
    action: "Resolve the export mapping before assuming a function name or file path.",
    verification: "Confirm the mapped export resolves to the intended runtime function.",
    negative_case: "Do not assume unmapped bundled export names are stable.",
    applies_to_systems: ["openclaw", "bundling", "debugging"],
    portability: "agent_family",
    confidence: 0.89,
  },
  {
    id: "target_machine_confirmation",
    matches: (excerpt) => /target.*machine|confirm.*target|target.*host/i.test(excerpt),
    problem: "Actions on the wrong target machine or host can cause unsafe operational changes.",
    trigger: "Before restarting, modifying, or operating on a target machine or host.",
    action: "Confirm the target machine or host before taking action.",
    verification: "Verify the selected target matches the intended machine or host.",
    negative_case: "Do not restart or mutate systems before confirming the target.",
    applies_to_systems: ["operations", "infrastructure", "hosts"],
    portability: "agent_family",
    confidence: 0.92,
  },
  {
    id: "voice_primary_delivery",
    matches: (excerpt) => /voice.*primary|primary.*delivery.*voice|daily report.*voice|no voice.*not.*complete/i.test(excerpt),
    problem: "Some workflows define voice output as the primary deliverable, so text-only completion can be incomplete.",
    trigger: "When producing daily reports or deliverables whose channel policy requires voice.",
    action: "Produce the required voice artifact as part of the deliverable.",
    verification: "Confirm the voice artifact exists and is attached or delivered through the expected channel.",
    negative_case: "Do not mark the report complete when the required voice artifact is missing.",
    applies_to_systems: ["delivery", "voice", "reports"],
    portability: "agent_family",
    confidence: 0.9,
  },
  {
    id: "private_route_remote_access",
    matches: (excerpt) => /private route|tailscale|mac mini|macmini|trusted.*route/i.test(excerpt),
    problem: "Remote personal infrastructure access can be unsafe or unreliable when it bypasses the trusted private route.",
    trigger: "Before accessing personal remote machines or services.",
    action: "Use the configured private route or trusted access path instead of an ad hoc public route.",
    verification: "Confirm the connection uses the configured trusted route before operating on the machine.",
    negative_case: "Do not expose private route details in shared team knowledge.",
    applies_to_systems: ["remote-access", "privacy", "infrastructure"],
    portability: "environment",
    confidence: 0.89,
  },
  {
    id: "self_test_after_changes",
    matches: (excerpt) => /self.test|test after.*change|verify after.*change/i.test(excerpt),
    problem: "Changes can introduce regressions when not tested after modification.",
    trigger: "After making code, configuration, or operational changes.",
    action: "Run a self-test or verification after the change.",
    verification: "Use the relevant test or verification command and confirm it passes.",
    negative_case: "Do not claim the change is complete without post-change verification.",
    applies_to_systems: ["testing", "verification", "development"],
    portability: "agent_family",
    confidence: 0.9,
  },
  {
    id: "cache_busting",
    matches: (excerpt) => /cache.*bust|bust.*cache|timestamp.*cache|cache.*timestamp/i.test(excerpt),
    problem: "Stale caches can hide current behavior or serve outdated assets.",
    trigger: "When cache-sensitive content changes or stale results are suspected.",
    action: "Use explicit cache busting such as timestamped cache keys where appropriate.",
    verification: "Confirm the fresh content is fetched rather than a stale cached copy.",
    applies_to_systems: ["cache", "web", "delivery"],
    portability: "agent_family",
    confidence: 0.9,
  },
  {
    id: "case_insensitive_db_collation",
    matches: (excerpt) => /collate.*nocase|case.insensitive.*collat|nocase/i.test(excerpt),
    problem: "Case-sensitive database comparisons can miss logically equivalent values.",
    trigger: "When database lookups or uniqueness checks should ignore case.",
    action: "Use case-insensitive collation such as NOCASE for the relevant comparison or index.",
    verification: "Test lookups with mixed-case values.",
    applies_to_systems: ["database", "sqlite"],
    portability: "agent_family",
    confidence: 0.95,
  },
  {
    id: "rate_limit_model_failover",
    matches: (excerpt) => /rate.limit|failover|model.*fallback|fallback.*model/i.test(excerpt),
    problem: "Rate limits or model failures can interrupt agent work without a fallback path.",
    trigger: "When a model call is rate-limited, unavailable, or otherwise fails.",
    action: "Fail over to an approved fallback model or fallback path.",
    verification: "Confirm fallback behavior preserves correctness and reports degraded status if needed.",
    applies_to_systems: ["llm", "model-routing", "rate-limits"],
    portability: "agent_family",
    confidence: 0.91,
  },
  {
    id: "repeated_failure_partial_recovery",
    matches: (excerpt) => /repeated.*fail|partial.*recovery|recover.*from.*fail/i.test(excerpt),
    problem: "Repeated failures can leave work partially recovered or in an ambiguous state.",
    trigger: "When the same operation fails repeatedly or only partial recovery succeeds.",
    action: "Report the repeated failure, preserve the recovered state, and continue only from verified recovery points.",
    verification: "Confirm which parts recovered and which failures remain unresolved.",
    negative_case: "Do not present partial recovery as full success.",
    applies_to_systems: ["recovery", "operations", "agent-runtime"],
    portability: "agent_family",
    confidence: 0.89,
  },
  {
    id: "slack_raw_user_id",
    matches: (excerpt) => /slack.*\bU[A-Z0-9]{8,}|raw.*user.*id/i.test(excerpt),
    problem: "Some integrations require raw platform user identifiers, but those identifiers can leak private routing details.",
    trigger: "When handling Slack or chat user identifiers in delivery or team-visible notes.",
    action: "Use the required raw user identifier only at the integration boundary and redact it from shared knowledge.",
    verification: "Confirm shared outputs do not expose the raw user identifier.",
    negative_case: "Do not publish raw chat user ids into team wiki, skills, or shared summaries.",
    applies_to_systems: ["slack", "privacy", "delivery"],
    portability: "agent_family",
    confidence: 0.9,
  },
];

const WEAK_SPAN_PATTERNS = [
  /smoke ran (successfully)?/i,
  /^(ok|done|pass|passed|success|completed)\.?$/i,
  /^(no errors?|clean|all good)\.?$/i,
];

export function extractDeterministicLessons(
  spans: EvidenceSpan[],
  options: DeterministicLessonOptions,
): ExperienceLesson[] {
  const lessons: ExperienceLesson[] = [];

  for (const span of spans) {
    const excerpt = span.excerpt.trim();
    if (isWeakSpan(excerpt)) {
      continue;
    }

    for (const family of PATTERN_FAMILIES) {
      if (!family.matches(excerpt)) {
        continue;
      }

      const hash = computeHash(`${family.id}\n${span.source_hash}\n${span.span_id}\n${excerpt}`).slice("sha256:".length, 18);
      const lesson = ExperienceLessonSchema.parse({
        lesson_id: `det_${family.id}_${hash}`,
        claim: excerpt,
        safe_claim: buildSafeClaim(family),
        problem: family.problem,
        trigger: family.trigger,
        action: family.action,
        verification: family.verification,
        negative_case: family.negative_case,
        applies_to_agents: [options.agent || "generic"],
        applies_to_systems: family.applies_to_systems,
        portability: family.portability,
        privacy_tier: "safe",
        scope: options.scope,
        confidence: family.confidence,
        cue_family: span.source_ref.includes("MEMORY.md") ? "native_memory" : "reflection",
        source_refs: [span.source_ref],
        source_hashes: [span.source_hash],
        evidence_spans: [span],
        redaction_notes: [],
        created_at: options.now,
      });
      lessons.push(lesson);
    }
  }

  return lessons;
}

function isWeakSpan(excerpt: string): boolean {
  if (excerpt.length < 10) {
    return true;
  }
  return WEAK_SPAN_PATTERNS.some((pattern) => pattern.test(excerpt));
}

function buildSafeClaim(family: PatternFamily): string {
  const trigger = family.trigger.replace(/\.$/, "");
  const action = family.action.replace(/\.$/, "");
  return `${trigger}, ${lowercaseFirst(action)}.`;
}

function lowercaseFirst(text: string): string {
  if (!text) return text;
  return text[0]!.toLowerCase() + text.slice(1);
}
