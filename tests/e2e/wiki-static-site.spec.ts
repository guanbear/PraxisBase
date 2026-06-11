import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { buildWikiSite } from "@praxisbase/core/wiki/render-site.js";

async function createStaticWikiFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "praxisbase-playwright-wiki-"));
  await mkdir(join(root, "kb/known-fixes"), { recursive: true });
  await mkdir(join(root, "kb/procedures"), { recursive: true });

  await writeFile(join(root, "kb/known-fixes/openclaw-auth-expired.md"), `---
id: openclaw-auth-expired
protocol_version: "0.1"
type: known_fix
knowledge_type: known_fix
scope: team
risk: medium
status: published
maturity: proven
signatures: ["openclaw:auth-expired"]
skills: []
sources: [{ uri: "raw-vault://codex/session-1", hash: "sha256:s1" }]
confidence: 0.9
reference_count: 3
last_referenced_at: null
supersedes: []
superseded_by: null
updated_at: "2026-05-21T00:00:00.000Z"
---
# OpenClaw Auth Expired

Refresh login, then verify with [[restart-worker-service]].
`);

  await writeFile(join(root, "kb/procedures/restart-worker-service.md"), `---
id: restart-worker-service
protocol_version: "0.1"
type: procedure
knowledge_type: procedure
scope: team
status: published
maturity: verified
signatures: ["worker:restart"]
sources: [{ uri: "raw-vault://codex/session-2", hash: "sha256:s2" }]
confidence: 0.8
reference_count: 2
updated_at: "2026-05-21T00:00:00.000Z"
---
# Restart Worker Service

Run the restart procedure after auth repair succeeds.
`);

  await buildWikiSite(root);
  return root;
}

test.describe("wiki static site", () => {
  test("renders core static pages from file URLs without layout overflow", async ({ page }) => {
    const root = await createStaticWikiFixture();

    await page.goto(pathToFileURL(join(root, "dist/index.html")).toString());
    await expect(page.getByRole("link", { name: "PraxisBase Wiki" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Knowledge Health" })).toBeVisible();
    await expect(page.getByRole("searchbox")).toBeVisible();
    await expect(page.locator("[data-kind-filter]").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Graph" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Issues" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("link", { name: "Graph" }).click();
    await expect(page.getByRole("heading", { name: "Graph" })).toBeVisible();
    await expect(page.locator(".graph-shell")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("link", { name: "Issues" }).click();
    await expect(page.getByRole("heading", { name: "Quality Issues" })).toBeVisible();
    await expect(page.locator(".issues-shell")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto(pathToFileURL(join(root, "dist/pages/openclaw-auth-expired.html")).toString());
    await expect(page.getByRole("heading", { name: "OpenClaw Auth Expired" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Provenance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Related" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
