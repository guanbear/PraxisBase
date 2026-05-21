import { containsPrivateMaterial } from "../wiki/lint.js";
import type { ExperiencePrivacyVerdict, ExperienceScopeHint } from "../protocol/schemas.js";

export interface EvaluateExperiencePrivacyInput {
  mode: "personal-local" | "team-git";
  scopeHint: ExperienceScopeHint;
  text: string;
  channel?: string;
}

export interface ExperiencePrivacyResult {
  verdict: ExperiencePrivacyVerdict;
  reasons: string[];
}

export type PreAiPrivacyVerdict = "allow_for_ai" | "local_only" | "human_required" | "reject";

export interface PreAiPrivacyResult {
  verdict: PreAiPrivacyVerdict;
  reasons: string[];
}

function hasPrivateChatHint(text: string): boolean {
  return /\b(?:private chat|direct message|dm|私聊|私人对话)\b/i.test(text);
}

function collectPrivacyReasons(input: EvaluateExperiencePrivacyInput): string[] {
  const reasons: string[] = [];

  if (containsPrivateMaterial(input.text)) {
    reasons.push("private_material_detected");
  }

  if (input.mode === "team-git") {
    if (input.scopeHint === "personal") {
      reasons.push("team_rejects_personal_scope");
    }
    if (hasPrivateChatHint(input.text)) {
      reasons.push("team_rejects_private_chat");
    }
  }

  return reasons;
}

export function evaluateTeamGate(input: EvaluateExperiencePrivacyInput): ExperiencePrivacyResult {
  const reasons: string[] = [];

  if (input.mode === "team-git") {
    if (input.scopeHint === "personal") {
      reasons.push("team_rejects_personal_scope");
    }
    if (hasPrivateChatHint(input.text)) {
      reasons.push("team_rejects_private_chat");
    }
  }

  if (reasons.length > 0) {
    return { verdict: "reject", reasons };
  }
  return { verdict: "allow", reasons };
}

export function evaluatePreAiPrivacy(input: EvaluateExperiencePrivacyInput): PreAiPrivacyResult {
  const teamGate = evaluateTeamGate(input);
  if (teamGate.verdict !== "allow") {
    return { verdict: "reject", reasons: teamGate.reasons };
  }

  if (containsPrivateMaterial(input.text)) {
    return { verdict: "human_required", reasons: ["private_material_detected"] };
  }

  return { verdict: "allow_for_ai", reasons: [] };
}

export function evaluatePostAiPrivacy(input: EvaluateExperiencePrivacyInput): ExperiencePrivacyResult {
  if (containsPrivateMaterial(input.text)) {
    return { verdict: "human_required", reasons: ["private_material_detected"] };
  }
  return evaluateTeamGate(input);
}

export function evaluateExperiencePrivacy(input: EvaluateExperiencePrivacyInput): ExperiencePrivacyResult {
  const reasons = collectPrivacyReasons(input);

  if (reasons.includes("private_material_detected")) {
    return { verdict: "human_required", reasons };
  }
  if (reasons.length > 0) {
    return { verdict: "reject", reasons };
  }
  return { verdict: "allow", reasons };
}
