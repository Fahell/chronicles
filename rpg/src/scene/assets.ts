import { type BackgroundRemover, removeBackgroundClient } from "../services/bg-removal";
import type { AssetCache } from "../services/generation";
import { setBootStage, setRemovalQueue } from "../services/progress";
import { cleanSpriteMatte } from "./sprite-matte";
import { buildOutlineDataUrl } from "./sprite-outline";
import type { SceneManifest } from "./types";

/** Per-actor textures: the cut-out sprite plus its black outline plane. */
export interface ActorTextures {
  sprite: string;
  outline: string;
}

/** What identifies one character-sprite generation (cache key components). */
export interface SpriteRequest {
  /** Character id — cache-key component; must match the actor's characterId. */
  entity: string;
  pose: string;
  /** Explicit cache seed — use the identity appearanceSeed for the user
   *  sprite so the wizard-time generation is a cache hit at scene load. */
  seed: string;
  prompt: string;
  negativePrompt?: string;
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
  options: { removeBackground?: BackgroundRemover } = {},
): Promise<SceneTextures> {
  if (manifest.type !== "C") {
    throw new Error("resolveSceneTextures: only type C is supported in this slice");
  }
  if (!manifest.floor?.assetKey || !manifest.backdrop.prompt || !manifest.floor.prompt) {
    throw new Error("resolveSceneTextures: type-C manifest needs floor + backdrop prompts");
  }
  const remover = options.removeBackground ?? removeBackgroundClient;

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
  // Both modes then build the black outline texture (sprite-outline.ts).
  //
  // Prod cut-out cache (removal-pipeline-spec §3): the raw sprite resolves
  // first (cache hit/miss), then the processed cut-out is looked up by raw
  // key. Hit → skip inference entirely. Miss → RMBG + matte, stored. RMBG
  // failure → plugin removal fallback, used in-session but NEVER cached (a
  // transient model failure must recover on its own next boot).
  const actors: Record<string, ActorTextures> = {};
  const spriteActors = manifest.actors.filter((a) => a.sprite?.assetKey && a.sprite?.prompt);
  // Removal progress only exists in prod (dev mock has no client removal) —
  // keep the dev loading screen honest (no fake "Removing background…").
  const isProd = assets.mode === "prod";
  if (isProd) {
    setBootStage("removal", "Removing background…");
    setRemovalQueue(0, spriteActors.length);
  }
  let done = 0;

  await Promise.all(
    spriteActors.map(async (actor) => {
      const prompt = actor.sprite?.prompt;
      if (!actor.sprite?.assetKey || !prompt) return;
      const textures = await resolveCharacterSprite(
        assets,
        {
          entity: actor.characterId,
          pose: actor.pose,
          prompt,
          seed: actor.sprite?.seed ?? `${manifest.id}:${actor.characterId}:${actor.pose}:v1`,
          negativePrompt: actor.sprite?.negativePrompt,
        },
        remover,
      );
      actors[actor.characterId] = textures;
      if (isProd) {
        done += 1;
        setRemovalQueue(done, spriteActors.length);
        console.log(
          `[rpg] bg-removal: ${actor.characterId} ready (${done}/${spriteActors.length})`,
        );
      }
    }),
  );

  setBootStage("polish", "Polishing sprites…");
  return { backdrop: backdrop.dataUrl, floor: floor.dataUrl, actors };
}

/**
 * Resolves ONE character bust portrait (round 10, vn-rpg-spec §3.7): the
 * portrait is generated on a PURE WHITE background and is NEVER
 * background-removed — the white is the frame backing inside the dialogue
 * box (portraits skip the RMBG pipeline entirely; the raw asset is the final
 * asset). Same pixel-art style as the sprite, pose `portrait`, 512×768.
 * The seed matches the character's sprite seed so re-rolls regenerate both
 * together (round-10 owner decision).
 */
export async function resolvePortrait(
  assets: AssetCache,
  req: { entity: string; seed: string; prompt: string },
): Promise<string> {
  const cached = await assets.getOrGenerate({
    entity: req.entity,
    pose: "portrait",
    prompt: req.prompt,
    seed: req.seed,
    resolution: "512x768",
  });
  return cached.dataUrl;
}

/**
 * Resolves ONE character sprite end-to-end (raw → cut-out → outline):
 * - prod: raw generation (no plugin removal — the platform's is dirty, round
 *   3) on the solid-black prompt background; client-side RMBG-1.4 via the
 *   wait-queue remover; matte-clean; cut-out cached by raw key. RMBG failure
 *   → plugin-removal fallback (never cached, still matte-cleaned — round 6).
 * - dev: the mock's placeholder is already a cut-out.
 * Both modes then build the black outline texture (sprite-outline.ts).
 * Used by scene actors, the identity wizard sprite, and re-rolls (a fresh
 * seed busts the raw key → the full pipeline re-runs, vn-rpg-spec §4.3).
 */
export async function resolveCharacterSprite(
  assets: AssetCache,
  req: SpriteRequest,
  remover: BackgroundRemover = removeBackgroundClient,
): Promise<ActorTextures> {
  const generate = (removeBackground: boolean) =>
    assets.getOrGenerate({
      entity: req.entity,
      pose: req.pose,
      prompt: req.prompt,
      seed: req.seed,
      resolution: "512x768",
      removeBackground,
      negativePrompt: req.negativePrompt,
    });

  let spriteUrl: string;
  if (assets.mode === "prod") {
    const raw = await generate(false);
    const cached = await assets.cutouts.get(raw.key);
    if (cached) {
      console.log(`[rpg] cutout-cache: hit ${req.entity} (skip inference)`);
      spriteUrl = cached;
    } else {
      console.log(`[rpg] cutout-cache: miss ${req.entity} → removing`);
      try {
        const removed = await remover(raw.dataUrl);
        spriteUrl = await cleanSpriteMatte(removed);
        await assets.cutouts.put(raw.key, spriteUrl);
      } catch (error) {
        console.warn(
          "bg-removal: client-side removal failed — falling back to the platform removal",
          error,
        );
        const fallback = await generate(true);
        spriteUrl = await cleanSpriteMatte(fallback.dataUrl);
      }
    }
  } else {
    const mock = await generate(true);
    spriteUrl = mock.dataUrl;
  }
  const outline = await buildOutlineDataUrl(spriteUrl);
  return { sprite: spriteUrl, outline };
}
