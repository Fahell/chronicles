import { signal } from "@preact/signals";

import { archetypeById } from "../content/archetypes";
import { type NpcDefinition, npcById } from "../content/npcPool";
import { SPRITE_NEGATIVE_PROMPT } from "../content/sprite";
import { buildOpenPlainsManifest } from "../scene/manifest/openPlains";
import type { SceneManifest } from "../scene/types";
import { type DayState, initialDayState, normalizePeriod } from "./day/clock";
import type { Identity } from "./identity";
import type { ConversationTurn } from "./payload/builder";
import type { SaveGame, SaveScene } from "./save/types";

/** A live game session: the loaded save + its NPCs + the scene manifest. */
export interface GameSession {
  save: SaveGame;
  /** Primary NPC (always present). */
  npc: NpcDefinition;
  /** Second co-present NPC — null on legacy single-NPC saves (round 12). */
  npc2: NpcDefinition | null;
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

/**
 * The NPC portrait's seed — mirrors the sprite's default seed
 * (`${sceneId}:${characterId}:${pose}:v1`, assets.ts resolveCharacterSprite)
 * so the portrait and sprite live under the same cache key and a re-roll
 * regenerates both together (round-10 owner decision).
 */
export function npcPortraitSeed(npcId: string, sceneId: string): string {
  return `${sceneId}:${npcId}:idle:v1`;
}

/** Builds a session from a loaded save; throws if an NPC id is unknown. */
export function startSession(save: SaveGame): GameSession {
  // A fresh session always starts with an empty conversation — reset before
  // validation so a failed start cannot leak prior turns.
  conversationSignal.value = [];
  const npc = npcById(save.scene.npcId);
  if (!npc) {
    throw new Error(`Session: unknown NPC id "${save.scene.npcId}" in save slot ${save.slotId}`);
  }
  const npc2 = save.scene.secondNpcId ? (npcById(save.scene.secondNpcId) ?? null) : null;
  const session: GameSession = {
    save,
    npc,
    npc2,
    buildManifest: () => {
      const actors = [userActor(save.identity), npcActor(npc)];
      if (npc2) actors.push(npcActor(npc2));
      return buildOpenPlainsManifest(actors);
    },
  };
  sessionSignal.value = session;
  return session;
}

/** The in-game clock state of a save (normalizes legacy stubs, §3). */
export function dayStateFromSave(scene: SaveScene): DayState {
  return {
    day: scene.day > 0 ? scene.day : 1,
    period: normalizePeriod(scene.period),
    scenesInPeriod: scene.scenesInPeriod ?? 0,
  };
}

/** The day state a brand-new game starts with. */
export function initialSaveScene(sceneId: string, npcId: string, secondNpcId?: string): SaveScene {
  const day = initialDayState();
  return {
    sceneId,
    npcId,
    ...(secondNpcId ? { secondNpcId } : {}),
    day: day.day,
    period: day.period,
    scenesInPeriod: day.scenesInPeriod,
  };
}

/** Replaces the active session's save (clock advances, pause saves, …). */
export function updateSessionSave(next: SaveGame): void {
  const session = sessionSignal.value;
  if (!session) return;
  sessionSignal.value = { ...session, save: next };
}
