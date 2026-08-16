import { signal } from "@preact/signals";

/** App screens (vn-rpg-spec §8.1-8.3; the game screen is entered with a session). */
export type Screen = "title" | "wizard" | "load" | "settings" | "credits" | "help" | "game";

export const screenSignal = signal<Screen>("title");

export function navigate(screen: Screen): void {
  screenSignal.value = screen;
}
