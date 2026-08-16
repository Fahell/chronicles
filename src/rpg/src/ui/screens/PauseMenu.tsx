import { useState } from "preact/hooks";

import { sessionSignal } from "../../game/session";
import { closePause, quitToTitle } from "../../game/state/pause";
import type { BootServices } from "../../services/boot";
import { t } from "../../services/i18n";
import { SettingsScreen } from "./SettingsScreen";

interface PauseMenuProps {
  services: BootServices;
}

type View = "menu" | "settings" | "quit-confirm";

/**
 * In-game pause menu v1 (vn-rpg-spec §8.2): Save / Settings / Quit-to-title.
 * - Save writes the current session to the AUTOSAVE slot directly (round-10
 *   owner decision — no slot picker; manual slots stay wizard-only).
 * - Quit asks "Save before quitting?" with Yes / No / Cancel.
 */
export function PauseMenu({ services }: PauseMenuProps) {
  const [view, setView] = useState<View>("menu");
  const [saved, setSaved] = useState(false);

  async function saveToAutosave(): Promise<void> {
    const session = sessionSignal.value;
    if (!session) return;
    await services.saves.saveAutosave({ ...session.save, updatedAt: Date.now() });
    setSaved(true);
  }

  async function quit(yesSave: boolean): Promise<void> {
    if (yesSave) await saveToAutosave();
    quitToTitle();
  }

  if (view === "settings") {
    return <SettingsScreen onBack={() => setView("menu")} />;
  }

  return (
    <section className="pause-menu" role="dialog" aria-modal="true" aria-label={t("pause.title")}>
      <h2>{t("pause.title")}</h2>

      {view === "quit-confirm" ? (
        <div className="pause-confirm">
          <p>{t("pause.quitConfirm")}</p>
          <div className="pause-actions">
            <button type="button" onClick={() => void quit(true)}>
              {t("pause.yes")}
            </button>
            <button type="button" onClick={() => void quit(false)}>
              {t("pause.no")}
            </button>
            <button type="button" className="pause-cancel" onClick={() => setView("menu")}>
              {t("pause.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="pause-actions">
          <button type="button" onClick={() => void saveToAutosave()}>
            {t("pause.save")}
          </button>
          <button type="button" onClick={() => setView("settings")}>
            {t("pause.settings")}
          </button>
          <button type="button" onClick={() => setView("quit-confirm")}>
            {t("pause.quit")}
          </button>
        </div>
      )}

      {saved && view === "menu" && (
        <p className="pause-saved" role="status">
          {t("pause.saved")}
        </p>
      )}
    </section>
  );
}
