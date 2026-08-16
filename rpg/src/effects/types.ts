/**
 * Declarative scene effects (tech-spec §5.2, vn-rpg-spec §3.3).
 *
 * Effects are declared in the scene manifest (`effects: [{ kind, params }]`)
 * and each effect is an isolated, unit-testable module. The loader creates
 * them via the registry (`effects/index.ts`) and pushes them into the Stage —
 * the app's rAF loop drives `update(dt)` through `stage.tick(dt)`.
 */
export interface StageEffect {
  /** Advance the effect by dt seconds (called every frame, even when the 3D scene is idle). */
  update(dt: number): void;
  /** Reposition for a new viewport size (called by the stage's resize). */
  resize?(width: number, height: number): void;
  destroy(): void;
}

/** One declared effect in a scene manifest. */
export interface EffectSpec {
  kind: string;
  /** Effect-specific params (fog: color/opacity/layers/speed, …). */
  params: Record<string, unknown>;
}
