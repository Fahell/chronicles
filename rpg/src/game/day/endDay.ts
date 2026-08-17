/**
 * Day-end orchestration (day-cycle-spec §5): collects the day's logs for the
 * session's NPC, runs the end-of-day processing (System 1), advances the
 * in-game clock to the given next state, persists the save, and returns the
 * structured recap for the UI to format (i18n, §8.2).
 */

import type { BootServices } from "../../services/boot";
import type { GameSession } from "../session";
import { updateSessionSave } from "../session";
import type { DayState } from "./clock";
import { buildDayRecap, type RecapEntry } from "./recap";
import { runEndOfDay } from "./run";

export interface DayEndServices {
  runtime: BootServices["runtime"];
  logs: BootServices["logs"];
  bonds: BootServices["bonds"];
  saves: BootServices["saves"];
}

/**
 * Runs the end-of-day processing for the day that just ended and persists the
 * clock at `nextState` (sleep → day+1 morning; budget exhaustion → already
 * advanced). Returns the recap entries for the UI.
 */
export async function endDayAndPersist(
  services: DayEndServices,
  session: GameSession,
  dayEnded: DayState,
  nextState: DayState,
): Promise<RecapEntry[]> {
  const slotId = session.save.slotId;
  // All NPCs present (1..2) — each with its own day log (round 12).
  const npcs = session.npc2 ? [session.npc, session.npc2] : [session.npc];
  const dayLogs = await Promise.all(
    npcs.map(async (npc) => ({
      characterId: npc.id,
      npcName: npc.name,
      entries: await services.logs.dayLog(slotId, npc.id, dayEnded.day),
    })),
  );

  const result = await runEndOfDay(
    { text: services.runtime.text, logs: services.logs, bonds: services.bonds },
    {
      slotId,
      dayId: dayEnded.day,
      period: dayEnded.period,
      npcs: dayLogs,
    },
  );
  const recap = buildDayRecap(result.npcs);

  // Persist the advanced clock in the save (sleep / budget exhaustion).
  const save = {
    ...session.save,
    scene: {
      ...session.save.scene,
      day: nextState.day,
      period: nextState.period,
      scenesInPeriod: nextState.scenesInPeriod,
    },
    updatedAt: Date.now(),
  };
  updateSessionSave(save);
  await services.saves.put(save);
  return recap;
}
