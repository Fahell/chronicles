import { t } from "../../services/i18n";

interface HelpScreenProps {
  onBack: () => void;
}

/** Help & Controls (vn-rpg-spec §8.1). */
export function HelpScreen({ onBack }: HelpScreenProps) {
  return (
    <section className="info-screen">
      <div className="wizard-head">
        <button type="button" className="wizard-back" onClick={onBack}>
          {t("common.return")}
        </button>
        <h2>{t("help.title")}</h2>
      </div>
      <ul className="info-list">
        <li>
          <strong>Enter / Space</strong> — advance dialogue, activate selections
        </li>
        <li>
          <strong>Arrow keys</strong> — navigate menus
        </li>
        <li>
          <strong>Escape</strong> — leave the dialogue / go back
        </li>
      </ul>
    </section>
  );
}
