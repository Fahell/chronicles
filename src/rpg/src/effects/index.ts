import type { EffectSpec, StageEffect } from "./types";

export type { EffectSpec, StageEffect } from "./types";

/**
 * Effect registry (tech-spec §5.2): kind → factory. The fog effect registers
 * here in the effects milestone (`effects/fog.ts`); unknown kinds are skipped
 * silently so a manifest carrying a not-yet-implemented effect never breaks
 * the scene.
 */
export async function createEffects(
  specs: EffectSpec[],
  container: HTMLElement,
  viewport: { width: number; height: number },
): Promise<StageEffect[]> {
  const effects: StageEffect[] = [];
  for (const spec of specs) {
    if (spec.kind === "fog") {
      const { createFogEffect } = await import("./fog");
      // The container is where the effect mounts its canvas (round-9 fix:
      // fog rendered to a detached canvas — pixi v8 never auto-appends).
      effects.push(await createFogEffect(viewport, spec.params, container));
    }
    // unknown kinds: skipped
  }
  return effects;
}
