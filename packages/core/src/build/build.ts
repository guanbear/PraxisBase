import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readText, writeJson, writeText } from "../store/file-store.js";
import { renderInspectionHtml } from "./html.js";

async function exists(root: string, path: string): Promise<boolean> {
  try {
    await stat(join(root, path));
    return true;
  } catch {
    return false;
  }
}

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

async function listFiles(root: string, dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(join(root, dir), { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await listFiles(root, fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // directory may not exist
  }
  return results;
}

export interface BuildResult {
  bundles: string[];
  indexes: string[];
  manifest: string;
}

export async function buildStaticArtifacts(root: string): Promise<BuildResult> {
  // --- OpenClaw sandbox bundle ---
  const knownFixPath = "kb/known-fixes/openclaw-auth-expired.md";
  const knownFix = (await exists(root, knownFixPath)) ? await readText(root, knownFixPath) : "";

  const openclawBundle = {
    protocol_version: "0.1",
    id: "openclaw-sandbox",
    scenario: "openclaw",
    generated_at: new Date().toISOString(),
    known_fixes: knownFix ? [knownFixPath] : [],
    skills: ["skills/openclaw/baseline-diagnostics/SKILL.md", "skills/openclaw/auth-repair/SKILL.md"],
    forbidden_operations: ["modify production systems", "delete user workspace data", "print secrets into chat"],
    diagnostic_commands: ["openclaw status", "claude --version"],
    verification_steps: ["Run a minimal model call from the sandbox", "Confirm OpenClaw session resumes"],
    rollback_steps: ["Restore previous auth state snapshot if available"],
    escalation_conditions: ["Auth refresh fails twice", "Verification command cannot run"],
  };

  await writeJson(root, "dist/repair-bundles/openclaw-sandbox.json", openclawBundle);

  // --- K8s incident bundle contract shape (empty/static-compatible for Phase 1) ---
  const k8sManifest = {
    protocol_version: "0.1",
    bundle_id: "k8s-incident",
    generated_at: new Date().toISOString(),
    commit_sha: "",
    compatible_cli: ">=0.1.0",
    entries: [] as Array<{ signature: string; path: string; checksum: string; risk: string }>,
  };

  await writeJson(root, "dist/repair-bundles/k8s-incident/manifest.json", k8sManifest);

  // --- Top-level manifest ---
  const manifest = {
    protocol_version: "0.1",
    generated_at: new Date().toISOString(),
    bundles: [
      {
        id: "openclaw-sandbox",
        path: "repair-bundles/openclaw-sandbox.json",
        checksum: sha256(JSON.stringify(openclawBundle)),
        compatible_cli_version: "0.1.x",
      },
      {
        id: "k8s-incident",
        path: "repair-bundles/k8s-incident/manifest.json",
        checksum: sha256(JSON.stringify(k8sManifest)),
        compatible_cli_version: "0.1.x",
      },
    ],
  };

  await writeJson(root, "dist/repair-bundles/manifest.json", manifest);

  // --- Knowledge index ---
  const kbFiles = await listFiles(root, "kb");
  const kbObjects = [];
  for (const file of kbFiles) {
    if (file.endsWith(".md")) {
      const id = file.replace(/\.md$/, "").replace(/^kb\/[^/]+\//, "");
      const type = file.split("/")[1]?.replace(/s$/, "") ?? "note";
      kbObjects.push({ id, type, path: file });
    }
  }

  await writeJson(root, "dist/kb-index.json", {
    protocol_version: "0.1",
    objects: kbObjects,
  });

  // --- Search index ---
  const searchDocs = [];
  for (const obj of kbObjects) {
    try {
      const text = await readText(root, obj.path);
      searchDocs.push({ id: obj.id, text });
    } catch {
      // skip unreadable
    }
  }

  await writeJson(root, "dist/search-index.json", {
    protocol_version: "0.1",
    documents: searchDocs,
  });

  // --- llms.txt ---
  const llmsLines = [
    "# PraxisBase",
    "",
    "Agent-native knowledge substrate for OpenClaw repair workflows.",
    "",
    "## Bundles",
    "",
    `- OpenClaw repair bundle: /repair-bundles/openclaw-sandbox.json`,
    `- K8s incident bundle: /repair-bundles/k8s-incident/manifest.json`,
    "",
    "## Knowledge Objects",
    "",
  ];
  for (const obj of kbObjects) {
    llmsLines.push(`- ${obj.type}: ${obj.path}`);
  }
  llmsLines.push("");

  await writeText(root, "dist/llms.txt", llmsLines.join("\n"));

  // --- HTML inspection ---
  const bodyParts = [
    "<p>Static inspection output for repair knowledge.</p>",
    '<section class="bundle">',
    "<h2>Repair Bundles</h2>",
    "<table>",
    "<tr><th>Bundle ID</th><th>Path</th><th>Checksum</th></tr>",
  ];
  for (const b of manifest.bundles) {
    bodyParts.push(`<tr><td>${b.id}</td><td>${b.path}</td><td>${b.checksum.slice(0, 20)}...</td></tr>`);
  }
  bodyParts.push("</table>");
  bodyParts.push("</section>");

  bodyParts.push("<h2>Knowledge Objects</h2>");
  bodyParts.push("<table>");
  bodyParts.push("<tr><th>ID</th><th>Type</th><th>Path</th></tr>");
  for (const obj of kbObjects) {
    bodyParts.push(`<tr><td>${obj.id}</td><td>${obj.type}</td><td>${obj.path}</td></tr>`);
  }
  bodyParts.push("</table>");

  await writeText(
    root,
    "dist/index.html",
    renderInspectionHtml({
      title: "PraxisBase OpenClaw Repair MVP",
      body: bodyParts.join("\n"),
    })
  );

  return {
    bundles: [
      "dist/repair-bundles/openclaw-sandbox.json",
      "dist/repair-bundles/k8s-incident/manifest.json",
    ],
    indexes: ["dist/kb-index.json", "dist/search-index.json"],
    manifest: "dist/repair-bundles/manifest.json",
  };
}
