import type { Identity } from "../identity";

/** Manual save slots (owner decision this phase): 3 + autosave. */
export const MANUAL_SLOTS = 3;

/** The autosave slot id (end-of-day trigger is a stub — day-cycle is later). */
export const AUTOSAVE_SLOT = "autosave";

export type SlotId = string;

/** Scene pointer stored per save (tech-spec §7.2). */
export interface SaveScene {
  sceneId: string;
  /** Picked NPC id from the seed pool (content/npcPool.ts). */
  npcId: string;
  day: number;
  period: string;
}

/** A full game snapshot (tech-spec §7.2 save v1). */
export interface SaveGame {
  slotId: SlotId;
  /** Locked to the save: identity is never edited after creation. */
  identity: Identity;
  scene: SaveScene;
  progress: { talkedTo: string[] };
  flags: Record<string, unknown>;
  updatedAt: number;
}

/** Persisted row: SaveGame + creation timestamp. */
export interface SaveRow extends SaveGame {
  createdAt: number;
}

export function isManualSlot(slotId: SlotId): boolean {
  return /^slot-\d+$/.test(slotId);
}
