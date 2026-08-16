import { signal } from "@preact/signals";

/**
 * Dev context inspector gating (tech-spec §6.4, round-10 decision): the
 * feature exists in dev AND prod builds but is OFF by default. Enabled via
 * the `?inspector=1` URL param — so the Perchance agent can turn it on during
 * runtime tests on the deployed build without touching settings or the save.
 */

/** True when the inspector is enabled by the URL param (off by default). */
export const inspectorEnabled = signal(false);

/** True while the inspector panel is open (toggled by the HUD button). */
export const inspectorOpen = signal(false);

/** Reads `?inspector=1` from the URL (called once at boot). */
export function enableInspectorFromUrl(): void {
  inspectorEnabled.value = new URLSearchParams(window.location.search).get("inspector") === "1";
}

export function toggleInspector(): void {
  inspectorOpen.value = !inspectorOpen.value;
}
