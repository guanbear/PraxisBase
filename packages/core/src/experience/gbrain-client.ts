import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { redactSensitiveValues } from "../protocol/redact.js";
import type { BrainBackendDiagnosticCheck } from "./brain-backend.js";

const execFileAsync = promisify(execFile);

export interface GBrainCommandResult {
  stdout: string;
  stderr: string;
}

export type GBrainCommandRunner = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number },
) => Promise<GBrainCommandResult>;

export interface GBrainClientOptions {
  executable?: string;
  timeoutMs?: number;
  preferJson?: boolean;
  runCommand?: GBrainCommandRunner;
}

export interface GBrainDoctorResult {
  ok: boolean;
  checks: BrainBackendDiagnosticCheck[];
  raw?: unknown;
}

export interface GBrainQueryHit {
  slug: string;
  score?: number;
  chunk_text: string;
  title?: string;
  page_id?: string;
  source?: string;
}

export interface GBrainQueryResult {
  ok: boolean;
  hits: GBrainQueryHit[];
  error?: string;
}

export interface GBrainCaptureResult {
  ok: boolean;
  slug?: string;
  raw?: unknown;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorMessage(error: unknown): string {
  return redactSensitiveValues(error instanceof Error ? error.message : String(error));
}

function isMissingBinary(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.code === "ENOENT" || /spawn .* ENOENT/i.test(String(error.message ?? ""));
}

async function defaultRunCommand(command: string, args: string[], options?: { timeoutMs?: number }): Promise<GBrainCommandResult> {
  const result = await execFileAsync(command, args, {
    timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseJson(text: string): unknown {
  return JSON.parse(text.trim());
}

function doctorOk(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  if (typeof raw.ok === "boolean") return raw.ok;
  if (typeof raw.success === "boolean") return raw.success;
  const status = stringValue(raw.status);
  if (status && /^(ok|pass|healthy|success)$/i.test(status)) return true;
  const checks = Array.isArray(raw.checks) ? raw.checks : [];
  if (checks.length > 0) {
    return checks.every((check) => {
      if (!isRecord(check)) return true;
      const checkStatus = stringValue(check.status);
      if (typeof check.ok === "boolean") return check.ok;
      return !checkStatus || /^(ok|pass|healthy|success|warn|warning)$/i.test(checkStatus);
    });
  }
  return true;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sourceIds(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  return arrayValue(raw.sources).flatMap((source) => {
    if (typeof source === "string" && source.trim()) return [source.trim()];
    if (isRecord(source)) {
      return [stringValue(source.id), stringValue(source.name), stringValue(source.source_id)].filter((entry): entry is string => Boolean(entry));
    }
    return [];
  });
}

function extraDoctorChecks(raw: unknown, options?: { sourceId?: string }): BrainBackendDiagnosticCheck[] {
  if (!isRecord(raw)) return [];
  const checks: BrainBackendDiagnosticCheck[] = [];
  const version = stringValue(raw.version);
  if (version) {
    checks.push({
      id: "gbrain_version",
      ok: true,
      severity: "info",
      message: `GBrain version ${version}.`,
      details: { version },
    });
  }
  if (options?.sourceId) {
    const ids = sourceIds(raw);
    if (ids.length > 0) {
      const ok = ids.includes(options.sourceId);
      checks.push({
        id: "gbrain_source",
        ok,
        severity: ok ? "info" : "warning",
        message: ok
          ? `GBrain source ${options.sourceId} is available.`
          : `GBrain source ${options.sourceId} was not found.`,
        details: { requested_source_id: options.sourceId, sources: ids },
      });
    }
  }
  if (typeof raw.publish_ready === "boolean") {
    checks.push({
      id: "gbrain_publish_ready",
      ok: raw.publish_ready,
      severity: raw.publish_ready ? "info" : "warning",
      message: raw.publish_ready ? "GBrain publish path is ready." : "GBrain publish path is not ready.",
    });
  }
  return checks;
}

function normalizeJsonHit(value: unknown): GBrainQueryHit | undefined {
  if (!isRecord(value)) return undefined;
  const slug = stringValue(value.slug) ?? stringValue(value.id) ?? stringValue(value.page_id) ?? stringValue(value.path);
  const text = stringValue(value.chunk_text) ?? stringValue(value.text) ?? stringValue(value.content) ?? stringValue(value.summary);
  if (!slug || !text) return undefined;
  return {
    slug,
    score: numberValue(value.score),
    chunk_text: text,
    title: stringValue(value.title),
    page_id: stringValue(value.page_id),
    source: stringValue(value.source),
  };
}

function normalizeJsonHits(raw: unknown): GBrainQueryHit[] {
  const items = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? raw.results ?? raw.hits ?? raw.items ?? raw.pages
      : [];
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const hit = normalizeJsonHit(item);
    return hit ? [hit] : [];
  });
}

function parseTextHits(text: string): GBrainQueryHit[] {
  const hits: GBrainQueryHit[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^no results\.?$/i.test(trimmed)) continue;
    const match = trimmed.match(/^\[(\d+(?:\.\d+)?)\]\s+(\S+)\s+--\s*(.*)$/);
    if (!match) continue;
    hits.push({
      score: Number(match[1]),
      slug: match[2],
      chunk_text: match[3],
    });
  }
  return hits;
}

export class GBrainClient {
  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly preferJson: boolean;
  private readonly runCommand: GBrainCommandRunner;

  constructor(options: GBrainClientOptions = {}) {
    this.executable = options.executable ?? "gbrain";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.preferJson = options.preferJson ?? false;
    this.runCommand = options.runCommand ?? defaultRunCommand;
  }

  async doctor(options?: { sourceId?: string }): Promise<GBrainDoctorResult> {
    try {
      const result = await this.runCommand(this.executable, ["doctor", "--fast", "--json"], { timeoutMs: this.timeoutMs });
      const raw = parseJson(result.stdout);
      const ok = doctorOk(raw);
      return {
        ok,
        raw,
        checks: [{
          id: "gbrain_doctor",
          ok,
          severity: ok ? "info" : "warning",
          message: ok ? "GBrain local CLI is healthy." : "GBrain doctor reported warnings or failures.",
          details: isRecord(raw) ? raw : { raw },
        }, ...extraDoctorChecks(raw, options)],
      };
    } catch (error) {
      if (isMissingBinary(error)) {
        return {
          ok: false,
          checks: [{
            id: "gbrain_binary",
            ok: false,
            severity: "warning",
            message: "GBrain CLI is not installed or not on PATH.",
            hint: "Install once with `bun install -g github:garrytan/gbrain`, then run `gbrain doctor --fast --json`.",
          }],
        };
      }
      return {
        ok: false,
        checks: [{
          id: "gbrain_doctor",
          ok: false,
          severity: "warning",
          message: `GBrain doctor failed: ${errorMessage(error)}`,
        }],
      };
    }
  }

  async query(query: string, options: { limit?: number; sourceId?: string } = {}): Promise<GBrainQueryResult> {
    const limit = Math.max(1, Math.min(options.limit ?? 4, 20));
    const args = ["query", query, "--limit", String(limit)];
    if (options.sourceId) args.push("--source-id", options.sourceId);
    if (this.preferJson) args.push("--json");
    try {
      const result = await this.runCommand(this.executable, args, { timeoutMs: this.timeoutMs });
      if (/^\s*no results\.?\s*$/i.test(result.stdout)) {
        return { ok: true, hits: [] };
      }
      if (/^[\s\r\n]*[\[{]/.test(result.stdout)) {
        try {
          return { ok: true, hits: normalizeJsonHits(parseJson(result.stdout)).slice(0, limit) };
        } catch (error) {
          const textHits = parseTextHits(result.stdout).slice(0, limit);
          if (textHits.length > 0) {
            return { ok: true, hits: textHits };
          }
          if (!this.preferJson) {
            return { ok: true, hits: textHits };
          }
          return { ok: false, hits: [], error: `invalid_json: ${errorMessage(error)}` };
        }
      }
      return { ok: true, hits: parseTextHits(result.stdout).slice(0, limit) };
    } catch (error) {
      if (isMissingBinary(error)) {
        return { ok: false, hits: [], error: "gbrain_not_installed: install once with `bun install -g github:garrytan/gbrain`" };
      }
      return { ok: false, hits: [], error: errorMessage(error) };
    }
  }

  async capture(content: string, options: { slug: string; type?: string; sourceId?: string } = { slug: "" }): Promise<GBrainCaptureResult> {
    const args = ["capture", content, "--slug", options.slug, "--json"];
    if (options.type) args.push("--type", options.type);
    if (options.sourceId) args.push("--source", options.sourceId);
    try {
      const result = await this.runCommand(this.executable, args, { timeoutMs: this.timeoutMs });
      try {
        const raw = parseJson(result.stdout);
        const slug = isRecord(raw) ? stringValue(raw.slug) ?? stringValue(raw.page_slug) : undefined;
        return { ok: true, slug: slug ?? options.slug, raw };
      } catch {
        return { ok: true, slug: result.stdout.trim() || options.slug };
      }
    } catch (error) {
      if (isMissingBinary(error)) {
        return { ok: false, error: "gbrain_not_installed: install once with `bun install -g github:garrytan/gbrain`" };
      }
      return { ok: false, error: errorMessage(error) };
    }
  }
}
