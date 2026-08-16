import { signal } from "@preact/signals";

import { initialMachine } from "../dialogue/machine";
import { sessionSignal } from "../session";
import { dialogueMachine, dialogueVisible } from "./dialogue";
import { navigate } from "./screens";

/**
 * In-game pause menu v1 (vn-rpg-spec §8.2): Save / Settings / Quit-to-title,
 * opened with Esc (dual behavior — Esc closes the dialogue first when one is
 * open; the App handler checks `e.defaultPrevented`).
 */

/** True while the pause overlay is open. */
export const pauseOpen = signal(false);

export function openPause(): void {
  pauseOpen.value = true;
}

export function closePause(): void {
  pauseOpen.value = false;
}

export function togglePause(): void {
  pauseOpen.value = !pauseOpen.value;
}

/**
 * Quit-to-title: drops the active session and dialogue state and returns to
 * the title screen. The caller decides whether to save first (the Quit
 * confirm flow in the PauseMenu). The session object itself is released by
 * the app when the game screen unmounts.
 */
export function quitToTitle(): void {
  sessionSignal.value = null;
  dialogueMachine.value = initialMachine;
  dialogueVisible.value = false;
  pauseOpen.value = false;
  navigate("title");
}
