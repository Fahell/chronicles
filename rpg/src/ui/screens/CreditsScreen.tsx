import { t } from "../../services/i18n";

interface CreditsScreenProps {
  onBack: () => void;
}

/** Credits (vn-rpg-spec §8.1; CC BY/CC0 attributions per gameplay-spec §6.4). */
export function CreditsScreen({ onBack }: CreditsScreenProps) {
  return (
    <section className="info-screen">
      <div className="wizard-head">
        <button type="button" className="wizard-back" onClick={onBack}>
          {t("common.return")}
        </button>
        <h2>{t("credits.title")}</h2>
      </div>
      <ul className="info-list">
        <li>Font Awesome hand pointer icon — CC BY 4.0</li>
        <li>Kenney assets (planned) — CC0</li>
        <li>Placeholder art — original project artwork</li>
      </ul>
    </section>
  );
}
