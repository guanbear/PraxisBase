import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import matter from "gray-matter";
import { readText, writeJson, writeText } from "../store/file-store.js";
import { renderInspectionHtml } from "./html.js";
import { PROTOCOL_VERSION } from "../protocol/types.js";
import type { RunRecord } from "../protocol/schemas.js";
import { protocolPaths } from "../protocol/paths.js";

type KnowledgeProfile = "all" | "openclaw" | "k8s";

async function exists(root: string, path: string): Promise<boolean> {
  try {
    await stat(join(root, path));
    return true;
  } catch {
    return false;
  }
}

async function readKnowledgeProfile(root: string): Promise<KnowledgeProfile> {
  try {
    const config = await readText(root, ".praxisbase/config.yaml");
    const match = config.match(/^profile:\s*(all|openclaw|k8s)\s*$/m);
    return (match?.[1] as KnowledgeProfile | undefined) ?? "all";
  } catch {
    return "all";
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

function extractSections(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  const parts = body.split(/^## /m);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    if (newline === -1) continue;
    const heading = part.slice(0, newline).trim();
    result[heading] = part.slice(newline + 1).trim();
  }
  return result;
}

function splitLines(text: string | undefined): string[] {
  if (!text) return [];
  return text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}

export interface BuildResult {
  bundles: string[];
  indexes: string[];
  manifest: string;
}

export async function buildStaticArtifacts(root: string): Promise<BuildResult> {
  const buildStartedAt = new Date().toISOString();
  const profile = await readKnowledgeProfile(root);
  const buildOpenClaw = profile !== "k8s";
  const buildK8s = profile !== "openclaw";
  const builtBundles: string[] = [];
  const manifestBundles: Array<{
    id: string;
    path: string;
    checksum: string;
    compatible_cli_version: string;
  }> = [];

  if (buildOpenClaw) {
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
    builtBundles.push("dist/repair-bundles/openclaw-sandbox.json");
    manifestBundles.push({
      id: "openclaw-sandbox",
      path: "repair-bundles/openclaw-sandbox.json",
      checksum: sha256(JSON.stringify(openclawBundle)),
      compatible_cli_version: "0.1.x",
    });
  }

  if (buildK8s) {
    const k8sForbiddenOps = [
      "Do not automatically delete pods in production",
      "Do not change resource limits without owner approval",
      "Do not modify production Kubernetes resources without explicit owner approval",
    ];

    const k8sManifest = {
      protocol_version: "0.1",
      bundle_id: "k8s-incident",
      generated_at: new Date().toISOString(),
      commit_sha: "",
      compatible_cli: ">=0.1.0",
      entries: [] as Array<{ signature: string; path: string; checksum: string; risk: string }>,
    };

    const kbFilesAll = await listFiles(root, "kb");
    for (const file of kbFilesAll) {
      if (!file.startsWith("kb/known-fixes/") || !file.endsWith(".md")) continue;
      const content = await readText(root, file);
      const parsed = matter(content);
      const data = parsed.data as Record<string, unknown>;
      const signatures = Array.isArray(data.signatures) ? data.signatures as string[] : [];
      const k8sSigs = signatures.filter((s: string) => s.startsWith("k8s:"));
      if (k8sSigs.length === 0) continue;

      const body = parsed.content as string;
      const sections = extractSections(body);

      for (const sig of k8sSigs) {
        const slug = sig.replace("k8s:", "");
        const skills = Array.isArray(data.skills) ? data.skills as string[] : [];
        const sources = Array.isArray(data.sources) ? (data.sources as Array<{ uri: string; hash: string }>) : [];
        const fixId = String(data.id ?? slug);
        const entry = {
          protocol_version: "0.1",
          signature: sig,
          domain: "k8s",
          status: String(data.status ?? "draft"),
          risk: String(data.risk ?? "medium"),
          recommendation_only: true,
          known_fixes: [{
            id: fixId,
            summary: sections.Symptoms ?? `Known fix for ${sig}`,
            diagnosis_steps: splitLines(sections.Diagnosis),
            remediation_guidance: splitLines(sections.Fix),
            verification_steps: splitLines(sections.Verification),
            forbidden_operations: k8sForbiddenOps,
            source_refs: sources.map((s) => s.uri),
          }],
          skills,
          forbidden_operations: k8sForbiddenOps,
          verification_steps: splitLines(sections.Verification).length > 0
            ? splitLines(sections.Verification)
            : ["Confirm diagnosis matches observed symptoms"],
          source_refs: sources.map((s) => s.uri),
          escalation_conditions: ["Diagnosis inconclusive after initial triage", "Multiple pods affected simultaneously"],
        };
        const entryPath = `k8s-incident/${slug}.json`;
        const writtenContent = `${JSON.stringify(entry, null, 2)}
`;
        await writeJson(root, `dist/repair-bundles/${entryPath}`, entry);
        k8sManifest.entries.push({
          signature: sig,
          path: entryPath,
          checksum: sha256(writtenContent),
          risk: entry.risk,
        });
      }
    }

    await writeJson(root, "dist/repair-bundles/k8s-incident/manifest.json", k8sManifest);
    builtBundles.push("dist/repair-bundles/k8s-incident/manifest.json");
    manifestBundles.push({
      id: "k8s-incident",
      path: "repair-bundles/k8s-incident/manifest.json",
      checksum: sha256(JSON.stringify(k8sManifest)),
      compatible_cli_version: "0.1.x",
    });
  }

  const manifest = {
    protocol_version: "0.1",
    generated_at: new Date().toISOString(),
    profile,
    bundles: manifestBundles,
  };

  await writeJson(root, "dist/repair-bundles/manifest.json", manifest);

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

  const llmsLines = [
    "# PraxisBase",
    "",
    "Agent-native knowledge substrate for OpenClaw repair workflows.",
    "",
    "## Bundles",
    "",
  ];
  if (buildOpenClaw) llmsLines.push("- OpenClaw repair bundle: /repair-bundles/openclaw-sandbox.json");
  if (buildK8s) llmsLines.push("- K8s incident bundle: /repair-bundles/k8s-incident/manifest.json");
  llmsLines.push("", "## Knowledge Objects", "");
  for (const obj of kbObjects) {
    llmsLines.push(`- ${obj.type}: ${obj.path}`);
  }
  llmsLines.push("");

  await writeText(root, "dist/llms.txt", llmsLines.join("\n"));

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

  const buildRun: RunRecord = {
    id: `run_build_${randomUUID().slice(0, 8)}`,
    protocol_version: PROTOCOL_VERSION,
    command: "build",
    status: "completed",
    started_at: buildStartedAt,
    finished_at: new Date().toISOString(),
    counts: { bundles: builtBundles.length, kb_objects: kbObjects.length },
    errors: [],
  };
  await mkdir(join(root, protocolPaths.runsBuild), { recursive: true });
  await writeJson(root, `${protocolPaths.runsBuild}/${buildRun.id}.json`, buildRun);

  return {
    bundles: builtBundles,
    indexes: ["dist/kb-index.json", "dist/search-index.json"],
    manifest: "dist/repair-bundles/manifest.json",
  };
}
