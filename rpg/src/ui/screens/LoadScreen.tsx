import { useEffect, useState } from "preact/hooks";
import { AUTOSAVE_SLOT, type SaveGame } from "../../game/save/types";
import { startSession } from "../../game/session";
import { navigate } from "../../game/state/screens";
import type { BootServices } from "../../services/boot";
import { t } from "../../services/i18n";

interface LoadScreenProps {
  services: BootServices;
  onBack: () => void;
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

/** Save-slot grid (vn-rpg-spec §8.1): 3 manual slots + autosave. */
export function LoadScreen({ services, onBack }: LoadScreenProps) {
  const [saves, setSaves] = useState<SaveGame[] | null>(null);
  const [autosave, setAutosave] = useState<SaveGame | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      const [manual, auto] = await Promise.all([
        services.saves.list(),
        services.saves.get(AUTOSAVE_SLOT),
      ]);
      setSaves(manual);
      setAutosave(auto);
    })();
  }, [services]);

  function load(save: SaveGame) {
    startSession(save);
    navigate("game");
  }

  const slots = [...(saves ?? [])];
  if (autosave) slots.push(autosave);

  return (
    <section className="load-screen">
      <div className="wizard-head">
        <button type="button" className="wizard-back" onClick={onBack}>
          {t("common.return")}
        </button>
        <h2>{t("load.title")}</h2>
      </div>

      {saves !== null && slots.length === 0 ? (
        <p className="muted">{t("load.empty")}</p>
      ) : (
        <ul className="slot-grid">
          {slots.map((save) => (
            <li key={save.slotId}>
              <button type="button" className="slot-card" onClick={() => load(save)}>
                <span className="slot-name">{save.identity.name}</span>
                <span className="slot-meta">
                  {t("load.day", { day: save.scene.day })} · {save.scene.period}
                </span>
                <span className="slot-date">{formatDate(save.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
