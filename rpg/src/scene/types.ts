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

/** Scene manifest schema v1 (tech-spec §5.3). Validated at load by the loader. */
export const sceneManifestSchemaV1 = object({
  schemaVersion: literal(1),
  /** Stable scene id — cache/payload key. */
  id: string(),
  type: union([literal("A"), literal("B"), literal("C")]),
  backdrop: object({
    /** Cache key → generated image (dev/prod modes). */
    assetKey: string(),
    /** Visual description for the narrator payload. */
    description: string(),
  }),
  effects: array(
    object({
      kind: string(),
      // Effect-specific params (particles/fog/lighting/dayNight) land here later.
      params: looseObject({}),
    }),
  ),
  actors: array(
    object({
      characterId: string(),
      pose: string(),
      position: object({ x: number(), y: number() }),
      depth: number(),
    }),
  ),
  transitions: optional(
    object({
      enter: string(),
      exit: string(),
    }),
  ),
  floor: optional(
    object({
      /** Pixel row of the floor plane (type-A de-risking hook). */
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
  }),
});

export type SceneManifest = InferInput<typeof sceneManifestSchemaV1>;
