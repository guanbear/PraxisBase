/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import { abstractLessonPrivacy } from "@praxisbase/core";

test("abstracts concrete remote host from safe claim", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Use root@example.com and /Users/me/.ssh/key before restart.",
    claim: "Use root@example.com and /Users/me/.ssh/key before restart.",
    privacy_tier: "personal_only",
    redaction_notes: [],
  } as any, { mode: "team-git" });

  assert.equal(result.lesson.privacy_tier, "human_required");
  assert.doesNotMatch(result.lesson.safe_claim, /root@example\.com|\.ssh/);
  assert.ok(result.changed);
  assert.ok(result.reasons.length > 0);
});

test("abstracts IPv4 address", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Connect to 192.168.1.100 before deployment.",
    claim: "Connect to 192.168.1.100 before deployment.",
    privacy_tier: "personal_only",
    redaction_notes: [],
  } as any);

  assert.doesNotMatch(result.lesson.safe_claim, /192\.168\.1\.100/);
  assert.ok(result.changed);
});

test("abstracts credential assignment", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Configure api_key=sk-abc123def before launch.",
    claim: "Configure api_key=sk-abc123def before launch.",
    privacy_tier: "personal_only",
    redaction_notes: [],
  } as any);

  assert.doesNotMatch(result.lesson.safe_claim, /sk-abc123def/);
  assert.ok(result.changed);
});

test("personal-local mode downgrades safe to personal_only", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Email admin@example.com when setup fails.",
    claim: "Email admin@example.com when setup fails.",
    privacy_tier: "safe",
    redaction_notes: [],
  } as any, { mode: "personal-local" });

  assert.equal(result.lesson.privacy_tier, "personal_only");
});

test("no changes when lesson is already clean", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Restart the service after changing configuration.",
    claim: "Restart the service after changing configuration.",
    privacy_tier: "safe",
    redaction_notes: [],
  } as any);

  assert.equal(result.changed, false);
  assert.deepEqual(result.reasons, []);
});

test("team-git mode escalates to human_required", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Connect as deploy@staging before migration.",
    claim: "Connect as deploy@staging before migration.",
    privacy_tier: "team_allowed",
    redaction_notes: [],
  } as any, { mode: "team-git" });

  assert.equal(result.lesson.privacy_tier, "human_required");
});

test("abstracts plain Slack raw user id", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Upload audio for raw user U1234567890.",
    claim: "Upload audio for raw user U1234567890.",
    privacy_tier: "team_allowed",
    redaction_notes: [],
  } as any, { mode: "team-git" });

  assert.doesNotMatch(result.lesson.safe_claim, /U1234567890/);
  assert.equal(result.lesson.privacy_tier, "human_required");
});

test("abstracts standalone private hostnames while preserving the lesson", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Confirm mac-mini.home before restarting services.",
    claim: "Confirm mac-mini.home before restarting services.",
    privacy_tier: "safe",
    redaction_notes: [],
  } as any, { mode: "personal-local" });

  assert.doesNotMatch(result.lesson.safe_claim, /mac-mini\.home/);
  assert.match(result.lesson.safe_claim, /Confirm/);
  assert.match(result.lesson.safe_claim, /restarting services/);
  assert.equal(result.lesson.privacy_tier, "personal_only");
});

test("abstracts private remote wrapper commands", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Use macmini-ssh only after confirming the target machine.",
    claim: "Use macmini-ssh only after confirming the target machine.",
    privacy_tier: "team_allowed",
    redaction_notes: [],
  } as any, { mode: "team-git" });

  assert.doesNotMatch(result.lesson.safe_claim, /macmini-ssh/);
  assert.match(result.lesson.safe_claim, /confirming the target machine/);
  assert.equal(result.lesson.privacy_tier, "human_required");
});

test("abstracts database connection strings", () => {
  const result = abstractLessonPrivacy({
    safe_claim: "Verify with postgres://admin:secret@db.internal/app before migration.",
    claim: "Verify with postgres://admin:secret@db.internal/app before migration.",
    privacy_tier: "team_allowed",
    redaction_notes: [],
  } as any, { mode: "team-git" });

  assert.doesNotMatch(result.lesson.safe_claim, /admin:secret|db\.internal/);
  assert.equal(result.lesson.privacy_tier, "human_required");
});
