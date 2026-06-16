import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const KNOWLEDGE_CI_PATH = resolve(
  REPO_ROOT,
  "templates/gitlab/knowledge-repo.gitlab-ci.yml",
);

describe("GitLab daily harvest CI template", () => {
  it("includes praxisbase:daily-harvest job", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.ok(
      ci.includes("praxisbase:daily-harvest"),
      "missing praxisbase:daily-harvest job",
    );
  });

  it("uses resource_group: praxisbase-write on daily-harvest", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.match(
      ci,
      /praxisbase:daily-harvest:[\s\S]*?resource_group:\s+praxisbase-write/,
      "praxisbase:daily-harvest missing resource_group: praxisbase-write",
    );
  });

  it("triggers on PRAXISBASE_TASK == daily-harvest from scheduled pipelines", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.match(
      ci,
      /praxisbase:daily-harvest:[\s\S]*?CI_PIPELINE_SOURCE == "schedule"[\s\S]*?PRAXISBASE_TASK == "daily-harvest"/,
      'praxisbase:daily-harvest missing scheduled rule with PRAXISBASE_TASK == "daily-harvest"',
    );
  });

  it("allows API-triggered daily-harvest smoke runs", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.match(
      ci,
      /praxisbase:daily-harvest:[\s\S]*?CI_PIPELINE_SOURCE == "api"[\s\S]*?PRAXISBASE_TASK == "daily-harvest"/,
      'praxisbase:daily-harvest missing API rule with PRAXISBASE_TASK == "daily-harvest"',
    );
  });

  it("calls daily run --mode team-git", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.match(
      ci,
      /praxisbase:daily-harvest:[\s\S]*?daily run --mode team-git/,
      "praxisbase:daily-harvest script missing 'daily run --mode team-git'",
    );
  });

  it("fails the job when the daily command returns ok false", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.match(ci, /praxisbase-daily\.json/);
    assert.match(ci, /result\.ok === false/);
  });

  it("runs daily-harvest before review stage", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    const harvestStageIndex = ci.indexOf("stage: harvest");
    const reviewStageIndex = ci.indexOf("stage: review");

    assert.ok(
      harvestStageIndex !== -1,
      "missing 'stage: harvest' in template",
    );
    assert.ok(
      reviewStageIndex !== -1,
      "missing 'stage: review' in template",
    );
    assert.ok(
      harvestStageIndex < reviewStageIndex,
      "harvest stage must appear before review stage",
    );
  });

  it("lists harvest before review in stages definition", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    const stagesMatch = ci.match(/stages:\s*\n([\s\S]*?)(?=\n[a-z]|\n\n|$)/);
    assert.ok(stagesMatch, "could not find stages: section");

    const stagesBlock = stagesMatch[1];
    const harvestIdx = stagesBlock.indexOf("harvest");
    const reviewIdx = stagesBlock.indexOf("review");

    assert.ok(harvestIdx !== -1, "harvest not listed in stages");
    assert.ok(reviewIdx !== -1, "review not listed in stages");
    assert.ok(
      harvestIdx < reviewIdx,
      "harvest must be listed before review in stages",
    );
  });

  it("extends both .praxisbase-knowledge and .praxisbase-writeback", async () => {
    const ci = await readFile(KNOWLEDGE_CI_PATH, "utf8");

    assert.match(
      ci,
      /praxisbase:daily-harvest:[\s\S]*?extends:[\s\S]*?\.praxisbase-knowledge/,
      "praxisbase:daily-harvest does not extend .praxisbase-knowledge",
    );
    assert.match(
      ci,
      /praxisbase:daily-harvest:[\s\S]*?extends:[\s\S]*?\.praxisbase-writeback/,
      "praxisbase:daily-harvest does not extend .praxisbase-writeback",
    );
  });
});
