import { mkdtemp, readFile, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { submitEpisode, syncOutbox } from "@praxisbase/cli/commands/episode.js";
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

  it("preserves knowledge_references in submitted episode", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-krefs-"));

    await submitEpisode(root, "tests/fixtures/openclaw/episodes/with-knowledge-refs.json");

    const stored = await readFile(
      join(root, ".praxisbase/inbox/episodes/episode_20260517_refs.json"),
      "utf8"
    );
    const parsed = JSON.parse(stored);
    assert.ok(Array.isArray(parsed.knowledge_references));
    assert.equal(parsed.knowledge_references.length, 2);
    assert.equal(parsed.knowledge_references[0].id, "openclaw-auth-expired");
    assert.equal(parsed.knowledge_references[0].used_in_phase, "diagnosis");
    assert.equal(parsed.knowledge_references[0].effect, "helped_fix");
    assert.equal(parsed.knowledge_references[0].outcome, "success");
    assert.equal(parsed.knowledge_references[1].id, "openclaw-auth-repair");
    assert.equal(parsed.knowledge_references[1].used_in_phase, "repair");
  });

  it("preserves knowledge_references from success fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-knowledge-refs-"));

    await submitEpisode(root, "tests/fixtures/openclaw/episodes/success.json");

    const stored = await readFile(
      join(root, ".praxisbase/inbox/episodes/episode_20260517_abc.json"),
      "utf8"
    );
    const parsed = JSON.parse(stored);
    assert.ok(Array.isArray(parsed.knowledge_references));
    assert.equal(parsed.knowledge_references.length, 1);
    assert.equal(parsed.knowledge_references[0].id, "openclaw-auth-expired");
    assert.equal(parsed.knowledge_references[0].used_in_phase, "diagnosis");
    assert.equal(parsed.knowledge_references[0].effect, "helped_fix");
    assert.equal(parsed.knowledge_references[0].outcome, "success");
  });

  it("syncs outbox episodes and proposals idempotently into inbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "praxisbase-outbox-sync-"));

    await submitEpisode(root, "tests/fixtures/m28/openclaw/episodes/dispatch-routing-success.json", { offlineOk: true });
    await submitProposal(root, "tests/fixtures/m28/openclaw/proposals/dispatch-routing-known-fix-patch.json", { offlineOk: true });

    const first = await syncOutbox(root);
    const second = await syncOutbox(root);

    assert.deepEqual(first, { episodes: 1, proposals: 1, skipped: 0 });
    assert.deepEqual(second, { episodes: 0, proposals: 0, skipped: 2 });
    assert.equal((await readdir(join(root, ".praxisbase/inbox/episodes"))).length, 1);
    assert.equal((await readdir(join(root, ".praxisbase/inbox/proposals"))).length, 1);
  });
});
