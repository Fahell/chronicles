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
  _container: HTMLElement,
  _viewport: { width: number; height: number },
): Promise<StageEffect[]> {
  const effects: StageEffect[] = [];
  for (const spec of specs) {
    if (spec.kind === "fog") {
      const { createFogEffect } = await import("./fog");
      effects.push(await createFogEffect(_viewport, spec.params));
    }
    // unknown kinds: skipped
  }
  return effects;
}
