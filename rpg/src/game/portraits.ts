import { signal } from "@preact/signals";

import { resolvePortrait } from "../scene/assets";
import type { AssetCache } from "../services/generation";
import type { GameSession } from "./session";

/**
 * Portrait lookup for the dialogue box (round 10, vn-rpg-spec §3.7): the box
 * shows the portrait of whoever is speaking — NPC and user — plus the text.
 *
 * Portraits are bust crops generated on a pure white background and never
 * background-removed (resolvePortrait); the white is the frame backing. Each
 * character's portrait seed matches its sprite seed, so a sprite re-roll
 * regenerates the portrait together with it.
 */

/** characterId → portrait dataUrl. Populated async (never awaited at call sites). */
export const portraitsSignal = signal<Record<string, string>>({});

export interface PortraitRequest {
  entity: string;
  seed: string;
  prompt: string;
}

/**
 * Fire-and-forget portrait resolution: resolves through the asset cache and
 * publishes the dataUrl into portraitsSignal when ready. Never awaited by
 * callers — generation is async by design (round-10 owner decision) so it
 * adds zero wait time to sprite generation.
 */
export async function ensurePortrait(assets: AssetCache, req: PortraitRequest): Promise<void> {
  const url = await resolvePortrait(assets, req);
  portraitsSignal.value = { ...portraitsSignal.value, [req.entity]: url };
}

/** The user's portrait key (the identity sprite is never re-rolled). */
export const PLAYER_PORTRAIT_KEY = "player";

/**
 * Maps a dialogue-box speaker display name to its portrait dataUrl:
 * - the session NPC's name → the NPC portrait;
 * - the user's name → the player portrait (free-form input / player turn);
 * - narrator or any other name → null (no portrait — the frame is hidden).
 */
export function portraitFor(speaker: string | null, session: GameSession | null): string | null {
  if (!speaker || !session) return null;
  if (speaker === session.npc.name) return portraitsSignal.value[session.npc.id] ?? null;
  if (speaker === session.save.identity.name) {
    return portraitsSignal.value[PLAYER_PORTRAIT_KEY] ?? null;
  }
  return null;
}
