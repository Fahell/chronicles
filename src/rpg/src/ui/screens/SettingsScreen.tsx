import { useState } from "preact/hooks";
import {
  currentLanguage,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  setLanguage,
  t,
} from "../../services/i18n";

interface SettingsScreenProps {
  onBack: () => void;
}

const TABS = [
  { id: "language", labelKey: "settings.language" },
  { id: "accessibility", labelKey: "settings.accessibility" },
  { id: "display", labelKey: "settings.display" },
  { id: "audio", labelKey: "settings.audio" },
] as const;

/** Settings (vn-rpg-spec §8.1): Language functional; other tabs are stubs. */
export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("language");
  const [selected, setSelected] = useState(currentLanguage());

  async function choose(code: string) {
    setSelected(code as (typeof SUPPORTED_LANGUAGES)[number]);
    await setLanguage(code);
  }

  return (
    <section className="settings-screen">
      <div className="wizard-head">
        <button type="button" className="wizard-back" onClick={onBack}>
          {t("common.return")}
        </button>
        <h2>{t("settings.title")}</h2>
      </div>

      <div className="settings-tabs" role="tablist" aria-label={t("settings.title")}>
        {TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            type="button"
            role="tab"
            aria-selected={tab === tabDef.id}
            className={`settings-tab ${tab === tabDef.id ? "is-active" : ""}`}
            onClick={() => setTab(tabDef.id)}
          >
            {t(tabDef.labelKey)}
          </button>
        ))}
      </div>

      {tab === "language" && (
        <div className="language-list" role="tabpanel">
          {SUPPORTED_LANGUAGES.map((code) => (
            <label
              key={code}
              className={`language-option ${selected === code ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="language"
                checked={selected === code}
                onChange={() => void choose(code)}
              />
              <span>{LANGUAGE_NAMES[code]}</span>
            </label>
          ))}
        </div>
      )}
      {tab !== "language" && <p className="muted">{t("common.return")}… (coming soon)</p>}
    </section>
  );
}
