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

function hasPrivateChatHint(text: string): boolean {
  return /\b(?:private chat|direct message|dm|私聊|私人对话)\b/i.test(text);
}

export function evaluateExperiencePrivacy(input: EvaluateExperiencePrivacyInput): ExperiencePrivacyResult {
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

  if (reasons.includes("private_material_detected")) {
    return { verdict: "human_required", reasons };
  }
  if (reasons.length > 0) {
    return { verdict: "reject", reasons };
  }
  return { verdict: "allow", reasons };
}
