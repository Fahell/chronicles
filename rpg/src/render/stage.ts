import type { StageEffect } from "../effects/types";
import type { ActorTextures, SceneTextures } from "../scene/assets";
import type { ActorPlacement } from "../scene/layout";

/**
 * Thin Stage abstraction (tech-spec §2.1). The rest of the app never
 * imports a renderer directly — PixiJS (2D overlays) and three.js
 * (type C scenes) both implement this interface.
 */
export interface Stage {
  /** Stage size in CSS pixels, before devicePixelRatio scaling. */
  readonly width: number;
  readonly height: number;

  mount(container: HTMLElement): void;
  setTextures(textures: SceneTextures): void;
  /**
   * Place actors; optional generated textures keyed by characterId — the
   * cut-out sprite plus its black outline plane (vn-rpg-spec §4.1).
   */
  setActors(actors: ActorPlacement[], textures?: Record<string, ActorTextures>): void;
  setActiveSpeaker(characterId: string | null): void;

  /**
   * Declarative overlay effects (PixiJS stack, vn-rpg-spec §3.3). The loader
   * pushes effect instances here; the app's rAF loop drives them through
   * tick(dt) — effects keep updating even when the 3D scene is idle.
   */
  readonly effects: StageEffect[];

  /** Swap one actor's generated textures (sprite re-roll) — placement unchanged. */
  updateActor(characterId: string, textures: ActorTextures): void;

  /** Resize the stage surface (contain/letterbox handled by the viewport). */
  resize(width: number, height: number): void;

  /** Advance the render loop by one frame (the app owns the rAF). */
  tick(dt: number): void;

  destroy(): void;
}
