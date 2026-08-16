import {
  array,
  type InferInput,
  literal,
  looseObject,
  number,
  object,
  optional,
  string,
  union,
} from "valibot";

/** Actor placed on the ground plane (type C: x/z coords; y derived from scale). */
const actorSchemaV1 = object({
  characterId: string(),
  pose: string(),
  position: object({ x: number(), z: number() }),
  scale: optional(number()),
  /** Character sprite generation config (portrait 512×768). Optional: actors without it fall back to placeholders. */
  sprite: optional(
    object({
      /** Cache key → generated portrait image. */
      assetKey: string(),
      /** Character generation prompt (feeds the AssetCache). */
      prompt: optional(string()),
      /** Negative prompt — also a cache-key component (busts on change). */
      negativePrompt: optional(string()),
    }),
  ),
});

/**
 * Scene manifest schema v1 (tech-spec §5.3), extended for type C:
 * camera fov/height/pitch, floor asset + placement, backdrop placement,
 * actors with ground-plane x/z coordinates. Existing type-A fields stay.
 * Validated at load by the loader.
 */
export const sceneManifestSchemaV1 = object({
  schemaVersion: literal(1),
  /** Stable scene id — cache/payload key. */
  id: string(),
  type: union([literal("A"), literal("B"), literal("C")]),
  backdrop: object({
    /** Cache key → generated image (dev/prod modes). */
    assetKey: string(),
    /** Image generation prompt (the plugin prompt; feeds the AssetCache). */
    prompt: optional(string()),
    /** Visual description for the narrator payload. */
    description: string(),
    /** Backdrop plane placement (type C). */
    depth: optional(number()),
    height: optional(number()),
    scale: optional(number()),
  }),
  effects: array(
    object({
      kind: string(),
      // Effect-specific params (particles/fog/lighting/dayNight) land here later.
      params: looseObject({}),
    }),
  ),
  actors: array(actorSchemaV1),
  transitions: optional(
    object({
      enter: string(),
      exit: string(),
    }),
  ),
  floor: optional(
    object({
      /** Ground texture cache key (type C). */
      assetKey: optional(string()),
      /** Ground image generation prompt (type C). */
      prompt: optional(string()),
      /** Ground plane placement (type C). */
      depth: optional(number()),
      scale: optional(number()),
      /** Type-A de-risking hooks (kept for fallback scenes). */
      line: optional(number()),
      scaleAnchor: optional(
        object({
          x: number(),
          y: number(),
          size: number(),
        }),
      ),
    }),
  ),
  camera: object({
    mode: literal("fixed"),
    /** Fixed-camera parameters (type C). */
    fov: optional(number()),
    height: optional(number()),
    pitch: optional(number()),
  }),
});

export type SceneManifest = InferInput<typeof sceneManifestSchemaV1>;
