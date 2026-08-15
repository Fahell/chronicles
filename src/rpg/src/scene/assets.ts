import type { AssetCache } from "../services/generation";
import type { SceneManifest } from "./types";

export interface SceneTextures {
  backdrop: string;
  floor: string;
}

/**
 * Resolves a type-C manifest's asset keys to pixels via the AssetCache.
 * Each plane is generated under its own pose so re-rolls stay independent.
 */
export async function resolveSceneTextures(
  manifest: SceneManifest,
  assets: AssetCache,
): Promise<SceneTextures> {
  if (manifest.type !== "C") {
    throw new Error("resolveSceneTextures: only type C is supported in this slice");
  }
  if (!manifest.floor?.assetKey || !manifest.backdrop.prompt || !manifest.floor.prompt) {
    throw new Error("resolveSceneTextures: type-C manifest needs floor + backdrop prompts");
  }

  const [backdrop, floor] = await Promise.all([
    assets.getOrGenerate({
      entity: manifest.id,
      pose: "backdrop",
      prompt: manifest.backdrop.prompt,
      seed: `${manifest.id}:backdrop:v1`,
    }),
    assets.getOrGenerate({
      entity: manifest.id,
      pose: "floor",
      prompt: manifest.floor.prompt,
      seed: `${manifest.id}:floor:v1`,
    }),
  ]);

  return { backdrop: backdrop.dataUrl, floor: floor.dataUrl };
}
