import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

describe("M30 Feishu source contract fixtures", () => {
  it("keeps the OpenClaw Feishu export fixture on the indirect Path A shape", async () => {
    const fixture = await readJson("tests/fixtures/feishu-source/openclaw-feishu-export.json");
    assert.ok(Array.isArray(fixture.items));
    const first = (fixture.items as Array<Record<string, unknown>>)[0];
    assert.equal(first.source_ref, "openclaw-feishu://doc/doccn_pb_m30_public_001");
    assert.equal(first.signature, "openclaw:feishu-rollback-lesson");
  });

  it("keeps the Feishu doc fixture source-like and non-authoritative", async () => {
    const fixture = await readJson("tests/fixtures/feishu-source/feishu-doc.json");
    assert.equal(fixture.type, "doc");
    assert.equal(fixture.doc_token, "doccn_pb_m30_public_001");
    assert.equal(fixture.visibility, "public_kb");
    assert.match(String(fixture.content), /smoke check/);
  });

  it("keeps Feishu privacy negative fixtures for pre-envelope hard blocks", async () => {
    const dm = await readJson("tests/fixtures/feishu-source/feishu-chat-1v1-negative.json");
    const pii = await readJson("tests/fixtures/feishu-source/feishu-chat-pii-negative.json");
    assert.equal(dm.chat_type, "direct");
    assert.match(JSON.stringify(dm), /ou_pb_m30_user_private/);
    assert.match(JSON.stringify(pii), /ops@example\.invalid/);
    assert.match(JSON.stringify(pii), /mock_sensitive_token_123456/);
  });
});
