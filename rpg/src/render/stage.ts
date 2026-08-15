/**
 * Thin Stage abstraction (tech-spec §3, §5.1).
 *
 * PixiJS is the primary implementation; three.js scenes (type B/C) are built
 * behind the same interface via the ScenePlugin escape hatch (§5.3). Layers
 * back-to-front: backdrop → effects → characters → UI overlay.
 */
export interface Stage {
  /** Stage size in CSS pixels, before devicePixelRatio scaling. */
  readonly width: number;
  readonly height: number;

  /** Resize the stage surface (contain/letterbox handled by the viewport). */
  resize(width: number, height: number): void;

  destroy(): void;
}
