/**
 * Sprite matte cleanup (vn-rpg-spec §4.1 — Perchance round 3 finding).
 *
 * The image plugin's background removal on character sprites is not 100%
 * effective: it leaves a semi-transparent fringe ("mottled edge") and dark
 * spill remnants around the silhouette. This module trims those remnants
 * before the texture reaches the renderer:
 *
 * 1. fringe trim  — barely-transparent pixels become fully transparent;
 * 2. edge spill   — dark pixels adjacent to transparency are background
 *                   remnants (the generated sprite is asked for a solid
 *                   pure-black background), removed without touching opaque
 *                   dark clothing (which is not adjacent to transparency).
 *
 * `applyMatteCleanup` is a pure pixel function (testable in node); the thin
 * canvas wrapper `cleanSpriteMatte` converts a dataUrl in the browser.
 */

export interface MatteOptions {
  /**
   * Alpha (0..1) below which a pixel is fully trimmed to transparent.
   * Default 0.35 — matches the sprite material's alphaTest, so trimmed
   * pixels would be discarded by the renderer anyway; trimming in the
   * texture itself also removes them from mipmap/sampling edges.
   */
  fringeAlpha?: number;
  /**
   * Brightness (0..255, max of r/g/b) at or under which an edge-adjacent
   * pixel is treated as black-background spill. Default 24 (near-black).
   */
  spillLuma?: number;
}

/** Pure RGBA pass over a pixel buffer (mutates nothing; returns a copy). */
export function applyMatteCleanup(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: MatteOptions = {},
): Uint8ClampedArray {
  const { fringeAlpha = 0.35, spillLuma = 24 } = options;
  const fringe = Math.round(fringeAlpha * 255);
  const out = new Uint8ClampedArray(data);

  const alphaAt = (i: number): number => out[i + 3] ?? 0;

  // Pass 1 — fringe trim.
  for (let i = 0; i < out.length; i += 4) {
    const a = alphaAt(i);
    if (a > 0 && a < fringe) out[i + 3] = 0;
  }

  // Pass 2 — edge black-spill. Decisions are made against a snapshot of the
  // pass-1 result (never against pixels removed earlier in this pass), so a
  // dark pixel is removed only when it touches the ORIGINAL transparency —
  // the removal cannot cascade inward and eat dark clothing band by band.
  const base = out.slice();
  const transparentAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    return base[(y * width + x) * 4 + 3] === 0;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] === 0) continue;
      const luma = Math.max(out[i] ?? 0, out[i + 1] ?? 0, out[i + 2] ?? 0);
      if (luma > spillLuma) continue;
      if (
        transparentAt(x - 1, y) ||
        transparentAt(x + 1, y) ||
        transparentAt(x, y - 1) ||
        transparentAt(x, y + 1)
      ) {
        out[i + 3] = 0;
      }
    }
  }

  return out;
}

/** Browser wrapper: clean a sprite dataUrl (decodes → cleans → re-encodes). */
export async function cleanSpriteMatte(dataUrl: string): Promise<string> {
  // Non-browser environments (node unit/integration tests) have no Image/DOM;
  // they exercise `applyMatteCleanup` directly instead. In the browser this
  // is the production path for every character portrait.
  if (typeof Image === "undefined" || typeof document === "undefined") {
    return dataUrl;
  }
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const cleaned = applyMatteCleanup(imageData.data, canvas.width, canvas.height);
  imageData.data.set(cleaned);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("cleanSpriteMatte: failed to decode image"));
    image.src = dataUrl;
  });
}
