/**
 * Shared character-sprite generation constants (removal-pipeline-spec §7;
 * round-9 owner decision: white background + baked ground shadow).
 *
 * The sprite is generated on a SOLID PURE WHITE background with the
 * character's ground shadow baked into the image (cast to one side or
 * directly under the body). After background removal the shadow survives
 * with the sprite, so the character reads grounded in the scene no matter
 * where the generator placed the feet inside the frame — replacing the old
 * pure-black background + code-drawn shadow (which floated when the feet sat
 * above the image base). RMBG-1.4 segments any background; the explicit
 * white matters for the platform-fallback path. The negative prompt is a
 * cache-key component (busts sprites — intended).
 */

/** The D5 white-background + baked-shadow sentence appended to every sprite prompt. */
export const SPRITE_WHITE_GROUNDED_BACKGROUND =
  "The ENTIRE background behind the figure must be 100% pure solid white — every single pixel exactly #FFFFFF — flat and uniform across every corner and every edge, with zero gradient, zero vignette, zero grey, zero off-white, zero rim light, zero props and zero texture variation anywhere in the background. The figure stands firmly on the ground with a soft, visible ground shadow cast directly beneath and around the feet — a soft dark ellipse under the body or a soft shadow cast to one side — so the character clearly touches the ground. The figure must be fully contained inside the frame, standing centered, full body visible from head to feet, crisp clean silhouette edge. No text, no UI, no watermark, no noise.";

export const SPRITE_NEGATIVE_PROMPT =
  "gradient, vignette, background props, rim light, background texture, noise, text, watermark, black background, dark background, grey background, gray background, mottled background, dirty background, midtones in background";

/** Opens a character sprite prompt with the shared open-plains visual style. */
export function openPlainsSpritePrefix(subject: string): string {
  return `Pixel-art character sprite of ${subject}, full body, standing pose, facing forward, designed as a 2D papercraft character placed in a 3D visual-novel scene. Hand-painted 16-bit/32-bit pixel art, consistent pixel scale, clean readable silhouette, soft cool blue-green shadows with warm pale-gold rim highlights matching a twilight open-plains landscape. Centered, full figure visible from head to feet, calm neutral standing pose. `;
}

/** Full character sprite prompt: shared style + subject + white bg + baked shadow. */
export function characterSpritePrompt(subject: string): string {
  return `${openPlainsSpritePrefix(subject)}${SPRITE_WHITE_GROUNDED_BACKGROUND}`;
}

/**
 * Bust portrait prompt (round-10 owner decision): head + shoulders, neutral
 * expression, pure white background, SAME pixel-art style as the sprite.
 * Portraits are NOT background-removed — the white stays and the portrait
 * sits in a frame inside the dialogue box (vn-rpg-spec §3.7). No baked
 * ground shadow (not grounded in a scene; the white is the frame backing).
 */
export function characterPortraitPrompt(subject: string): string {
  return `Pixel-art bust portrait of ${subject}, head and shoulders only, facing forward, calm neutral expression, framed like a classic visual-novel character portrait. Hand-painted 16-bit/32-bit pixel art, consistent pixel scale, clean readable silhouette, soft cool blue-green shadows with warm pale-gold rim highlights matching a twilight open-plains landscape. The ENTIRE background behind the figure must be 100% pure solid white — every single pixel exactly #FFFFFF — flat and uniform across every corner and every edge, with zero gradient, zero vignette, zero grey, zero off-white, zero rim light, zero props and zero texture variation anywhere in the background. The figure's head and shoulders must be fully contained inside the frame, centered, crisp clean silhouette edge. No text, no UI, no watermark, no noise.`;
}
