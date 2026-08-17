import { Application, Container, Texture, TilingSprite } from "pixi.js";

import { sceneFrameViewport } from "../render/viewport";
import type { EffectSpec, StageEffect } from "./types";

export interface FogParams {
  color: number;
  opacity: number;
  layers: number;
  speed: number;
}

const DEFAULTS: FogParams = { color: 0x9fb4c8, opacity: 0.4, layers: 3, speed: 0.5 };

function clamp(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Pure param coercion — unit-testable in node (no pixi). */
export function fogParams(spec: Pick<EffectSpec, "params">): FogParams {
  const p = spec.params;
  return {
    color: typeof p.color === "number" ? p.color : DEFAULTS.color,
    opacity: clamp(p.opacity, DEFAULTS.opacity, 0, 1),
    layers: Math.round(clamp(p.layers, DEFAULTS.layers, 1, 6)),
    speed: clamp(p.speed, DEFAULTS.speed, 0, 4),
  };
}

/**
 * Pure layout for the low-lying fog (round-10 redesign — owner direction:
 * the original full-frame blobs washed the whole scene white). Two elements:
 *
 * - **Ground band**: a horizontal band anchored to the frame bottom, dense at
 *   the ground and fading up toward the characters' feet (~65-70% down the
 *   frame; the level camera puts the horizon at the vertical center).
 * - **Horizon veil**: a very subtle haze line at the horizon (ground ↔
 *   backdrop junction) for depth.
 *
 * `alpha` values are the sprite alphas; the texture's own vertical gradient
 * carries the fade to 0 at the top, so the effective base density is
 * `alpha × textureDensity` (≈ 0.25-0.3 with the default opacity — visible but
 * contained). Unit-testable in node (no pixi).
 */
export function fogGeometry(
  frame: { width: number; height: number },
  params: FogParams,
): {
  band: { height: number; alpha: number };
  veil: { centerY: number; height: number; alpha: number };
} {
  // Band: from the frame bottom up to just past the characters' feet.
  const bandHeight = frame.height * 0.35;
  // Params are already coerced by fogParams — clamp to [0, 1] directly.
  const alpha = (v: number) => Math.min(1, Math.max(0, v));
  return {
    band: {
      height: bandHeight,
      alpha: alpha(params.opacity * 0.8),
    },
    veil: {
      centerY: 0.5, // horizon — level camera (lookAt.y === camera.y)
      height: frame.height * 0.06,
      alpha: alpha(params.opacity * 0.25),
    },
  };
}

/**
 * Ground-band texture: soft fog puffs across the width (so the horizontal
 * drift is visible) with a vertical envelope that fades to transparent
 * toward the top — dense at the bottom edge, gone above the feet line.
 * Tiles horizontally (TilingSprite) so the drift scrolls seamlessly.
 */
function makeBandTexture(color: number, layers: number): Texture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const hex = `#${color.toString(16).padStart(6, "0")}`;

  // Horizontal puffs — variation the drift scrolls by.
  const puffCount = Math.max(2, Math.round(layers) * 2);
  for (let i = 0; i < puffCount; i++) {
    const cx = ((i + 0.5) / puffCount) * w;
    const cy = h * (0.55 + ((i % 3) - 1) * 0.18);
    const r = w * (0.22 + (i % 3) * 0.05);
    const a = 0.4 + (i % 3) * 0.14;
    const alphaHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, "0");
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `${hex}${alphaHex}`);
    g.addColorStop(1, `${hex}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Vertical envelope: opaque at the bottom edge → transparent at the top.
  const mask = ctx.createLinearGradient(0, h, 0, 0);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.55, "rgba(0,0,0,0.8)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";

  return Texture.from(canvas);
}

/**
 * Horizon-veil texture: a thin haze line — puffs across the width, envelope
 * transparent at both vertical edges and faintest-dense at the center line.
 */
function makeVeilTexture(color: number): Texture {
  const w = 512;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const hex = `#${color.toString(16).padStart(6, "0")}`;

  const puffCount = 6;
  for (let i = 0; i < puffCount; i++) {
    const cx = ((i + 0.5) / puffCount) * w;
    const cy = h / 2;
    const r = w * 0.16;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `${hex}2e`);
    g.addColorStop(1, `${hex}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Envelope: transparent at top/bottom edges, densest at the center line.
  const mask = ctx.createLinearGradient(0, 0, 0, h);
  mask.addColorStop(0, "rgba(0,0,0,0)");
  mask.addColorStop(0.5, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";

  return Texture.from(canvas);
}

/**
 * Appends an effect canvas to its container. Exported for unit tests — the
 * append is the round-9 fix: pixi v8 never auto-appends, so the fog was
 * rendering to a detached canvas (round-8 finding #12). The three.js canvas
 * is appended by the stage first, so effects mount after it and paint above
 * the 3D frame.
 */
export function attachEffectCanvas(container: HTMLElement, canvas: HTMLCanvasElement): void {
  container.appendChild(canvas);
}

/**
 * Atmospheric low-lying fog over the type-C scene frame (vn-rpg-spec §3.3).
 * A transparent PixiJS canvas is positioned exactly over the letterboxed 3:2
 * frame. Two elements drift slowly sideways (TilingSprite.tilePosition — no
 * wrap logic): a ground band anchored to the bottom (dense at the floor,
 * fading up past the characters' feet) and a subtle haze line at the
 * horizon. Driven by the app's rAF loop through update(dt) — `autoStart:
 * false`, so no second render loop.
 */
export async function createFogEffect(
  viewport: { width: number; height: number },
  rawParams: Record<string, unknown>,
  container: HTMLElement,
): Promise<StageEffect> {
  const params = fogParams({ params: rawParams });

  const app = new Application();
  await app.init({
    width: 1,
    height: 1,
    backgroundAlpha: 0,
    antialias: false,
    autoStart: false,
    preference: "webgl",
  });

  const canvas = app.canvas;
  canvas.style.position = "absolute";
  canvas.style.pointerEvents = "none";
  // Round-9 fix: pixi v8 does not auto-append — mount the canvas inside the
  // scene container so the fog actually displays (was rendering off-DOM).
  attachEffectCanvas(container, canvas);

  const root = new Container();
  app.stage.addChild(root);

  const bandTexture = makeBandTexture(params.color, params.layers);
  const veilTexture = makeVeilTexture(params.color);

  const band = new TilingSprite({ texture: bandTexture, width: 1, height: 1 });
  const veil = new TilingSprite({ texture: veilTexture, width: 1, height: 1 });
  root.addChild(band, veil);

  let frame = { width: 1, height: 1, offsetX: 0, offsetY: 0 };

  function applyFrame() {
    frame = sceneFrameViewport(viewport.width, viewport.height);
    app.renderer.resize(frame.width, frame.height);
    canvas.style.left = `${frame.offsetX}px`;
    canvas.style.top = `${frame.offsetY}px`;

    const g = fogGeometry(frame, params);

    band.anchor.set(0.5, 1); // anchored to the frame bottom edge
    band.position.set(frame.width / 2, frame.height);
    band.width = frame.width;
    band.height = g.band.height;
    band.alpha = g.band.alpha;

    veil.anchor.set(0.5, 0.5);
    veil.position.set(frame.width / 2, frame.height * g.veil.centerY);
    veil.width = frame.width;
    veil.height = g.veil.height;
    veil.alpha = g.veil.alpha;

    app.render();
  }

  applyFrame();

  let t = 0;
  // Render throttle: the fog drifts slowly, so re-rasterizing the PixiJS
  // canvas every rAF frame is wasted work — on software WebGL (SwiftShader,
  // headless harness) it pinned the GPU process near 100%+. Positions keep
  // updating every frame (the drift must stay smooth); only the rasterize is
  // throttled to every ~3rd frame (~20fps), visually indistinguishable for
  // this effect and ~66% cheaper.
  const RENDER_EVERY = 3;
  let frameCount = 0;
  return {
    update(dt: number) {
      t += dt;
      band.tilePosition.x = -t * params.speed * 60;
      veil.tilePosition.x = -t * params.speed * 30;
      frameCount = (frameCount + 1) % RENDER_EVERY;
      if (frameCount !== 0) return;
      app.render();
    },
    resize(width: number, height: number) {
      viewport = { width, height };
      applyFrame();
    },
    destroy() {
      app.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true, texture: true, textureSource: true },
      );
    },
  };
}
