import { signal } from "@preact/signals";

import { archetypeById } from "../content/archetypes";
import { type NpcDefinition, npcById } from "../content/npcPool";
import { SPRITE_NEGATIVE_PROMPT } from "../content/sprite";
import { buildOpenPlainsManifest } from "../scene/manifest/openPlains";
import type { SceneManifest } from "../scene/types";
import type { Identity } from "./identity";
import type { ConversationTurn } from "./payload/builder";
import type { SaveGame } from "./save/types";

/** A live game session: the loaded save + its NPC + the scene manifest. */
export interface GameSession {
  save: SaveGame;
  npc: NpcDefinition;
  /** The dynamic scene manifest (base scene + user/NPC actors). */
  buildManifest(): SceneManifest;
}

/** The active session (null on the title/onboarding screens). */
export const sessionSignal = signal<GameSession | null>(null);

/** Bounded conversation log for the NPC payload (appended per turn). */
export const conversationSignal = signal<ConversationTurn[]>([]);

/**
 * The user's actor spec. The sprite carries the identity appearance seed
 * explicitly so the wizard-time generation resolves from cache at scene load
 * (same entity/pose/seed/prompt → cache hit — no second generation).
 */
export function userActor(identity: Identity): SceneManifest["actors"][number] {
  const archetype = archetypeById(identity.archetypeId);
  return {
    characterId: "player",
    pose: "idle",
    position: { x: 0.1, z: -0.9 },
    scale: 0.95,
    sprite: {
      assetKey: `identity/${identity.appearanceSeed}/idle`,
      prompt: archetype?.spritePrompt,
      negativePrompt: SPRITE_NEGATIVE_PROMPT,
      seed: `identity:${identity.appearanceSeed}`,
    },
  };
}

/** The picked NPC's actor spec (generated portrait via the seed pool prompt). */
export function npcActor(npc: NpcDefinition): SceneManifest["actors"][number] {
  return {
    characterId: npc.id,
    pose: "idle",
    position: { x: -2.2, z: -3.8 },
    scale: 0.9,
    sprite: {
      assetKey: `characters/${npc.id}/idle`,
      prompt: npc.spritePrompt,
      negativePrompt: SPRITE_NEGATIVE_PROMPT,
    },
  };
}

/** Builds a session from a loaded save; throws if the NPC id is unknown. */
export function startSession(save: SaveGame): GameSession {
  // A fresh session always starts with an empty conversation — reset before
  // validation so a failed start cannot leak prior turns.
  conversationSignal.value = [];
  const npc = npcById(save.scene.npcId);
  if (!npc) {
    throw new Error(`Session: unknown NPC id "${save.scene.npcId}" in save slot ${save.slotId}`);
  }
  const session: GameSession = {
    save,
    npc,
    buildManifest: () => buildOpenPlainsManifest(userActor(save.identity), npcActor(npc)),
  };
  sessionSignal.value = session;
  return session;
}
