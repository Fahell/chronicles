import Dexie, { type Table } from "dexie";

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

/**
 * The game's Dexie database. DB name carries the mode (`rpg_dev` / `rpg`)
 * so development generations never pollute the production cache
 * (tech-spec §6.1, vn-rpg-spec §4.2).
 *
 * Schema is versioned from day one; further tables (save, characters,
 * relationships, characterLogs, dayLogs, daySummaries — tech-spec §7.2)
 * land with their milestones as v2+ migrations.
 */
export class RpgDatabase extends Dexie {
  assets!: Table<AssetRow, string>;

  constructor(mode: RuntimeMode, dbName?: string) {
    super(dbName ?? (mode === "dev" ? "rpg_dev" : "rpg"));
    this.version(1).stores({
      assets: "key, mode, createdAt",
    });
  }
}
