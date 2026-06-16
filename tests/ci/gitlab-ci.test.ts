import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const CI_PATH = resolve(REPO_ROOT, "templates/gitlab/.gitlab-ci.yml");
const KNOWLEDGE_CI_PATH = resolve(REPO_ROOT, "templates/gitlab/knowledge-repo.gitlab-ci.yml");

describe("GitLab CI template", () => {
  it("includes resource_group on review and promote jobs", async () => {
    const ci = await readFile(CI_PATH, "utf8");

    // Review job must serialize writes
    assert.ok(
      ci.includes("praxisbase:review"),
      "missing praxisbase:review job"
    );
    assert.match(
      ci,
      /praxisbase:review:[\s\S]*?resource_group:\s+praxisbase-write/,
      "praxisbase:review missing resource_group: praxisbase-write"
    );

    // Promote job must serialize writes
    assert.ok(
      ci.includes("praxisbase:promote"),
      "missing praxisbase:promote job"
    );
    assert.match(
      ci,
      /praxisbase:promote:[\s\S]*?resource_group:\s+praxisbase-write/,
      "praxisbase:promote missing resource_group: praxisbase-write"
    );
  });

  it("build job exposes dist/ as artifact", async () => {
    const ci = await readFile(CI_PATH, "utf8");

    assert.ok(ci.includes("praxisbase:build"), "missing praxisbase:build job");
    assert.match(
      ci,
      /praxisbase:build:[\s\S]*?artifacts:[\s\S]*?paths:[\s\S]*?-\s+dist\/\s/m,
      "praxisbase:build missing dist/ in artifacts.paths"
    );
  });

  it("uses node:20-alpine image", async () => {
    const ci = await readFile(CI_PATH, "utf8");
    assert.match(ci, /node:20-alpine/, "expected node:20-alpine image");
  });
});


describe("split knowledge repo GitLab CI template", () => {
  it("clones the PraxisBase tool repo and runs the built CLI", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.ok(ci.includes("PRAXISBASE_TOOL_REPO"));
    assert.ok(ci.includes("git clone --depth 1 --branch"));
    assert.match(ci, /pnpm --filter @praxisbase\/core build[\s\S]*pnpm --filter @praxisbase\/cli build/);
    assert.ok(ci.includes("node /tmp/PraxisBase/packages/cli/dist/index.js"));
  });

  it("serializes write jobs and supports optional writeback", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.match(ci, /praxisbase:review:[\s\S]*?resource_group:\s+praxisbase-write/);
    assert.match(ci, /praxisbase:promote:[\s\S]*?resource_group:\s+praxisbase-write/);
    assert.ok(ci.includes("PRAXISBASE_WRITEBACK"));
    assert.ok(ci.includes("PRAXISBASE_PUSH_TOKEN"));
    assert.ok(ci.includes('git config --global user.name "praxisbase-bot"'));
    assert.ok(ci.includes('git add -f "$path"'));
    assert.ok(ci.includes("git rm -r -f --cached --ignore-unmatch .praxisbase/cache"));
  });

  it("can publish dist through GitLab Pages", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.ok(ci.includes("pages:"));
    assert.match(ci, /cp -r dist\/\* public\//);
    assert.match(ci, /paths:[\s\S]*?-\s+public/);
  });
});
