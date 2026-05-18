import { stat } from "node:fs/promises";
import { join } from "node:path";

const REQUIRED_PATHS = [
  ".praxisbase/config.yaml",
  "skills/openclaw/baseline-diagnostics/SKILL.md",
];

export async function checkCommand(root: string): Promise<void> {
  for (const path of REQUIRED_PATHS) {
    try {
      await stat(join(root, path));
    } catch {
      throw new Error(`Workspace check failed: missing ${path}`);
    }
  }
}
