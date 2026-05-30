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
  cue_family?: ExperienceLesson["cue_family"];
};

type GenericCueFamily = {
  id: string;
  matches: (excerpt: string) => boolean;
  cue_family: ExperienceLesson["cue_family"];
  problem: string;
  trigger: string;
  actionPrefix: string;
  verification?: string;
  negative_case?: string;
  portability: ExperienceLesson["portability"];
  confidence: number;
};

const GENERIC_CUE_FAMILIES: GenericCueFamily[] = [
  {
    id: "explicit_veto",
    matches: (excerpt) => /^(never|do not|don't|avoid)\b|without explicit approval|^(禁止|不要|不能)/i.test(excerpt),
    cue_family: "explicit_user",
    problem: "Explicit user vetoes can be lost when agents treat them as ordinary transcript text.",
    trigger: "When a future action intersects a recorded veto or approval boundary.",
    actionPrefix: "Avoid the forbidden action",
    verification: "Confirm the requested action does not violate the recorded veto or has explicit approval.",
    negative_case: "Do not bypass explicit user vetoes from memory or session evidence.",
    portability: "agent_family",
    confidence: 0.92,
  },
  {
    id: "explicit_preference",
    matches: (excerpt) => /(?:^|\b)(user preference|preference)\s*:|用户偏好|我偏好|\bI prefer\b/i.test(excerpt),
    cue_family: "explicit_user",
    problem: "Explicit user preferences can be buried in raw memory or session records.",
    trigger: "When future work matches the recorded preference.",
    actionPrefix: "Follow the explicit preference",
    verification: "Check the response or command path follows the recorded preference.",
    portability: "agent_family",
    confidence: 0.9,
  },
  {
    id: "recorded_decision",
    matches: (excerpt) => /^(decision|decided)\s*:|^决策[:：]/i.test(excerpt),
    cue_family: "reflection",
    problem: "Recorded decisions lose value if agents rediscover or contradict them later.",
    trigger: "When planning work in the same decision area.",
    actionPrefix: "Use the recorded decision as the default",
    verification: "Confirm the plan is consistent with the recorded decision or explicitly supersedes it.",
    negative_case: "Do not reopen settled decisions without new evidence.",
    portability: "project",
    confidence: 0.86,
  },
  {
    id: "unresolved_task",
    matches: (excerpt) => /^(todo|unresolved|open task|follow.?up)\b|^(待办|未解决)[:：]/i.test(excerpt),
    cue_family: "reflection",
    problem: "Unresolved work can disappear after the originating session ends.",
    trigger: "When resuming related work or planning the next iteration.",
    actionPrefix: "Track and revisit the unresolved task",
    verification: "Confirm whether the task is now completed, obsolete, or still pending.",
    negative_case: "Do not treat unresolved tasks as completed lessons.",
    portability: "project",
    confidence: 0.78,
  },
  {
    id: "reflection_lesson",
    matches: (excerpt) => /^(reflection|lesson learned|retrospective)\s*:|^(反思|教训|总结)[:：]/i.test(excerpt),
    cue_family: "reflection",
    problem: "Reflections are useful only after they are converted into reusable future guidance.",
    trigger: "When the same context, failure, or workflow appears again.",
    actionPrefix: "Apply the reflected lesson",
    verification: "Check the new work avoids the reflected failure mode.",
    portability: "agent_family",
    confidence: 0.84,
  },
  {
    id: "repeated_failure",
    matches: (excerpt) => /\brepeated failure\b|failed repeatedly|repeatedly failed|反复失败/i.test(excerpt),
    cue_family: "repeated_failure",
    problem: "Repeated failures indicate a reusable failure signature rather than a one-off event.",
    trigger: "When the same failure signature appears again.",
    actionPrefix: "Start from the recovered failure path",
    verification: "Verify both the fix and the absence of the repeated failure signature.",
    negative_case: "Do not keep retrying the same failing path without changing diagnosis.",
    portability: "agent_family",
    confidence: 0.88,
  },
  {
    id: "tool_sequence",
    matches: (excerpt) => /\btool sequence\b|^sequence\s*:|^steps\s*:|first .+\bthen\b/i.test(excerpt),
    cue_family: "tool_sequence",
    problem: "Useful tool ordering can be lost if agents remember only the final outcome.",
    trigger: "When the same workflow needs to be repeated or debugged.",
    actionPrefix: "Follow the recorded tool sequence",
    verification: "Confirm each step completes before moving to the next recorded step.",
    negative_case: "Do not skip ordering-sensitive tool steps.",
    portability: "agent_family",
    confidence: 0.86,
  },
  {
    id: "verified_fix",
    matches: (excerpt) => /\bverified fix\b|fixed .+\b(verified|passed)\b|verification passed/i.test(excerpt),
    cue_family: "verified_fix",
    problem: "Verified fixes should become reusable repair guidance instead of remaining session anecdotes.",
    trigger: "When the same failure or repair context appears again.",
    actionPrefix: "Reuse the verified fix path",
    verification: "Run the same or equivalent verification before claiming completion.",
    negative_case: "Do not reuse a fix without repeating the relevant verification.",
    portability: "agent_family",
    confidence: 0.9,
  },
];

const PATTERN_FAMILIES: PatternFamily[] = [
  {
    id: "ack_before_slow_work",
    matches: (excerpt) =>
      (/ack|acknowledg/i.test(excerpt) && /slow|tool|network|dispatch|long/i.test(excerpt)) ||
      /(?:工具|联网|派发|委派|分发|超过几秒|耗时|慢).*(?:ack|确认|收到|先发|回复)|(?:ack|确认|收到|先发|回复).*(?:工具|联网|派发|委派|分发|超过几秒|耗时|慢)/i.test(excerpt),
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
    matches: (excerpt) => /fail.closed|must not pretend|do not claim.*success|不能假装.*成功|不要假装.*成功|失败.*不能.*成功|没.*派发.*不能.*成功/i.test(excerpt),
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
    matches: (excerpt) => /main session.*(already|directly).*(did|completed|wrote)|do not say.*dispatch.*failed.*already|主会话.*(已经|直接).*(完成|做了|写了)|已经.*完成.*不能.*派发失败/i.test(excerpt),
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
    matches: (excerpt) => /memory.*truncat|truncat.*memory|MEMORY\.md.*truncat|MEMORY\.md.*(?:12000|截断|失忆)|(?:12000|截断|失忆).*MEMORY\.md/i.test(excerpt),
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
    matches: (excerpt) => /daily.*log.*raw|raw.*record.*MEMORY|long.term.*memory|distill.*MEMORY|每日日志.*原始记录|原始记录.*长期记忆|提炼.*长期记忆|提炼.*MEMORY/i.test(excerpt),
    problem: "Raw daily logs and long-term memory have different roles, and mixing them can bury reusable guidance.",
    trigger: "When maintaining agent memory over time.",
    action: "Distill durable lessons from raw daily logs into concise long-term memory.",
    verification: "Check that long-term memory contains reusable lessons rather than unfiltered daily records.",
    negative_case: "Do not treat raw daily logs as the injected long-term memory surface.",
    applies_to_systems: ["memory", "context-injection", "daily-logs"],
    portability: "agent_family",
    confidence: 0.9,
    cue_family: "reflection",
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
    matches: (excerpt) => /target.*machine|confirm.*target|target.*host|确认.*目标(?:机器|主机|环境)|目标(?:机器|主机|环境).*确认|错(?:机器|主机|环境).*重启/i.test(excerpt),
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
    matches: (excerpt) => /voice.*primary|primary.*delivery.*voice|daily report.*voice|no voice.*not.*complete|语音.*(?:主交付|不算完成|必须|不能缺)|日报.*(?:语音|音频).*不算完成/i.test(excerpt),
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
    matches: (excerpt) => /private route|tailscale|mac mini|macmini|trusted.*route|内网入口|私有(?:线路|入口|路由)|公网 IP|优先用 Tailscale/i.test(excerpt),
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
    matches: (excerpt) => /self.test|test after.*change|verify after.*change|改完.*(?:自测|测试|验证)|修改后.*(?:自测|测试|验证)|(?:自测|测试|验证).*(?:改完|修改后)|不让.*(?:用户|你).*测试员/i.test(excerpt),
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
    matches: (excerpt) => /cache.*bust|bust.*cache|timestamp.*cache|cache.*timestamp|\?v=timestamp|浏览器缓存|强刷|缓存.*(?:强刷|timestamp)|timestamp.*强刷/i.test(excerpt),
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
    matches: (excerpt) => /collate.*nocase|case.insensitive.*collat|nocase|大小写.*坑|大小写.*(?:查询|匹配)|数据库.*大小写/i.test(excerpt),
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
    matches: (excerpt) => /rate.limit|failover|model.*fallback|fallback.*model|限流.*(?:回退|切|fallback|failover|OmniRoute)|(?:回退|fallback|failover|OmniRoute).*限流/i.test(excerpt),
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
    cue_family: "repeated_failure",
  },
  {
    id: "slack_raw_user_id",
    matches: (excerpt) => /slack.*\bU[A-Z0-9]{8,}|raw.*user.*id|Slack.*原始用户 ID|user:U[A-Z0-9]{8,}|原始.*U\.\.\.|原始.*用户.*ID/i.test(excerpt),
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
    if (isWeakSpan(excerpt) || isRawCandidateCorpusNoise(excerpt)) {
      continue;
    }

    let matchedPattern = false;
    for (const family of PATTERN_FAMILIES) {
      if (!family.matches(excerpt)) {
        continue;
      }

      lessons.push(buildPatternLesson(family, span, excerpt, options));
      matchedPattern = true;
    }
    if (matchedPattern) {
      continue;
    }

    const genericFamily = GENERIC_CUE_FAMILIES.find((family) => family.matches(excerpt));
    if (genericFamily) {
      lessons.push(buildGenericLesson(genericFamily, span, excerpt, options));
    }
  }

  return lessons;
}

function isWeakSpan(excerpt: string): boolean {
  if (excerpt.length < 10) {
    const cjkChars = excerpt.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    return cjkChars < 5;
  }
  return WEAK_SPAN_PATTERNS.some((pattern) => pattern.test(excerpt));
}

function isRawCandidateCorpusNoise(excerpt: string): boolean {
  if (!/\bCandidate:/i.test(excerpt)) return false;
  const lower = excerpt.toLowerCase();
  const repeatedCandidateCount = excerpt.match(/\bCandidate:/gi)?.length ?? 0;
  const noisySignals = [
    /confidence:\s*0(?:\.0+)?\b/i.test(excerpt),
    lower.includes("memory/.dreams/session-corpus"),
    lower.includes("conversation info (untrusted metadata)"),
    lower.includes("status: staged"),
    repeatedCandidateCount >= 2,
  ].filter(Boolean).length;
  return noisySignals >= 2;
}

function buildGenericLesson(
  family: GenericCueFamily,
  span: EvidenceSpan,
  excerpt: string,
  options: DeterministicLessonOptions,
): ExperienceLesson {
  const statement = cleanCueStatement(excerpt);
  const systems = inferSystems(excerpt);
  const hash = computeHash(`${family.id}\n${span.source_hash}\n${span.span_id}\n${excerpt}`).slice("sha256:".length, 18);
  return ExperienceLessonSchema.parse({
    lesson_id: `det_${family.id}_${hash}`,
    claim: excerpt,
    safe_claim: `${family.actionPrefix}: ${statement}.`,
    problem: family.problem,
    trigger: family.trigger,
    action: `${family.actionPrefix}: ${statement}.`,
    verification: family.verification,
    negative_case: family.negative_case,
    applies_to_agents: [options.agent || "generic"],
    applies_to_systems: systems.length > 0 ? systems : ["agent-runtime"],
    portability: family.portability,
    privacy_tier: "safe",
    scope: options.scope,
    confidence: family.confidence,
    cue_family: family.cue_family,
    source_refs: [span.source_ref],
    source_hashes: [span.source_hash],
    evidence_spans: [span],
    redaction_notes: [],
    created_at: options.now,
  });
}

function buildPatternLesson(
  family: PatternFamily,
  span: EvidenceSpan,
  excerpt: string,
  options: DeterministicLessonOptions,
): ExperienceLesson {
  const hash = computeHash(`${family.id}\n${span.source_hash}\n${span.span_id}\n${excerpt}`).slice("sha256:".length, 18);
  return ExperienceLessonSchema.parse({
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
    cue_family: family.cue_family ?? (span.source_ref.includes("MEMORY.md") ? "native_memory" : "reflection"),
    source_refs: [span.source_ref],
    source_hashes: [span.source_hash],
    evidence_spans: [span],
    redaction_notes: [],
    created_at: options.now,
  });
}

function buildSafeClaim(family: PatternFamily): string {
  const trigger = family.trigger.replace(/\.$/, "");
  const action = family.action.replace(/\.$/, "");
  return `${trigger}, ${lowercaseFirst(action)}.`;
}

function cleanCueStatement(excerpt: string): string {
  const cleaned = excerpt
    .replace(/^(user preference|preference|decision|decided|todo|unresolved|open task|follow.?up|reflection|lesson learned|retrospective|repeated failure|tool sequence|sequence|steps|verified fix)\s*[:：-]\s*/i, "")
    .replace(/^(用户偏好|决策|待办|未解决|反思|教训|总结)\s*[:：-]\s*/i, "")
    .trim()
    .replace(/\.$/, "");
  return cleaned.length > 0 ? cleaned : excerpt.replace(/\.$/, "");
}

function inferSystems(excerpt: string): string[] {
  const lower = excerpt.toLowerCase();
  const systems = new Set<string>();
  if (lower.includes("openclaw")) systems.add("openclaw");
  if (lower.includes("codex")) systems.add("codex");
  if (lower.includes("opencode")) systems.add("opencode");
  if (lower.includes("claude")) systems.add("claude-code");
  if (lower.includes("gitlab")) systems.add("gitlab");
  if (lower.includes("git ")) systems.add("git");
  if (lower.includes("memory") || lower.includes("memory.md")) systems.add("memory");
  if (lower.includes("ssh") || lower.includes("remote")) systems.add("remote-access");
  if (lower.includes("site") || lower.includes("html")) systems.add("html-site");
  if (lower.includes("test") || lower.includes("verify") || lower.includes("passed")) systems.add("verification");
  return [...systems];
}

function lowercaseFirst(text: string): string {
  if (!text) return text;
  return text[0]!.toLowerCase() + text.slice(1);
}
