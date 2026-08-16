import type { SceneManifest } from "../types";

const groundPrompt =
  "Pixel-art ground texture for an open fantasy landscape used in a 3D visual-novel scene. A broad, nearly flat and empty grassy meadow designed to be mapped onto a horizontal Three.js floor plane. Shallow elevated viewpoint, readable depth through subtle perspective in the grass pattern, but no visible horizon and no vanishing-point composition. Keep the central area spacious and visually calm so 2D character sprites and objects can be placed there at realistic scale. Sparse short grass, small scattered pale-gold flowers, subtle pixel clusters, gentle natural variation, no large rocks or props. Cool blue-green twilight shadows with warm pale-gold highlights from distant light, matching a cinematic fantasy pixel-art landscape. Hand-painted 16-bit/32-bit pixel art, detailed but clean, consistent pixel scale, atmospheric and elegant.\n\nThe texture should appear visually continuous and tileable on all four edges, with no hard borders, no frame and no abrupt seams. Do not include sky, clouds, mountains, castle, trees, buildings, characters, creatures, furniture, paths, roads, UI, text or symbols. Do not create a foreground object composition; this must be an empty walkable ground surface.";

const backdropPrompt =
  "Wide frontal background plate for an open fantasy visual-novel scene rendered with pixel art. A vast open valley beneath a dramatic twilight sky, designed to be placed behind a separate 3D meadow floor in a Three.js scene. Fixed-camera composition, straight frontal view, no fisheye distortion and not an equirectangular panorama. The upper half is dominated by a deep blue and muted teal sky with layered luminous clouds and a few subtle stars. The distant horizon contains a misty valley and atmospheric mountains. On the right side, place a majestic distant medieval fantasy castle integrated into the mountainside; on the far left, place a few distinctive dark rocky spires. Keep the central valley and the central horizon visually open and uncluttered so the foreground characters remain readable.\n\nThe lower edge must contain only distant atmospheric terrain and soft haze, with no detailed foreground grass, no close rocks and no objects that would conflict with a separate floor texture. Establish clear depth through atmospheric perspective: distant elements are smaller, softer and less contrasted than the sky. Use the same hand-painted 16-bit/32-bit pixel-art style, consistent pixel scale, cool blue-green shadows and warm pale-gold highlights as the matching ground texture. Cinematic, coherent, painterly pixel art, suitable as a fixed background plane.\n\nDo not include characters, creatures, vehicles, user interface, text, borders or frames. Do not place any object in the immediate foreground. Do not generate a visible floor texture extending toward the viewer. The image must read as a distant landscape backdrop that can meet a separate horizontal ground plane at the horizon.";

// Sprites are generated on a SOLID PURE BLACK background. Round-5 forensics
// showed the model delivered dark-grey/white instead of pure black — the
// strengthened wording below is the D5 lever (removal-pipeline-spec §7); the
// matching negativePrompt is a cache-key component (busts sprites).
const spriteBackground =
  "The ENTIRE background behind the figure must be one single uniform solid pure black color (#000000): flat, solid, covering every corner and every edge of the image, with zero gradient, zero vignette, zero shadow, zero floor line, zero props, zero rim light and zero texture variation in the background. The figure must be fully contained inside the frame, standing centered, full body visible from head to feet. No text, no UI, no watermark.";

const spriteNegativePrompt =
  "gradient, vignette, floor shadow, background props, rim light, background texture, noise, text, watermark";

const elderPrompt = `Pixel-art character sprite of an elderly village elder, full body, standing pose, facing forward, designed as a 2D papercraft character placed in a 3D visual-novel scene. Weathered hooded robe in muted teal and grey, long white beard, wooden staff, kind but tired eyes. Hand-painted 16-bit/32-bit pixel art, consistent pixel scale, clean readable silhouette, soft cool blue-green shadows with warm pale-gold rim highlights matching a twilight open-plains landscape. Centered, full figure visible from head to feet, calm neutral standing pose. ${spriteBackground}`;

const playerPrompt = `Pixel-art character sprite of a young traveler, full body, standing pose, facing forward, designed as a 2D papercraft character placed in a 3D visual-novel scene. Simple adventurer tunic in warm ochre, hooded cloak, small satchel, sturdy boots. Hand-painted 16-bit/32-bit pixel art, consistent pixel scale, clean readable silhouette, soft cool blue-green shadows with warm pale-gold rim highlights matching a twilight open-plains landscape. Centered, full figure visible from head to feet, calm neutral standing pose. ${spriteBackground}`;

export const openPlainsManifest = {
  schemaVersion: 1,
  id: "scene.open.plains",
  type: "C",
  backdrop: {
    assetKey: "scenes/open-plains/backdrop",
    prompt: backdropPrompt,
    description:
      "A vast open valley beneath a twilight sky; a distant castle on the right, rocky spires on the left; the central horizon stays open and readable.",
    depth: -10,
    height: 6.3,
    scale: 1,
  },
  floor: {
    assetKey: "scenes/open-plains/floor",
    prompt: groundPrompt,
    // Far edge lands at -10.05 — 0.05 behind the backdrop plane (-10) — so
    // the floor meets the backdrop with no seam (see layout.ts invariants).
    depth: -2.35,
    scale: 0.7,
  },
  effects: [],
  actors: [
    {
      characterId: "player",
      pose: "idle",
      position: { x: 0.1, z: -0.9 },
      scale: 0.95,
      sprite: {
        assetKey: "characters/player/idle",
        prompt: playerPrompt,
        negativePrompt: spriteNegativePrompt,
      },
    },
    {
      characterId: "npc/elder",
      pose: "idle",
      position: { x: -2.2, z: -3.8 },
      scale: 0.9,
      sprite: {
        assetKey: "characters/elder/idle",
        prompt: elderPrompt,
        negativePrompt: spriteNegativePrompt,
      },
    },
  ],
  camera: { mode: "fixed", fov: 52, height: 2, pitch: 2 },
} satisfies SceneManifest;
