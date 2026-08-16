/**
 * Sprite outline / black border (vn-rpg-spec §4.1 — owner direction).
 *
 * After background removal, the character gets a solid black outline so it
 * stands out against the scene: the sprite's alpha silhouette is grown by a
 * few pixels (separable box dilation), filled black, and rendered as a
 * slightly-behind plane in the 3D stage. Pure pixel math in `dilateAlpha`
 * (unit-tested in node); the thin canvas wrapper `buildOutlineDataUrl`
 * produces the outline texture in the browser.
 */

export interface OutlineOptions {
  /** Silhouette growth in pixels. Default 5 (subtle at 512px-wide sprites). */
  radius?: number;
  /** Alpha (0..255) above which a pixel counts as silhouette. Default 16. */
  alphaThreshold?: number;
  /**
   * Minimum size (ratio of total pixels) for a connected silhouette
   * component to survive; smaller detached specks are dropped BEFORE the
   * dilation so they never become outline blocks. Default 0.001 (0.1%).
   */
  minComponentRatio?: number;
}

/** Default minimum component size as a fraction of total pixels (0.1%). */
export const DEFAULT_MIN_COMPONENT_RATIO = 0.001;

/**
 * Grows the silhouette by `radius` pixels and returns a binary mask
 * (0/1 per pixel: 1 = outline pixel). Two-pass separable box dilation
 * (horizontal then vertical max-filter) — exact for a square kernel and
 * crisp for pixel-art edges (no blur).
 */
/**
 * Drops disconnected silhouette components smaller than `minArea` pixels
 * (iterative flood fill — no recursion). Used to keep residual removal
 * speckles out of the sprite AND the outline.
 */
export function filterSmallComponents(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  minArea: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  for (let start = 0; start < mask.length; ++start) {
    if (!mask[start] || visited[start]) continue;
    visited[start] = 1;
    stack.length = 0;
    stack.push(start);
    const component: number[] = [];

    while (stack.length > 0) {
      const idx = stack.pop();
      if (idx === undefined) break;
      component.push(idx);
      const x = idx % width;
      const y = (idx / width) | 0;
      if (x > 0) {
        const n = idx - 1;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (x < width - 1) {
        const n = idx + 1;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y > 0) {
        const n = idx - width;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y < height - 1) {
        const n = idx + width;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }

    if (component.length < minArea) {
      for (const idx of component) out[idx] = 0;
    }
  }
  return out;
}

export function dilateAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: OutlineOptions = {},
): Uint8ClampedArray {
  const {
    radius = 5,
    alphaThreshold = 16,
    minComponentRatio = DEFAULT_MIN_COMPONENT_RATIO,
  } = options;
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) return new Uint8ClampedArray(width * height);

  const rawMask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; ++i) {
    rawMask[i] = (data[i * 4 + 3] ?? 0) > alphaThreshold ? 1 : 0;
  }
  // Drop detached removal specks BEFORE dilation — they would otherwise grow
  // into floating black blocks in the outline (POC finding, sample B).
  const mask = filterSmallComponents(
    rawMask,
    width,
    height,
    Math.max(1, Math.round(width * height * minComponentRatio)),
  );

  const horizontal = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; ++y) {
    const row = y * width;
    for (let x = 0; x < width; ++x) {
      let hit = 0;
      for (let dx = -r; dx <= r; ++dx) {
        const nx = x + dx;
        if (nx >= 0 && nx < width && mask[row + nx]) {
          hit = 1;
          break;
        }
      }
      horizontal[row + x] = hit;
    }
  }

  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      let hit = 0;
      for (let dy = -r; dy <= r; ++dy) {
        const ny = y + dy;
        if (ny >= 0 && ny < height && horizontal[ny * width + x]) {
          hit = 1;
          break;
        }
      }
      out[y * width + x] = hit;
    }
  }

  return out;
}

/** Browser wrapper: build the black outline texture for a sprite dataUrl. */
export async function buildOutlineDataUrl(
  spriteDataUrl: string,
  options: OutlineOptions = {},
): Promise<string> {
  // Non-browser environments (node unit/integration tests) have no Image/DOM;
  // they exercise `dilateAlpha` directly instead.
  if (typeof Image === "undefined" || typeof document === "undefined") {
    return spriteDataUrl;
  }
  const image = await loadImage(spriteDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return spriteDataUrl;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mask = dilateAlpha(pixels.data, canvas.width, canvas.height, options);

  const outline = ctx.createImageData(canvas.width, canvas.height);
  const out = outline.data;
  for (let i = 0; i < mask.length; ++i) {
    if (mask[i]) {
      out[i * 4] = 0;
      out[i * 4 + 1] = 0;
      out[i * 4 + 2] = 0;
      out[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(outline, 0, 0);
  return canvas.toDataURL("image/png");
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("sprite-outline: failed to decode image"));
    image.src = dataUrl;
  });
}
