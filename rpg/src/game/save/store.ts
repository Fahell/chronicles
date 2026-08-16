import type { RpgDatabase } from "../../services/db";
import { AUTOSAVE_SLOT, MANUAL_SLOTS, type SaveGame, type SaveRow, type SlotId } from "./types";

export type { SaveGame, SaveRow, SlotId } from "./types";
export { AUTOSAVE_SLOT, MANUAL_SLOTS };

function toSave(row: SaveRow): SaveGame {
  const { createdAt: _createdAt, ...save } = row;
  return save;
}

/**
 * Persistence for save slots (tech-spec §7.2). Slot policy (owner decision):
 * 3 manual slots + a separate autosave slot. New Game always lands in the
 * first free manual slot; when all are full the wizard asks which to overwrite.
 */
export class SaveStore {
  constructor(private readonly db: RpgDatabase) {}

  /** Manual saves, newest first. */
  async list(): Promise<SaveGame[]> {
    const rows = await this.db.save.toArray();
    return rows
      .filter((r) => r.slotId !== AUTOSAVE_SLOT)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(toSave);
  }

  async get(slotId: SlotId): Promise<SaveGame | undefined> {
    const row = await this.db.save.get(slotId);
    return row ? toSave(row) : undefined;
  }

  async put(save: SaveGame): Promise<void> {
    await this.db.save.put({ ...save, createdAt: Date.now() });
  }

  async remove(slotId: SlotId): Promise<void> {
    await this.db.save.delete(slotId);
  }

  manualSlots(): SlotId[] {
    return Array.from({ length: MANUAL_SLOTS }, (_, i) => `slot-${i + 1}`);
  }

  async hasFreeManualSlot(): Promise<boolean> {
    return (await this.nextFreeSlot()) !== null;
  }

  /** First empty manual slot, or null when all 3 are taken. */
  async nextFreeSlot(): Promise<SlotId | null> {
    const taken = new Set((await this.db.save.toArray()).map((r) => r.slotId));
    for (const slot of this.manualSlots()) {
      if (!taken.has(slot)) return slot;
    }
    return null;
  }

  async saveAutosave(save: SaveGame): Promise<void> {
    await this.put({ ...save, slotId: AUTOSAVE_SLOT });
  }
}
