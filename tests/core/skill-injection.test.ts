import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SKILL_INJECTION_BUDGET_BYTES,
  extractSkillMentions,
  matchPromotedSkills,
  renderSkillInjectionBundle,
} from "@praxisbase/core/agent-access/skill-injection.js";

const authSkill = {
  id: "openclaw-auth-repair",
  title: "OpenClaw Auth Repair",
  origin: "praxisbase_synthesized",
  scope: "personal",
  status: "promoted",
  body: "Refresh login, restart OpenClaw, then run smoke verification.",
  when_to_use: "Use when OpenClaw login expires or auth token refresh fails.",
  tags: ["openclaw", "auth"],
  related_wiki_paths: ["kb/known-fixes/openclaw-auth.md"],
  promotion_id: "promotion-auth",
  audit_id: "audit-auth",
} as const;

const logsSkill = {
  id: "logs-triage",
  title: "Logs Triage",
  origin: "praxisbase_synthesized",
  scope: "team",
  status: "promoted",
  body: "Check logs, isolate service, verify fix.",
  when_to_use: "Use for production log triage.",
  tags: ["logs", "triage"],
} as const;

describe("skill injection matching", () => {
  it("extracts explicit @skill mentions in user order", () => {
    assert.deepEqual(extractSkillMentions("Use @skill/openclaw-auth-repair then @skill-logs-triage."), [
      "openclaw-auth-repair",
      "logs-triage",
    ]);
  });

  it("orders explicit matches before deterministic automatic matches", () => {
    const result = matchPromotedSkills({
      query: "Please use @skill/logs-triage while fixing OpenClaw auth expiration.",
      skills: [authSkill, logsSkill],
    });

    assert.deepEqual(result.matches.map((match) => match.skill.id), ["logs-triage", "openclaw-auth-repair"]);
    assert.equal(result.decisions.find((decision) => decision.skill_id === "logs-triage")?.decision, "matched");
    assert.match(result.decisions.find((decision) => decision.skill_id === "logs-triage")?.reason ?? "", /explicit/);
  });

  it("excludes candidate and externally installed skills by default", () => {
    const result = matchPromotedSkills({
      query: "auth",
      skills: [
        { ...authSkill, id: "candidate-auth", status: "candidate" },
        { ...authSkill, id: "external-auth", origin: "external_installed" },
      ],
    });

    assert.equal(result.matches.length, 0);
    assert.equal(result.decisions.every((decision) => decision.decision === "skipped"), true);
  });

  it("renders bounded PB skill blocks with UTF-8 safe truncation", () => {
    const result = renderSkillInjectionBundle({
      query: "openclaw auth",
      skills: [{ ...authSkill, body: "经验".repeat(100) }],
      budgetBytes: 240,
    });

    assert.match(result.text, /\[PB-SKILL:openclaw-auth-repair\]/);
    assert.match(result.text, /truncated by praxisbase_skill_injection/);
    assert.equal(result.text.includes("�"), false);
    assert.equal(result.decisions[0].truncated, true);
  });

  it("keeps total rendered bytes within budget and marks later matches as skipped", () => {
    const result = renderSkillInjectionBundle({
      query: "openclaw auth logs triage",
      skills: [
        { ...authSkill, body: "auth ".repeat(100) },
        { ...logsSkill, body: "logs ".repeat(100) },
      ],
      budgetBytes: 120,
    });

    assert.equal(result.total_bytes <= result.budget_bytes, true);
    assert.equal(result.decisions.filter((decision) => decision.decision === "matched").length, 1);
    assert.match(result.decisions.find((decision) => decision.skill_id === "logs-triage")?.reason ?? "", /budget exhausted|matched/);
  });

  it("orders automatic matches by score descending and skill id as tie breaker", () => {
    const result = matchPromotedSkills({
      query: "openclaw auth",
      skills: [
        { ...logsSkill, id: "z-logs", tags: ["openclaw"] },
        { ...authSkill, id: "a-auth", tags: ["openclaw", "auth"] },
      ],
    });

    assert.deepEqual(result.matches.map((match) => match.skill.id), ["a-auth", "z-logs"]);
  });

  it("uses the documented default 8 KiB skill budget", () => {
    assert.equal(DEFAULT_SKILL_INJECTION_BUDGET_BYTES, 8 * 1024);
  });
});
