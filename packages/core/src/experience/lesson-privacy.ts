import type { ExperienceLesson } from "./lesson-model.js";
import type { EvidenceSpan } from "./lesson-model.js";

type LessonPrivacyMode = "personal-local" | "team-git";

type RedactionRule = {
  pattern: RegExp;
  replacement: string;
  reason: string;
};

const REDACTION_RULES: RedactionRule[] = [
  {
    pattern: /(?:ssh\s+)?[\w.-]+@[\w.-]+\.\w{2,}/g,
    replacement: "[REDACTED_EMAIL]",
    reason: "email-like remote login",
  },
  {
    pattern: /[\w.-]+@[\w.-]+/g,
    replacement: "[REDACTED_USER_HOST]",
    reason: "user@host reference",
  },
  {
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replacement: "[REDACTED_IP]",
    reason: "IPv4 address",
  },
  {
    pattern: /(?<![a-z]:)\/(?:Users|home|etc|var|tmp|root|opt)\/[^\s,;)\]]+/g,
    replacement: "[REDACTED_PATH]",
    reason: "absolute Unix path",
  },
  {
    pattern: /~\/\.ssh\/[^\s,;)\]]+/g,
    replacement: "[REDACTED_KEY_PATH]",
    reason: "SSH key path",
  },
  {
    pattern: /(?:token|password|passwd|api[_-]?key|secret|credential)\s*[:=]\s*\S+/gi,
    replacement: "[REDACTED_CREDENTIAL]",
    reason: "credential assignment",
  },
  {
    pattern: /(?:<U[A-Z0-9]{8,}>|\bU[A-Z0-9]{8,}\b)/g,
    replacement: "[REDACTED_SLACK_UID]",
    reason: "Slack raw user ID",
  },
  {
    pattern: /\b(?:[\w-]+\.)+(?:local|internal|lan|private|corp|home|vpn|tailnet|ts\.net)\b/gi,
    replacement: "[REDACTED_HOSTNAME]",
    reason: "private/internal hostname",
  },
  {
    pattern: /\b(?!ssh\b)[a-z0-9][a-z0-9._-]*(?:-ssh|ssh-|tailscale|vpn|proxy)[a-z0-9._-]*\b/gi,
    replacement: "[REDACTED_REMOTE_COMMAND]",
    reason: "private remote wrapper command",
  },
  {
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb|redis|mariadb):\/\/[^\s,;)\]]+/gi,
    replacement: "[REDACTED_DB_CONNECTION]",
    reason: "database connection string",
  },
];

export function redactLessonText(value: string): { value: string; changed: boolean; reasons: string[] } {
  let nextValue = value;
  let changed = false;
  const reasons: string[] = [];

  const addReason = (reason: string): void => {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  };

  for (const rule of REDACTION_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(nextValue)) {
      rule.pattern.lastIndex = 0;
      nextValue = nextValue.replace(rule.pattern, rule.replacement);
      changed = true;
      addReason(rule.reason);
    }
  }

  return { value: nextValue, changed, reasons };
}

export function redactEvidenceSpansForAi(spans: EvidenceSpan[]): { spans: EvidenceSpan[]; changed: boolean; reasons: string[] } {
  let changed = false;
  const reasons: string[] = [];
  const addReasons = (items: string[]): void => {
    for (const item of items) {
      if (!reasons.includes(item)) reasons.push(item);
    }
  };

  const redactedSpans = spans.map((span) => {
    const excerpt = redactLessonText(span.excerpt);
    if (!excerpt.changed) return span;
    changed = true;
    addReasons(excerpt.reasons);
    return {
      ...span,
      excerpt: excerpt.value,
    };
  });

  return { spans: redactedSpans, changed, reasons };
}

export function abstractLessonPrivacy(
  lesson: ExperienceLesson,
  options: { mode?: LessonPrivacyMode } = {},
): { lesson: ExperienceLesson; changed: boolean; reasons: string[] } {
  const mode = options.mode ?? "personal-local";
  const abstractedLesson: ExperienceLesson = { ...lesson };
  const reasons: string[] = [];
  let changed = false;
  let redactedAnyField = false;

  const addReason = (reason: string): void => {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  };

  const applyField = <K extends keyof ExperienceLesson>(field: K): void => {
    const value = abstractedLesson[field];
    if (typeof value !== "string") return;
    const result = redactLessonText(value);
    if (!result.changed) return;
    (abstractedLesson as Record<string, unknown>)[field as string] = result.value;
    changed = true;
    redactedAnyField = true;
    for (const reason of result.reasons) addReason(reason);
  };

  for (const field of ["claim", "safe_claim", "problem", "trigger", "action", "verification", "negative_case"] as const) {
    applyField(field);
  }

  if (
    mode === "team-git" &&
    changed &&
    abstractedLesson.privacy_tier !== "reject" &&
    abstractedLesson.privacy_tier !== "human_required"
  ) {
    abstractedLesson.privacy_tier = "human_required";
    addReason("team-git mode: private entity evidence requires human review");
  }

  if (
    mode === "personal-local" &&
    changed &&
    abstractedLesson.privacy_tier === "safe"
  ) {
    abstractedLesson.privacy_tier = "personal_only";
    addReason("personal details abstracted, downgraded to personal_only");
  }

  if (redactedAnyField) {
    abstractedLesson.redaction_notes = [
      ...abstractedLesson.redaction_notes,
      ...reasons,
    ];
  }

  return { lesson: abstractedLesson, changed, reasons };
}
