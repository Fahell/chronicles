import { safeParse } from "valibot";

import { type SceneManifest, sceneManifestSchemaV1 } from "./types";

/**
 * Validates an unknown manifest against schema v1 (tech-spec §5.3).
 * Throws with the first issue when invalid; returns the parsed manifest
 * otherwise. The loader is exercised in unit tests.
 */
export function parseSceneManifest(input: unknown): SceneManifest {
  const result = safeParse(sceneManifestSchemaV1, input);

  if (!result.success) {
    const issue = result.issues[0];
    const where = issue?.path?.map((p) => p.key).join(".") ?? "(root)";
    throw new Error(`Invalid scene manifest at ${where}: ${issue?.message ?? "unknown"}`);
  }

  return result.output;
}
