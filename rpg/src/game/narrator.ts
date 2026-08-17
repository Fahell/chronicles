import type { BootServices } from "../services/boot";
import { currentLanguage, englishName, t } from "../services/i18n";
import { buildNarratorInstruction } from "./payload/builder";
import { dayStateFromSave, type GameSession } from "./session";
import { dialoguePending, dialogueVisible, pendingSpeaker, showTurn } from "./state/dialogue";

/**
 * World-narrator opening for a scene (narrative-spec §9 — owner decision:
 * opening only in this phase). One generation call; the player advances or
 * leaves it. Always-escape applies while it is open.
 */
export async function runNarratorOpening(
  services: BootServices,
  session: GameSession,
): Promise<void> {
  const language = englishName(currentLanguage());
  const instruction = buildNarratorInstruction({
    scene: session.buildManifest(),
    user: session.save.identity,
    npcs: session.npc2 ? [session.npc, session.npc2] : [session.npc],
    language,
    day: dayStateFromSave(session.save.scene),
  });

  dialoguePending.value = true;
  dialogueVisible.value = true;
  pendingSpeaker.value = t("dialogue.narrator");
  try {
    const result = await services.runtime.text.generate({ instruction });
    if (!dialogueVisible.value) return;
    showTurn(t("dialogue.narrator"), result.text, []);
  } catch (error) {
    if (!dialogueVisible.value) return;
    const message = error instanceof Error ? error.message : String(error);
    showTurn(t("dialogue.narrator"), `The narrator could not speak. ${message}`, []);
  } finally {
    dialoguePending.value = false;
    pendingSpeaker.value = null;
  }
}
