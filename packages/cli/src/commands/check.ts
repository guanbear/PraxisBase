import { stat } from "node:fs/promises";
import { join } from "node:path";

const REQUIRED_PATHS = [
  ".praxisbase/config.yaml",
  ".praxisbase/policies/autonomy.yaml",
  ".praxisbase/policies/risk-rules.yaml",
  ".praxisbase/inbox/episodes",
  ".praxisbase/inbox/proposals",
];

async function exists(root: string, path: string): Promise<boolean> {
  try {
    await stat(join(root, path));
    return true;
  } catch {
    return false;
  }
}

export async function checkCommand(root: string): Promise<void> {
  for (const path of REQUIRED_PATHS) {
    if (!(await exists(root, path))) {
      throw new Error(`Workspace check failed: missing ${path}`);
    }
  }

  const hasOpenClawSeeds = await exists(root, "skills/openclaw/baseline-diagnostics/SKILL.md");
  const hasK8sSeeds = await exists(root, "skills/k8s/incident-triage/SKILL.md");

  if (!hasOpenClawSeeds && !hasK8sSeeds) {
    throw new Error("Workspace check failed: missing at least one supported skills profile");
  }
}
