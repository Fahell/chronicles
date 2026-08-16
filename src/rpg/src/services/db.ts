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
 * The game's Dexie database. DB name carries the mode (`rpg_dev` / `rpg`)
 * so development generations never pollute the production cache
 * (tech-spec §6.1, vn-rpg-spec §4.2).
 *
 * Schema is versioned from day one; further tables (characters,
 * relationships, characterLogs, dayLogs, daySummaries — tech-spec §7.2)
 * land with their milestones as v4+ migrations. Save slots land in v3.
 */
export class RpgDatabase extends Dexie {
  assets!: Table<AssetRow, string>;
  cutouts!: Table<CutoutRow, string>;
  save!: Table<SaveRow, string>;

  constructor(mode: RuntimeMode, dbName?: string) {
    super(dbName ?? (mode === "dev" ? "rpg_dev" : "rpg"));
    this.version(2).stores({
      assets: "key, mode, createdAt",
      cutouts: "key, mode, createdAt",
    });
    this.version(3).stores({
      save: "slotId, updatedAt",
    });
  }
}
