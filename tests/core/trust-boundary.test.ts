import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TRUST_TIERS,
  capSourceHint,
  classifyAndWrap,
  classifyTrust,
  escapeWrapperContent,
  isInjectable,
  wrapUntrusted,
} from "@praxisbase/core/agent-access/trust-boundary.js";

describe("classifyTrust", () => {
  it("returns pb_stable for pb_stable_page", () => {
    assert.equal(classifyTrust("pb_stable_page"), "pb_stable");
  });

  it("returns pb_stable for pb_promoted_skill", () => {
    assert.equal(classifyTrust("pb_promoted_skill"), "pb_stable");
  });

  it("returns pb_candidate for pb_candidate", () => {
    assert.equal(classifyTrust("pb_candidate"), "pb_candidate");
  });

  it("returns gbrain_sidecar for gbrain_sidecar", () => {
    assert.equal(classifyTrust("gbrain_sidecar"), "gbrain_sidecar");
  });

  it("returns agentmemory_sidecar for agentmemory_sidecar", () => {
    assert.equal(classifyTrust("agentmemory_sidecar"), "agentmemory_sidecar");
  });

  it("returns remote_personal_agent for remote_openclaw with trustPersonalRemotes", () => {
    assert.equal(classifyTrust("remote_openclaw", { trustPersonalRemotes: true }), "remote_personal_agent");
  });

  it("returns remote_personal_agent for trusted remote codex with trustPersonalRemotes", () => {
    assert.equal(classifyTrust("remote_codex", { trustPersonalRemotes: true }), "remote_personal_agent");
  });

  it("returns external_untrusted for remote_openclaw without trustPersonalRemotes", () => {
    assert.equal(classifyTrust("remote_openclaw"), "external_untrusted");
  });

  it("returns external_untrusted for unknown source kinds", () => {
    assert.equal(classifyTrust("unknown_source"), "external_untrusted");
  });
});

describe("isInjectable", () => {
  it("returns true for pb_stable", () => {
    assert.equal(isInjectable("pb_stable"), true);
  });

  it("returns false for pb_candidate", () => {
    assert.equal(isInjectable("pb_candidate"), false);
  });

  it("returns false for gbrain_sidecar", () => {
    assert.equal(isInjectable("gbrain_sidecar"), false);
  });

  it("returns false for external_untrusted", () => {
    assert.equal(isInjectable("external_untrusted"), false);
  });

  it("returns true for remote_personal_agent", () => {
    assert.equal(isInjectable("remote_personal_agent"), true);
  });
});

describe("escapeWrapperContent", () => {
  it("escapes & to &amp;", () => {
    assert.equal(escapeWrapperContent("a & b"), "a &amp; b");
  });

  it("escapes < to &lt;", () => {
    assert.equal(escapeWrapperContent("<tag"), "&lt;tag");
  });

  it("escapes > to &gt;", () => {
    assert.equal(escapeWrapperContent("tag>"), "tag&gt;");
  });

  it("escapes all three in mixed content", () => {
    assert.equal(escapeWrapperContent("<a & b>"), "&lt;a &amp; b&gt;");
  });
});

describe("capSourceHint", () => {
  it("returns short hint unchanged", () => {
    assert.equal(capSourceHint("pb_stable_page"), "pb_stable_page");
  });

  it("truncates long hint with ellipsis", () => {
    assert.equal(capSourceHint("abcdefghijklmnopqrstuvwxyz", 10), "abcdefg...");
  });
});

describe("wrapUntrusted", () => {
  it("produces correct XML wrapper with escaped content", () => {
    assert.equal(
      wrapUntrusted("Use <unsafe> & check", "external_log", "logs>system"),
      '<untrusted-source source="external_log" authority="logs&gt;system">\nUse &lt;unsafe&gt; &amp; check\n</untrusted-source>',
    );
  });

  it("escapes source kind in the attribute", () => {
    assert.equal(
      wrapUntrusted("content", "external<log>&trace", "authority"),
      '<untrusted-source source="external&lt;log&gt;&amp;trace" authority="authority">\ncontent\n</untrusted-source>',
    );
  });
});

describe("classifyAndWrap", () => {
  it("returns raw content for injectable tiers", () => {
    assert.deepEqual(classifyAndWrap("trusted content", "pb_stable_page", "kb"), {
      tier: "pb_stable",
      content: "trusted content",
      injectable: true,
    });
  });

  it("wraps content for untrusted tier", () => {
    assert.deepEqual(classifyAndWrap("untrusted <content>", "external_log", "logs"), {
      tier: "external_untrusted",
      content:
        '<untrusted-source source="external_log" authority="logs">\nuntrusted &lt;content&gt;\n</untrusted-source>',
      injectable: false,
    });
  });

  it("wraps content for gbrain_sidecar", () => {
    assert.deepEqual(classifyAndWrap("sidecar content", "gbrain_sidecar", "gbrain"), {
      tier: "gbrain_sidecar",
      content:
        '<untrusted-source source="gbrain_sidecar" authority="gbrain">\nsidecar content\n</untrusted-source>',
      injectable: false,
    });
  });

  it("wraps content for agentmemory_sidecar", () => {
    assert.deepEqual(classifyAndWrap("memory content", "agentmemory_sidecar", "agentmemory"), {
      tier: "agentmemory_sidecar",
      content:
        '<untrusted-source source="agentmemory_sidecar" authority="agentmemory">\nmemory content\n</untrusted-source>',
      injectable: false,
    });
  });
});

describe("TRUST_TIERS", () => {
  it("includes all 7 trust tier values", () => {
    assert.deepEqual(TRUST_TIERS, [
      "pb_stable",
      "pb_personal_facet",
      "pb_candidate",
      "gbrain_sidecar",
      "agentmemory_sidecar",
      "remote_personal_agent",
      "external_untrusted",
    ]);
    assert.equal(TRUST_TIERS.length, 7);
  });
});
