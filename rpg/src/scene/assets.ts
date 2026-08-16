import { removeBackgroundClient } from "../services/bg-removal";
import type { AssetCache } from "../services/generation";
import { cleanSpriteMatte } from "./sprite-matte";
import { buildOutlineDataUrl } from "./sprite-outline";
import type { SceneManifest } from "./types";

/** Per-actor textures: the cut-out sprite plus its black outline plane. */
export interface ActorTextures {
  sprite: string;
  outline: string;
}

export interface SceneTextures {
  backdrop: string;
  floor: string;
  /** Generated character portraits, keyed by characterId (portrait 512×768). */
  actors: Record<string, ActorTextures>;
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
  //
  // Background removal (vn-rpg-spec §4.1):
  // - prod: the plugin generates RAW (no removeBackground — the platform's
  //   removal is dirty, round 3) on the solid-black background the prompts
  //   request; RMBG-1.4 runs client-side via transformers.js. The singleton
  //   model promise is the wait queue: a sprite generated before the model
  //   finished loading simply waits. If the model fails (e.g. the model CDN
  //   is unreachable inside the platform iframe), fall back to the plugin's
  //   removeBackground (different cache key → fresh generation).
  // - dev: the mock's placeholders are already cut-outs; keep the plugin
  //   removal flag for parity and skip the client model (no 45 MB download).
  // Both modes then run the matte cleanup (fringe/spill polish) and build
  // the black outline texture (sprite-outline.ts).
  const actors: Record<string, ActorTextures> = {};
  await Promise.all(
    manifest.actors.flatMap((actor) => {
      const prompt = actor.sprite?.prompt;
      if (!actor.sprite?.assetKey || !prompt) return [];
      const generate = (removeBackground: boolean) =>
        assets.getOrGenerate({
          entity: actor.characterId,
          pose: actor.pose,
          prompt,
          seed: `${manifest.id}:${actor.characterId}:${actor.pose}:v1`,
          resolution: "512x768",
          removeBackground,
        });

      return [
        (async () => {
          let spriteUrl: string;
          if (assets.mode === "prod") {
            try {
              const raw = await generate(false);
              spriteUrl = await removeBackgroundClient(raw.dataUrl);
            } catch (error) {
              console.warn(
                "bg-removal: client-side removal failed — falling back to the platform removal",
                error,
              );
              const fallback = await generate(true);
              spriteUrl = fallback.dataUrl;
            }
          } else {
            const mock = await generate(true);
            spriteUrl = mock.dataUrl;
          }
          const cleaned = await cleanSpriteMatte(spriteUrl);
          const outline = await buildOutlineDataUrl(cleaned);
          actors[actor.characterId] = { sprite: cleaned, outline };
        })(),
      ];
    }),
  );

  return { backdrop: backdrop.dataUrl, floor: floor.dataUrl, actors };
}
