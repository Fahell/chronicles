/**
 * Shared character-sprite generation constants (removal-pipeline-spec §7).
 *
 * Sprites are generated on a SOLID PURE BLACK background (prompt-first lever
 * from round 7): RMBG-1.4 segments any background, but the platform fallback
 * path needs the black to be explicit. The negative prompt is a cache-key
 * component (busts sprites — intended).
 */

/** The D5 pure-black sentence appended to every character sprite prompt. */
export const SPRITE_BLACK_BACKGROUND =
  "The ENTIRE background behind the figure must be 100% pure solid black — every single pixel exactly #000000 — flat and uniform across every corner and every edge, with zero gradient, zero vignette, zero grey, zero dark-grey, zero off-black, zero shadow, zero floor line, zero props, zero rim light and zero texture variation anywhere in the background. The figure must be fully contained inside the frame, standing centered, full body visible from head to feet, crisp clean silhouette edge. No text, no UI, no watermark, no noise.";

export const SPRITE_NEGATIVE_PROMPT =
  "gradient, vignette, floor shadow, background props, rim light, background texture, noise, text, watermark, grey background, gray background, dark grey, off-black, white background, mottled background, dirty background, midtones in background";

/** Opens a character sprite prompt with the shared open-plains visual style. */
export function openPlainsSpritePrefix(subject: string): string {
  return `Pixel-art character sprite of ${subject}, full body, standing pose, facing forward, designed as a 2D papercraft character placed in a 3D visual-novel scene. Hand-painted 16-bit/32-bit pixel art, consistent pixel scale, clean readable silhouette, soft cool blue-green shadows with warm pale-gold rim highlights matching a twilight open-plains landscape. Centered, full figure visible from head to feet, calm neutral standing pose. `;
}

/** Full character sprite prompt: shared style + subject + pure-black background. */
export function characterSpritePrompt(subject: string): string {
  return `${openPlainsSpritePrefix(subject)}${SPRITE_BLACK_BACKGROUND}`;
}
