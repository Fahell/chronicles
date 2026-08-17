/**
 * Per-character raw log store (day-cycle-spec §4) + day summaries (§5.5).
 *
 * The raw layer is append-only and never deleted — the opposite of the
 * payload: the payload compresses, the log preserves. Rows are scoped by
 * `slotId` (tied to the save lifecycle: deleting a save deletes its logs)
 * and by `characterId` (the search scope). `dayLogs` is the day-level
 * aggregation VIEW over turn/action entries (used by the end-of-day run).
 */

import type {
  CharacterLogEntry,
  CharacterLogType,
  DaySummaryRow,
  RpgDatabase,
} from "../../services/db";
import type { SlotId } from "../save/types";

let entrySeq = 0;

export class LogStore {
  constructor(private readonly db: RpgDatabase) {}

  /**
   * Appends one entry to the raw log. `chars` is computed from the text
   * (batching safety check, §5.2). Never overwrites — each append is a new
   * entryId.
   */
  async append(entry: {
    slotId: SlotId;
    characterId: string;
    type: CharacterLogType;
    owner: CharacterLogEntry["owner"];
    dayId: number;
    period: string;
    text: string;
  }): Promise<void> {
    const row: CharacterLogEntry = {
      entryId: `${entry.slotId}|${entry.characterId}|${entry.dayId}|${entry.type}|${Date.now()}|${entrySeq++}`,
      ...entry,
      ts: Date.now(),
      chars: entry.text.length,
    };
    await this.db.characterLogs.add(row);
  }

  /**
   * The day's log for one character (day-cycle-spec §4 "dayLogs" view):
   * the turn/action entries of that day, oldest first. This is the raw
   * transcript the end-of-day scoring run consumes (§5.1).
   */
  async dayLog(slotId: SlotId, characterId: string, dayId: number): Promise<CharacterLogEntry[]> {
    return this.db.characterLogs
      .where("[slotId+characterId+dayId]")
      .equals([slotId, characterId, dayId])
      .filter((e) => e.type === "turn" || e.type === "action")
      .sortBy("ts");
  }

  /** Most recent entries for a character (dev inspector tab, observability). */
  async recent(slotId: SlotId, characterId: string, limit = 50): Promise<CharacterLogEntry[]> {
    const rows = await this.db.characterLogs
      .where("characterId")
      .equals(characterId)
      .filter((e) => e.slotId === slotId)
      .sortBy("ts");
    return rows.slice(-limit);
  }

  /** All entries for a slot (dev observability + save-deletion cleanup). */
  async allForSlot(slotId: SlotId): Promise<CharacterLogEntry[]> {
    return this.db.characterLogs.where("slotId").equals(slotId).toArray();
  }

  /** Deletes the slot's logs (save lifecycle: deleting a save deletes its logs). */
  async removeSlot(slotId: SlotId): Promise<void> {
    await this.db.characterLogs.where("slotId").equals(slotId).delete();
    await this.db.daySummaries.where("slotId").equals(slotId).delete();
  }

  // ---- day summaries ------------------------------------------------------

  /** Stores (upserts) one NPC's daily summary + scores (§5.5). */
  async putSummary(row: Omit<DaySummaryRow, "key" | "createdAt">): Promise<void> {
    await this.db.daySummaries.put({
      ...row,
      key: `${row.slotId}|${row.dayId}|${row.characterId}`,
      createdAt: Date.now(),
    });
  }

  /** All daily summaries for a character (the daily-summaries pile, §6). */
  async summariesFor(slotId: SlotId, characterId: string): Promise<DaySummaryRow[]> {
    return this.db.daySummaries
      .where("characterId")
      .equals(characterId)
      .filter((r) => r.slotId === slotId)
      .sortBy("dayId");
  }
}
