import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BrainBackendRegistry, type BrainBackend } from "@praxisbase/core/experience/brain-backend.js";

describe("BrainBackendRegistry", () => {
  it("registers backend-neutral retrieval providers", async () => {
    const backend: BrainBackend = {
      name: "gbrain",
      async doctor() {
        return { backend: "gbrain", ok: true, checks: [], warnings: [] };
      },
      async retrieve() {
        return { backend: "gbrain", candidates: [], warnings: [] };
      },
    };
    const registry = new BrainBackendRegistry();

    registry.register(backend);

    assert.equal(registry.get("gbrain"), backend);
    assert.deepEqual(registry.list(), [backend]);
  });
});
