import type { Table } from "dexie";

import type { CutoutRow } from "./db";
import type { RuntimeMode } from "./perchance-runtime";

/**
 * Bump when the removal/matte/outline pipeline changes — one bump
 * invalidates every cached cut-out (removal-pipeline-spec §3).
 */
export const CUTOUT_PIPELINE_VERSION = "rmbg-q8-v1";

/** A cut-out is a derived asset: raw generation key + pipeline version. */
export function cutoutCacheKey(rawKey: string): string {
  return `${rawKey}|cutout|${CUTOUT_PIPELINE_VERSION}`;
}

/**
 * Thin Dexie wrapper over the `cutouts` table. Stores ONLY RMBG-processed
 * cut-outs; the plugin-removal fallback is never written here (owner
 * decision — a transient model failure must recover on its own next boot).
 */
export class CutoutStore {
  constructor(
    private readonly table: Table<CutoutRow, string>,
    private readonly mode: RuntimeMode,
  ) {}

  async get(rawKey: string): Promise<string | undefined> {
    const row = await this.table.get(cutoutCacheKey(rawKey));
    return row?.dataUrl;
  }

  async put(rawKey: string, dataUrl: string): Promise<void> {
    await this.table.put({
      key: cutoutCacheKey(rawKey),
      dataUrl,
      mode: this.mode,
      createdAt: Date.now(),
    });
  }
}
