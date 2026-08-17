/**
 * Day recap (day-cycle-spec §5): a narrative recap + discreet indicators of
 * how bonds changed — NO raw numbers (per the owner interview). Composed
 * deterministically from the end-of-day run result as STRUCTURED data; the UI
 * formats it through i18n (the recap is player-visible text, narrative-spec
 * §8.2) — the delta is mapped to a qualitative phrase, never a number.
 */

import type { NpcDayResult } from "./run";

/** Qualitative bond change from the user's side (no raw numbers, §5). */
export type BondChange = "closer" | "apart" | "unchanged";

export interface RecapEntry {
  npcName: string;
  change: BondChange;
  /** The NPC's day-memory blurb — null when the day's scoring failed. */
  memory: string | null;
}

/** Builds the structured recap for one end-of-day run. */
export function buildDayRecap(results: NpcDayResult[]): RecapEntry[] {
  return results.map((r) => {
    let change: BondChange = "unchanged";
    if (r.userToNpc !== null && r.userToNpc > 0) change = "closer";
    else if (r.userToNpc !== null && r.userToNpc < 0) change = "apart";
    return { npcName: r.npcName, change, memory: r.dayMemory };
  });
}
