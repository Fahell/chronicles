import Dexie, { type Table } from "dexie";

import type { SaveRow } from "../game/save/types";
import type { RuntimeMode } from "./perchance-runtime";

/** One cached generation (tech-spec §7.2 `assets` table). */
export interface AssetRow {
  /** Cache key: mode | entity | pose | seed | prompt-hash. */
  key: string;
  dataUrl: string;
  prompt: string;
  seed: string;
  mode: RuntimeMode;
  createdAt: number;
}

/** One processed cut-out (RMBG + matte) — derived from a raw AssetRow. */
export interface CutoutRow {
  /** cutoutCacheKey(rawKey) — embeds the raw key + pipeline version. */
  key: string;
  dataUrl: string;
  mode: RuntimeMode;
  createdAt: number;
}

/**
 * One directed bond edge of the relationship web (relationships-spec §2,
 * §8 — persists across sessions, tied to the save lifecycle). Key:
 * `${slotId}|${from}->${to}` — A→B and B→A are distinct edges.
 */
export interface RelationshipRow {
  key: string;
  slotId: string;
  from: string;
  to: string;
  type: string;
  intensity: number;
  updatedAt: number;
}

/** Entry-type tags of the per-character log (day-cycle-spec §4). */
export type CharacterLogType =
  | "turn"
  | "action"
  | "scene"
  | "world-event"
  | "life-event"
  | "relation-event"
  | "item"
  | "summary";

/**
 * One entry of the per-character raw log (day-cycle-spec §4). Append-only,
 * never deleted (only when the owning save is deleted). `characterId` is the
 * search scope; `owner` says which voice/pair the entry belongs to.
 */
export interface CharacterLogEntry {
  entryId: string;
  slotId: string;
  /** The owning character — the search scope (day-cycle-spec §4). */
  characterId: string;
  type: CharacterLogType;
  /** voice / pair / world — who the entry belongs to (§4). */
  owner: "user" | "npc" | "world";
  dayId: number;
  period: string;
  ts: number;
  /** Raw verbatim content. */
  text: string;
  /** Length — batching safety check for the end-of-day run (§5.2). */
  chars: number;
}

/** Per-character daily summary + scores (day-cycle-spec §5.5, §9). */
export interface DaySummaryRow {
  /** `${slotId}|${dayId}|${characterId}` */
  key: string;
  slotId: string;
  dayId: number;
  characterId: string;
  /** The NPC's day-memory blurb (§5.3). */
  summary: string;
  /** null when the day's scoring attempts were exhausted (§5.3). */
  scoreUserToNpc: number | null;
  scoreNpcToUser: number | null;
  reason: string;
  createdAt: number;
}

/**
 * The game's Dexie database. DB name carries the mode (`rpg_dev` / `rpg`)
 * so development generations never pollute the production cache
 * (tech-spec §6.1, vn-rpg-spec §4.2).
 *
 * Schema is versioned from day one:
 * - v2: assets + cutouts
 * - v3: save slots
 * - v4: relationship web + per-character logs + day summaries
 *   (day-cycle-spec §9; tech-spec §7.2 milestone)
 */
export class RpgDatabase extends Dexie {
  assets!: Table<AssetRow, string>;
  cutouts!: Table<CutoutRow, string>;
  save!: Table<SaveRow, string>;
  relationships!: Table<RelationshipRow, string>;
  characterLogs!: Table<CharacterLogEntry, string>;
  daySummaries!: Table<DaySummaryRow, string>;

  constructor(mode: RuntimeMode, dbName?: string) {
    super(dbName ?? (mode === "dev" ? "rpg_dev" : "rpg"));
    this.version(2).stores({
      assets: "key, mode, createdAt",
      cutouts: "key, mode, createdAt",
    });
    this.version(3).stores({
      save: "slotId, updatedAt",
    });
    this.version(4).stores({
      relationships: "key, slotId, updatedAt",
      characterLogs: "entryId, slotId, characterId, type, dayId, ts, [slotId+characterId+dayId]",
      daySummaries: "key, slotId, dayId, characterId",
    });
  }
}
