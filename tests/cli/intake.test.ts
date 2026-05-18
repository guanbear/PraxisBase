import { mkdtemp, readFile, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { submitEpisode } from "@praxisbase/cli/commands/episode.js";
import { submitProposal } from "@praxisbase/cli/commands/propose.js";

describe("episode and proposal intake", () => {
  it("writes a valid repair episode to inbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-episode-"));

    await submitEpisode(root, "tests/fixtures/openclaw/episodes/success.json");

    await assert.doesNotReject(stat(join(root, ".praxisbase/inbox/episodes/episode_20260517_abc.json")));
  });

  it("writes a valid incident episode to inbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-incident-"));

    await submitEpisode(root, "tests/fixtures/openclaw/episodes/incident-episode.json");

    const stored = await readFile(
      join(root, ".praxisbase/inbox/episodes/episode_20260518_k8s_incident.json"),
      "utf8"
    );
    const parsed = JSON.parse(stored);
    assert.equal(parsed.type, "incident_episode");
    assert.equal(parsed.result, "confirmed");
  });

  it("rejects episode without source_refs", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-episode-reject-"));

    await assert.rejects(submitEpisode(root, "tests/fixtures/openclaw/episodes/no-source-refs.json"), );

    const files = await readdir(join(root, ".praxisbase/inbox/episodes")).catch(() => []);
    assert.deepEqual(files, []);
  });

  it("writes episode to outbox when offline-ok", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-outbox-"));

    await submitEpisode(root, "tests/fixtures/openclaw/episodes/success.json", { offlineOk: true });

    const stored = await readFile(
      join(root, ".praxisbase/outbox/episodes/episode_20260517_abc.json"),
      "utf8"
    );
    const parsed = JSON.parse(stored);
    assert.equal(parsed.idempotency_key, "episode_20260517_abc");
  });

  it("writes a valid proposal to inbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-proposal-"));

    await submitProposal(root, "tests/fixtures/openclaw/proposals/known-fix.json");

    const stored = await readFile(
      join(root, ".praxisbase/inbox/proposals/proposal_20260517_known_fix.json"),
      "utf8"
    );
    assert.ok(stored.includes("openclaw-auth-expired"));
  });

  it("writes proposal to outbox when offline-ok", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-proposal-outbox-"));

    await submitProposal(root, "tests/fixtures/openclaw/proposals/known-fix.json", { offlineOk: true });

    await assert.doesNotReject(stat(join(root, ".praxisbase/outbox/proposals/proposal_20260517_known_fix.json")));
  });
});
