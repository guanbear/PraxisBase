export interface AgentUseInput {
  title: string;
  whenToUse?: string;
  actions: string[];
  verification: string[];
}

function sectionBody(markdown: string, heading: string): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const captured: string[] = [];
  let capturing = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (capturing) break;
      capturing = new RegExp(`^##\\s+${heading}\\b`, "i").test(line);
      continue;
    }
    if (capturing) captured.push(line);
  }
  const body = captured.join("\n").trim();
  return body.length > 0 ? body : undefined;
}

export function hasAgentUseGuidance(markdown: string): boolean {
  const section = sectionBody(markdown, "Agent Use");
  if (!section) return false;
  const hasTrigger = /use this page when:/i.test(section);
  const hasAction = /apply it by:/i.test(section);
  const hasVerify = /verify by:/i.test(section);
  const bulletCount = (section.match(/^[-*]\s+\S/gm) ?? []).length;
  return hasTrigger && hasAction && hasVerify && bulletCount >= 3;
}

function sentence(value: string): string {
  const trimmed = value.trim().replace(/[.。]\s*$/, "");
  return trimmed.length > 0 ? trimmed : "the current task matches this page's symptoms and scope";
}

function listOrDefault(values: string[], fallback: string): string[] {
  const kept = values.map((value) => value.trim()).filter(Boolean).slice(0, 3);
  return kept.length > 0 ? kept : [fallback];
}

export function renderAgentUseSection(input: AgentUseInput): string {
  const trigger = sentence(input.whenToUse ?? input.title);
  const actions = listOrDefault(
    input.actions,
    "Match the current symptom to this page, then apply the documented procedure or fix.",
  );
  const verification = listOrDefault(
    input.verification,
    "Confirm the original symptom no longer reproduces and record the verification result.",
  );
  return [
    "## Agent Use",
    "Use this page when:",
    `- ${trigger}.`,
    "",
    "Apply it by:",
    ...actions.map((action) => `- ${action}`),
    "",
    "Verify by:",
    ...verification.map((item) => `- ${item}`),
    "",
    "Do not use it when:",
    "- The current evidence does not match the symptoms, scope, or provenance on this page.",
  ].join("\n");
}

export function replaceOrInsertAgentUseSection(markdown: string, section: string): string {
  const lines = markdown.trimEnd().split(/\r?\n/);
  const output: string[] = [];
  let replaced = false;
  let skipping = false;

  for (const line of lines) {
    if (/^##\s+Agent Use\b/i.test(line)) {
      if (!replaced) {
        if (output.length > 0 && output[output.length - 1] !== "") output.push("");
        output.push(section);
        replaced = true;
      }
      skipping = true;
      continue;
    }
    if (skipping && /^##\s+/.test(line)) {
      skipping = false;
      if (output.length > 0 && output[output.length - 1] !== "") output.push("");
      output.push(line);
      continue;
    }
    if (skipping) continue;
    output.push(line);
  }

  if (!replaced) {
    const provenanceIndex = output.findIndex((line) => /^##\s+(Provenance|Sources)\b/i.test(line));
    if (provenanceIndex >= 0) {
      const before = output.slice(0, provenanceIndex);
      const after = output.slice(provenanceIndex);
      if (before.length > 0 && before[before.length - 1] !== "") before.push("");
      return `${[...before, section, "", ...after].join("\n").trimEnd()}\n`;
    }
    if (output.length > 0 && output[output.length - 1] !== "") output.push("");
    output.push(section);
  }

  return `${output.join("\n").trimEnd()}\n`;
}
