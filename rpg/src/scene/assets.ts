import type { AssetCache } from "../services/generation";
import type { SceneManifest } from "./types";

export interface SceneTextures {
  backdrop: string;
  floor: string;
  /** Generated character portraits, keyed by characterId (portrait 512×768). */
  actors: Record<string, string>;
}

/**
 * Resolves a type-C manifest's asset keys to pixels via the AssetCache.
 * Each plane/actor is generated under its own pose so re-rolls stay
 * independent. Actors without a sprite config keep placeholders (no entry
 * in the actors map).
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

  // Planes request landscape 768×512 (guide §7) — the only size that maps
  // 1:1 onto the 3:2 scene frame (viewport.ts SCENE_FRAME). The plugin's
  // default 512×512 would stretch ~1.5× horizontally on the 3:2 planes
  // (Perchance round 2 finding).
  const [backdrop, floor] = await Promise.all([
    assets.getOrGenerate({
      entity: manifest.id,
      pose: "backdrop",
      prompt: manifest.backdrop.prompt,
      seed: `${manifest.id}:backdrop:v1`,
      resolution: "768x512",
    }),
    assets.getOrGenerate({
      entity: manifest.id,
      pose: "floor",
      prompt: manifest.floor.prompt,
      seed: `${manifest.id}:floor:v1`,
      resolution: "768x512",
    }),
  ]);

  // Character portraits: portrait 512×768 (guide §7) so the sprite plane
  // maps 1:1 — a landscape 768×512 would distort on the 2:3 plane.
  const actors: Record<string, string> = {};
  await Promise.all(
    manifest.actors.flatMap((actor) => {
      const prompt = actor.sprite?.prompt;
      if (!actor.sprite?.assetKey || !prompt) return [];
      return [
        assets
          .getOrGenerate({
            entity: actor.characterId,
            pose: actor.pose,
            prompt,
            seed: `${manifest.id}:${actor.characterId}:${actor.pose}:v1`,
            resolution: "512x768",
          })
          .then((result) => {
            actors[actor.characterId] = result.dataUrl;
          }),
      ];
    }),
  );

  return { backdrop: backdrop.dataUrl, floor: floor.dataUrl, actors };
}
