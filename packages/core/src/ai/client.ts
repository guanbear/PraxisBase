export interface AiJsonClient {
  generateJson(input: {
    system: string;
    user: string;
    schemaName: string;
    maxOutputBytes: number;
  }): Promise<{ ok: true; json: unknown } | { ok: false; error: string }>;
}
