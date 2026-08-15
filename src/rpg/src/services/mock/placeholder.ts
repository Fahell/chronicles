import { fnv1a } from "../hash";

export interface PlaceholderOptions {
  width?: number;
  height?: number;
}

/**
 * Deterministic placeholder image, seeded by the given string (the cache
 * key). In the browser it renders a real canvas (guide §3.6 pattern); in
 * node (tests) it falls back to an equally deterministic SVG data URL so the
 * mock works everywhere. Same seed → same output within an environment.
 */
export function placeholderDataUrl(seed: string, options: PlaceholderOptions = {}): string {
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const hash = fnv1a(seed);

  // Two hues derived from the hash so related seeds stay visually distinct.
  const hueA = Number.parseInt(hash.slice(0, 4), 16) % 360;
  const hueB = (hueA + 40) % 360;

  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    return canvasPlaceholder(seed, width, height, hueA, hueB);
  }
  return svgPlaceholder(seed, width, height, hueA, hueB);
}

function canvasPlaceholder(
  seed: string,
  width: number,
  height: number,
  hueA: number,
  hueB: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return svgPlaceholder(seed, width, height, hueA, hueB);

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, `hsl(${hueA} 45% 28%)`);
  bg.addColorStop(1, `hsl(${hueB} 50% 40%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Diagonal band pattern derived from the seed (pixel-art friendly).
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = Math.max(3, width / 24);
  for (let x = -height; x < width; x += width / 4) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `${Math.max(10, width / 16)}px monospace`;
  ctx.fillText(seed.slice(0, 18), 10, 22);

  return canvas.toDataURL("image/png");
}

function svgPlaceholder(
  seed: string,
  width: number,
  height: number,
  hueA: number,
  hueB: number,
): string {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<defs>`,
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="hsl(${hueA} 45% 28%)"/>`,
    `<stop offset="1" stop-color="hsl(${hueB} 50% 40%)"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="100%" height="100%" fill="url(#g)"/>`,
    `<g stroke="rgba(255,255,255,0.14)" stroke-width="${Math.max(3, width / 24)}">`,
    `<line x1="${-height}" y1="${height}" x2="0" y2="0"/>`,
    `<line x1="${width / 4 - height}" y1="${height}" x2="${width / 4}" y2="0"/>`,
    `<line x1="${width / 2 - height}" y1="${height}" x2="${width / 2}" y2="0"/>`,
    `<line x1="${(3 * width) / 4 - height}" y1="${height}" x2="${(3 * width) / 4}" y2="0"/>`,
    `</g>`,
    `<text x="10" y="22" font-family="monospace" font-size="${Math.max(10, width / 16)}" fill="rgba(255,255,255,0.85)">${seed.slice(0, 18)}</text>`,
    `</svg>`,
  ].join("");

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
