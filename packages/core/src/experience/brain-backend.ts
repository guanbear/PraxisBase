import type { WikiContextCandidate } from "../wiki/retrieval.js";

export type BrainBackendName = "agentmemory" | "gbrain";

export interface BrainBackendDiagnosticCheck {
  id: string;
  ok: boolean;
  severity: "info" | "warning" | "error";
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export interface BrainBackendDoctorResult {
  backend: BrainBackendName;
  ok: boolean;
  checks: BrainBackendDiagnosticCheck[];
  warnings: string[];
}

export interface BrainBackendRetrievalInput {
  query: string;
  stage: "diagnosis" | "repair" | "verification" | "proposal";
  limit: number;
}

export interface BrainBackendRetrievalResult {
  backend: BrainBackendName;
  candidates: WikiContextCandidate[];
  warnings: string[];
}

export interface BrainBackendPublishInput {
  slug: string;
  title?: string;
  type?: string;
  content: string;
  sourceId?: string;
}

export interface BrainBackendPublishResult {
  backend: BrainBackendName;
  ok: boolean;
  slug?: string;
  warnings: string[];
  error?: string;
}

export interface BrainBackendImportInput {
  query: string;
  limit: number;
  sourceId?: string;
}

export interface BrainBackend {
  name: BrainBackendName;
  doctor(): Promise<BrainBackendDoctorResult>;
  retrieve(input: BrainBackendRetrievalInput): Promise<BrainBackendRetrievalResult>;
  publish?(input: BrainBackendPublishInput): Promise<BrainBackendPublishResult>;
  import?(input: BrainBackendImportInput): Promise<BrainBackendRetrievalResult>;
}

export class BrainBackendRegistry {
  private readonly backends = new Map<BrainBackendName, BrainBackend>();

  register(backend: BrainBackend): void {
    this.backends.set(backend.name, backend);
  }

  get(name: BrainBackendName): BrainBackend | undefined {
    return this.backends.get(name);
  }

  list(): BrainBackend[] {
    return Array.from(this.backends.values());
  }
}
