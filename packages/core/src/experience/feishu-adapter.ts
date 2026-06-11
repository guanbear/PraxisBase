import { computeHash } from "../protocol/id.js";
import { redactExcerpt } from "../protocol/redact.js";
import type { ExperienceSourceConfig } from "../protocol/schemas.js";
import { fetchFeishuSourcePayload, type FeishuFetchOptions } from "./feishu-client.js";

export interface FeishuRawItem {
  id?: string;
  source_ref?: string;
  summary?: string;
  redacted_summary?: string;
  text?: string;
  raw_log?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface FeishuAdapterResult {
  items: Array<{ item: FeishuRawItem; rawText: string }>;
  rejected: number;
  warnings: string[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

export function redactFeishuIdentifiers(text: string): { value: string; changed: boolean } {
  const value = text
    .replace(/\b(?:ou|on|un|oc)_[A-Za-z0-9_]{8,}\b/g, "[REDACTED_FEISHU_ID]")
    .replace(/\b(?:user_id|open_id|union_id|chat_id)\s*[:=]\s*["']?[^"'\s,;}]{4,}/gi, "$1=[REDACTED_FEISHU_ID]");
  return { value, changed: value !== text };
}

function containsCredentialOrPii(text: string): boolean {
  return /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/.test(text)
    || /\b1[3-9]\d{9}\b/.test(text)
    || /\b\d{15}(?:\d{2}[0-9Xx])?\b/.test(text)
    || /\b\d{13,19}\b/.test(text)
    || /\b(?:token|cookie|secret|password|passwd|authorization|api[_-]?key|access[_-]?token)\s*[:=]\s*["']?[^\s"',;]{6,}/i.test(text)
    || /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i.test(text);
}

function parsePayload(rawText: string): Record<string, unknown>[] {
  const parsed = JSON.parse(rawText) as unknown;
  if (Array.isArray(parsed)) return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  const root = record(parsed);
  if (Array.isArray(root.items)) return arrayValue(root.items);
  if (Array.isArray(root.documents)) return arrayValue(root.documents);
  if (Array.isArray(root.messages)) return [root];
  return [root];
}

function sourceRefHash(prefix: string, value: string): string {
  return `${prefix}/${computeHash(value).replace(/^sha256:/, "").slice(0, 16)}`;
}

function itemFromDoc(payload: Record<string, unknown>): { item: FeishuRawItem; rawText: string } | undefined {
  const docToken = stringValue(payload.doc_token ?? payload.token ?? payload.id);
  const title = stringValue(payload.title) ?? "Feishu document";
  const content = stringValue(payload.content ?? payload.markdown ?? payload.text) ?? "";
  if (!docToken || !content.trim()) return undefined;
  const edited = stringValue(payload.last_edited_at ?? payload.updated_at);
  const summary = `${title}: Feishu document content withheld from envelope; use source_ref for authorized review.${edited ? ` Last edited ${edited}.` : ""}`;
  return {
    item: {
      id: docToken,
      source_ref: `feishu-doc://${docToken}`,
      summary,
      redacted_summary: summary,
      text: summary,
      created_at: edited,
      feishu_visibility: stringValue(payload.visibility) ?? "unknown",
    },
    rawText: JSON.stringify({
      type: "feishu-doc",
      doc_token: docToken,
      title,
      summary,
    }),
  };
}

function itemFromChat(payload: Record<string, unknown>, warnings: string[]): { item?: FeishuRawItem; rawText?: string; rejected: number } {
  const chatType = stringValue(payload.chat_type ?? payload.chatType ?? payload.type) ?? "group";
  const chatId = stringValue(payload.chat_id ?? payload.chatId ?? payload.id) ?? "unknown-chat";
  if (/^(direct|dm|1v1|private)$/i.test(chatType)) {
    warnings.push("feishu_1v1_rejected_before_envelope");
    return { rejected: 1 };
  }

  const messages = arrayValue(payload.messages);
  const text = messages
    .filter((message) => stringValue(message.message_type ?? message.type) !== "system")
    .map((message) => stringValue(message.text ?? message.content) ?? "")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  if (!text) return { rejected: 0 };

  const idScan = JSON.stringify({
    chat_id: chatId,
    sender_ids: messages.map((message) => message.sender_id ?? message.senderId),
  });
  const idRedacted = redactFeishuIdentifiers(idScan);
  const bodyRedacted = redactFeishuIdentifiers(text);
  if (idRedacted.changed || bodyRedacted.changed) warnings.push("feishu_private_identifier_blocked_before_envelope");
  if (containsCredentialOrPii(text)) {
    warnings.push("feishu_private_material_blocked_before_envelope");
    return { rejected: 1 };
  }

  const firstMessage = stringValue(messages[0]?.message_id ?? messages[0]?.id) ?? "start";
  const lastMessage = stringValue(messages[messages.length - 1]?.message_id ?? messages[messages.length - 1]?.id) ?? "end";
  const sourceRef = sourceRefHash("feishu-chat", `${chatId}:${firstMessage}:${lastMessage}`);
  const summary = `Feishu group topic ${stringValue(payload.topic) ?? "conversation"}: ${redactExcerpt(bodyRedacted.value, 800)}`;
  return {
    rejected: 0,
    item: {
      id: `${firstMessage}-${lastMessage}`,
      source_ref: sourceRef,
      summary,
      redacted_summary: summary,
      text: summary,
      created_at: stringValue(messages[0]?.created_at),
      feishu_chat_type: "group",
    },
    rawText: JSON.stringify({
      type: "feishu-chat",
      source_ref: sourceRef,
      summary,
    }),
  };
}

export async function resolveFeishuSource(source: ExperienceSourceConfig, options: FeishuFetchOptions): Promise<FeishuAdapterResult> {
  const fetched = await fetchFeishuSourcePayload(source, options);
  const warnings = [...fetched.warnings];
  if (!fetched.ok || !fetched.rawText) return { items: [], rejected: 0, warnings };

  let payloads: Record<string, unknown>[];
  try {
    payloads = parsePayload(fetched.rawText);
  } catch (error) {
    return { items: [], rejected: 0, warnings: [...warnings, `feishu_payload_parse_failed:${error instanceof Error ? error.message : String(error)}`] };
  }

  const items: Array<{ item: FeishuRawItem; rawText: string }> = [];
  let rejected = 0;
  for (const payload of payloads) {
    if (source.parser === "feishu-doc") {
      const item = itemFromDoc(payload);
      if (item) items.push(item);
      continue;
    }
    const chat = itemFromChat(payload, warnings);
    rejected += chat.rejected;
    if (chat.item && chat.rawText) items.push({ item: chat.item, rawText: chat.rawText });
  }

  return { items, rejected, warnings };
}
