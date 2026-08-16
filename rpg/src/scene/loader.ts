import { safeParse } from "valibot";

import { createEffects } from "../effects";
import type { Stage } from "../render/stage";
import { createThreeStage } from "../render/three-stage";
import type { AssetCache } from "../services/generation";
import { resolveSceneTextures } from "./assets";
import { computeSceneLayout } from "./layout";
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

export interface SceneLoadDeps {
  assets: AssetCache;
  container: HTMLElement;
  viewport: { width: number; height: number };
}

/**
 * Loads a type-C scene end-to-end: validate → layout → resolve textures →
 * create the lazy three.js stage → mount → resize → place actors.
 */
export async function loadScene(manifestInput: unknown, deps: SceneLoadDeps): Promise<Stage> {
  const manifest = parseSceneManifest(manifestInput);
  const layout = computeSceneLayout(manifest);
  const textures = await resolveSceneTextures(manifest, deps.assets);
  const stage = await createThreeStage(layout, deps.container);
  stage.resize(deps.viewport.width, deps.viewport.height);
  stage.setTextures(textures);
  stage.setActors(layout.actors, textures.actors);
  // Declarative overlay effects (tech-spec §5.2): created from the manifest
  // and pushed into the stage — the app's rAF loop ticks them via stage.tick.
  const effects = await createEffects(manifest.effects, deps.container, deps.viewport);
  stage.effects.push(...effects);
  return stage;
}
