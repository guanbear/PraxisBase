import { buildStaticArtifacts } from "@praxisbase/core/build/build.js";

export async function buildCommand(root: string): Promise<void> {
  await buildStaticArtifacts(root);
}
