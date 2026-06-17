import type { WikiPage } from "./resolver.js";

export interface BuildWikiSiteResult {
  outputs: string[];
  pages: number;
  health: {
    sources: number;
    pages: number;
    broken_links: number;
    duplicates: number;
    orphans: number;
    stale: number;
    findings: number;
    quality_findings: number;
  };
}

export interface WikiSitePage extends WikiPage {
  path: string;
  knowledge_base?: string;
  source_ids: string[];
  summary: string;
  body_text: string;
  signatures: string[];
  provenance_refs?: Array<{ uri: string; hash?: string }>;
  confidence?: number;
  reference_count?: number;
  updated_at?: string;
  superseded_by?: string | null;
}
