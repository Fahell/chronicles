/**
 * Relationship web persistence (relationships-spec §2, §8 — the web persists
 * across sessions, tied to the save lifecycle). Edges are directed: A→B may
 * differ from B→A. Pure graph logic lives in `graph.ts`; this store is the
 * Dexie-backed repository.
 */

import type { RelationshipRow, RpgDatabase } from "../../services/db";
import type { SlotId } from "../save/types";
import { applyDelta, type Bond, defaultBond, edgeKey } from "./graph";

export class RelationshipStore {
  constructor(private readonly db: RpgDatabase) {}

  private key(slotId: SlotId, from: string, to: string): string {
    return `${slotId}|${edgeKey(from, to)}`;
  }

  private toBond(row: RelationshipRow): Bond {
    return { from: row.from, to: row.to, type: row.type as Bond["type"], intensity: row.intensity };
  }

  async get(slotId: SlotId, from: string, to: string): Promise<Bond | undefined> {
    const row = await this.db.relationships.get(this.key(slotId, from, to));
    return row ? this.toBond(row) : undefined;
  }

  /**
   * Applies a delta to the directed edge from→to, creating it at 0 when it
   * does not exist yet (bonds are born neutral — Stranger tier, §3). The
   * delta is clamped to the web bounds. Returns the updated bond.
   */
  async applyDelta(
    slotId: SlotId,
    from: string,
    to: string,
    delta: number,
    type?: Bond["type"],
  ): Promise<Bond> {
    const existing = await this.get(slotId, from, to);
    const bond = existing ? applyDelta(existing, delta) : applyDelta(defaultBond(from, to), delta);
    if (type && existing) bond.type = type;
    await this.db.relationships.put({
      key: this.key(slotId, from, to),
      slotId,
      from: bond.from,
      to: bond.to,
      type: bond.type,
      intensity: bond.intensity,
      updatedAt: Date.now(),
    });
    return bond;
  }

  /** All edges touching a character (either direction) for a save. */
  async edgesFor(slotId: SlotId, characterId: string): Promise<Bond[]> {
    const rows = await this.db.relationships
      .where("slotId")
      .equals(slotId)
      .filter((r) => r.from === characterId || r.to === characterId)
      .toArray();
    return rows.map((r) => this.toBond(r));
  }

  /** Deletes the slot's web (save lifecycle cleanup). */
  async removeSlot(slotId: SlotId): Promise<void> {
    await this.db.relationships.where("slotId").equals(slotId).delete();
  }
}
