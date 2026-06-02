import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GBRAIN_CONFIG,
  gbrainConfigSchema,
  gbrainLocalConfigSchema,
  gbrainRemoteConfigSchema,
  readGBrainConfig,
  resolveGBrainConfig,
  writeGBrainConfig,
} from "@praxisbase/core/experience/gbrain-config.js";

describe("GBrain persisted config", () => {
  it("parses local config and applies defaults", () => {
    const explicit = gbrainLocalConfigSchema.parse({
      mode: "local",
      executable: "/usr/local/bin/gbrain",
      source_id: "praxisbase",
      timeout_ms: 10_000,
      publish_mode: "capture",
    });
    assert.equal(explicit.executable, "/usr/local/bin/gbrain");

    const defaults = gbrainLocalConfigSchema.parse({ mode: "local" });
    assert.deepEqual(defaults, DEFAULT_GBRAIN_CONFIG);
  });

  it("parses remote config and rejects missing required fields", () => {
    const remote = gbrainRemoteConfigSchema.parse({
      mode: "remote",
      issuer_url: "https://auth.example.com",
      mcp_url: "https://gbrain.example.com/mcp",
      oauth_client_id: "pb-client",
      secret_env: "GBRAIN_CLIENT_SECRET",
      federated_read: ["team", "personal"],
    });
    assert.equal(remote.source_id, "praxisbase");
    assert.equal(remote.timeout_ms, 15_000);
    assert.deepEqual(remote.federated_read, ["team", "personal"]);
    assert.throws(() => gbrainRemoteConfigSchema.parse({ mode: "remote" }));
  });

  it("uses a discriminated union for local and remote modes", () => {
    assert.equal(gbrainConfigSchema.parse({ mode: "local" }).mode, "local");
    assert.equal(gbrainConfigSchema.parse({
      mode: "remote",
      issuer_url: "https://auth.example.com",
      mcp_url: "https://gbrain.example.com/mcp",
      oauth_client_id: "pb-client",
      secret_env: "GBRAIN_CLIENT_SECRET",
    }).mode, "remote");
  });

  it("roundtrips config on disk and resolves defaults when missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-gbrain-config-"));
    try {
      assert.equal(await readGBrainConfig(root), null);
      assert.deepEqual(await resolveGBrainConfig(root), DEFAULT_GBRAIN_CONFIG);

      const config = gbrainLocalConfigSchema.parse({
        mode: "local",
        executable: "/opt/gbrain",
        source_id: "team-praxisbase",
        timeout_ms: 20_000,
        publish_mode: "mcp_put_page",
      });
      await writeGBrainConfig(root, config);
      assert.deepEqual(await readGBrainConfig(root), config);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
