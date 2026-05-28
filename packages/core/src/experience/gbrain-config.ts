import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const gbrainLocalConfigSchema = z.object({
  mode: z.literal("local"),
  cli_path: z.string().optional(),
  executable: z.string().default("gbrain"),
  source_id: z.string().default("praxisbase"),
  timeout_ms: z.number().default(15_000),
  publish_mode: z.enum(["capture", "mcp_put_page"]).default("capture"),
});

export const gbrainRemoteConfigSchema = z.object({
  mode: z.literal("remote"),
  issuer_url: z.string().url(),
  mcp_url: z.string().url(),
  oauth_client_id: z.string().min(1),
  secret_env: z.string().min(1),
  source_id: z.string().default("praxisbase"),
  federated_read: z.array(z.string().min(1)).default([]),
  timeout_ms: z.number().default(15_000),
});

export const gbrainConfigSchema = z.discriminatedUnion("mode", [
  gbrainLocalConfigSchema,
  gbrainRemoteConfigSchema,
]);

export type GBrainLocalConfig = z.infer<typeof gbrainLocalConfigSchema>;
export type GBrainRemoteConfig = z.infer<typeof gbrainRemoteConfigSchema>;
export type GBrainConfig = z.infer<typeof gbrainConfigSchema>;

export const DEFAULT_GBRAIN_CONFIG: GBrainConfig = {
  mode: "local",
  executable: "gbrain",
  source_id: "praxisbase",
  timeout_ms: 15_000,
  publish_mode: "capture",
};

function gbrainConfigPath(root: string): string {
  return join(root, ".praxisbase", "gbrain-config.json");
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function readGBrainConfig(root: string): Promise<GBrainConfig | null> {
  try {
    const raw = await readFile(gbrainConfigPath(root), "utf8");
    return gbrainConfigSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (isNotFound(error)) return null;
    return null;
  }
}

export async function writeGBrainConfig(root: string, config: GBrainConfig): Promise<void> {
  const path = gbrainConfigPath(root);
  const parsed = gbrainConfigSchema.parse(config);
  await mkdir(join(root, ".praxisbase"), { recursive: true });
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export async function resolveGBrainConfig(root: string): Promise<GBrainConfig> {
  return await readGBrainConfig(root) ?? DEFAULT_GBRAIN_CONFIG;
}

export function gbrainExecutable(config: GBrainConfig): string {
  return config.mode === "local" ? (config.cli_path ?? config.executable) : "gbrain";
}
