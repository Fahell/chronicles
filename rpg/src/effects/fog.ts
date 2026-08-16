import { Application, Container, Sprite, Texture } from "pixi.js";

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

/** Soft radial-gradient texture reused by every layer (tinted). */
function makeFogTexture(color: number): Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const hex = `#${color.toString(16).padStart(6, "0")}`;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `${hex}ff`);
  gradient.addColorStop(0.55, `${hex}cc`);
  gradient.addColorStop(1, `${hex}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
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

interface FogBlob {
  sprite: Sprite;
  baseX: number;
  baseY: number;
  speed: number;
  ampX: number;
  ampY: number;
  phase: number;
}

/**
 * Atmospheric fog layer over the type-C scene frame (vn-rpg-spec §3.3,
 * owner decision this phase: fog first). A transparent PixiJS canvas is
 * positioned exactly over the letterboxed 3:2 frame and drifts a few soft
 * blobs horizontally. Driven by the app's rAF loop through update(dt) —
 * `autoStart: false`, so no second render loop.
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
  root.alpha = params.opacity;
  app.stage.addChild(root);

  const texture = makeFogTexture(params.color);
  const blobs: FogBlob[] = [];
  let frame = { width: 1, height: 1, offsetX: 0, offsetY: 0 };

  function buildBlobs() {
    root.removeChildren();
    blobs.length = 0;
    for (let i = 0; i < params.layers; i++) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.width = frame.width * (1.3 + i * 0.4);
      sprite.height = frame.height * (0.55 + i * 0.2);
      sprite.alpha = 0.45 + i * 0.14;
      const blob: FogBlob = {
        sprite,
        baseX: frame.width * 0.5,
        baseY: frame.height * (0.5 + ((i % 2) - 0.5) * 0.32),
        speed: params.speed * (0.6 + i * 0.35),
        ampX: frame.width * (0.14 + i * 0.07),
        ampY: frame.height * 0.02,
        phase: i * 1.7,
      };
      sprite.position.set(blob.baseX, blob.baseY);
      root.addChild(sprite);
      blobs.push(blob);
    }
  }

  function applyFrame() {
    frame = sceneFrameViewport(viewport.width, viewport.height);
    app.renderer.resize(frame.width, frame.height);
    canvas.style.left = `${frame.offsetX}px`;
    canvas.style.top = `${frame.offsetY}px`;
    buildBlobs();
    app.render();
  }

  applyFrame();

  let t = 0;
  // Render throttle: the fog drifts slowly, so re-rasterizing the PixiJS
  // canvas every rAF frame is wasted work — on software WebGL (SwiftShader,
  // headless harness) it pinned the GPU process near 100%+. Positions keep
  // updating every frame (the sine phase must stay smooth); only the
  // rasterize is throttled to every ~3rd frame (~20fps), visually
  // indistinguishable for this effect and ~66% cheaper.
  const RENDER_EVERY = 3;
  let frameCount = 0;
  return {
    update(dt: number) {
      t += dt;
      for (const b of blobs) {
        b.sprite.x = b.baseX + Math.sin(t * b.speed + b.phase) * b.ampX;
        b.sprite.y = b.baseY + Math.sin(t * b.speed * 0.6 + b.phase) * b.ampY;
      }
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
