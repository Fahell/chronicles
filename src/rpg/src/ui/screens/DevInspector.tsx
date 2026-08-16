import { useState } from "preact/hooks";

import { buildInspectorState, type InspectorVoiceId } from "../../game/inspector";
import { conversationSignal, sessionSignal } from "../../game/session";
import { currentLanguage, englishName, t } from "../../services/i18n";

/**
 * Dev context inspector v1 (tech-spec §6.4): a panel showing everything that
 * defines a voice at the current moment — payload sections exactly as the
 * builder emitted them (summarizable sections highlighted), the raw image
 * prompt, visual description, per-section counts, and a budget bar against
 * the ~24k window. One voice at a time (NPC / narrator / user), Refresh +
 * Copy payload. Off by default; enabled by `?inspector=1`.
 */
export function DevInspector() {
  const session = sessionSignal.value;
  const [voice, setVoice] = useState<InspectorVoiceId>("npc");
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!session) return null;

  // Rebuild the state on every render (voice switch, refresh click, turn
  // changes — the signals re-render automatically).
  void refreshKey;
  const state = buildInspectorState({
    scene: session.buildManifest(),
    npc: session.npc,
    user: session.save.identity,
    conversation: conversationSignal.value,
    language: englishName(currentLanguage()),
  });
  const panel = state.voices[voice];

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(panel.instruction);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can reject without a trusted user gesture or permission
      // (e.g. headless/harness contexts) — never leave an unhandled rejection.
      console.warn("[rpg] inspector: clipboard write failed");
    }
  }

  return (
    <aside className="dev-inspector" aria-label={t("inspector.title")}>
      <div className="inspector-head">
        <h3>{t("inspector.title")}</h3>
        <span className="inspector-scene">
          {state.sceneId} · day {state.day} · {state.period}
        </span>
      </div>

      <div className="inspector-voice">
        <label htmlFor="inspector-voice-select">{t("inspector.voice")}</label>
        <select
          id="inspector-voice-select"
          value={voice}
          onChange={(e) => setVoice((e.target as HTMLSelectElement).value as InspectorVoiceId)}
        >
          {(Object.keys(state.voices) as InspectorVoiceId[]).map((id) => (
            <option key={id} value={id}>
              {state.voices[id]!.label}
            </option>
          ))}
        </select>
      </div>

      {panel.imagePrompt && (
        <details className="inspector-prompt">
          <summary>{t("inspector.imagePrompt")}</summary>
          <pre>{panel.imagePrompt}</pre>
        </details>
      )}
      {panel.visualDescription && (
        <p className="inspector-desc">
          <strong>{t("inspector.visualDescription")}</strong> {panel.visualDescription}
        </p>
      )}
      {panel.backgroundPayload && (
        <details className="inspector-prompt">
          <summary>{t("inspector.backgroundPayload")}</summary>
          <pre>{panel.backgroundPayload}</pre>
        </details>
      )}

      <ul className="inspector-sections">
        {panel.sections.map((section) => (
          <li key={section.name} className={section.summarizable ? "is-summarizable" : "is-fixed"}>
            <div className="inspector-section-head">
              <span className="inspector-section-name">{section.name}</span>
              <span className="inspector-section-policy">
                {section.summarizable
                  ? t("inspector.summarizable")
                  : t("inspector.neverSummarized")}
              </span>
              <span className="inspector-section-chars">{section.content.length} ch</span>
            </div>
            <pre className="inspector-section-body">{section.content}</pre>
          </li>
        ))}
      </ul>

      <fieldset className="inspector-budget">
        <legend>{t("inspector.budget")}</legend>
        <div className="inspector-budget-bar">
          <div
            className={`inspector-budget-fill ${panel.windowTrigger ? "is-trigger" : ""}`}
            style={{ width: `${Math.min(100, panel.budgetFraction * 100)}%` }}
          />
        </div>
        <span>
          {panel.totalChars} / 24000 ch ·{" "}
          {panel.windowTrigger ? t("inspector.windowTrigger") : t("inspector.underBudget")}
        </span>
      </fieldset>

      <div className="inspector-actions">
        <button type="button" onClick={() => setRefreshKey((k) => k + 1)}>
          {t("inspector.refresh")}
        </button>
        <button type="button" onClick={() => void copyPayload()}>
          {copied ? t("inspector.copied") : t("inspector.copyPayload")}
        </button>
      </div>
    </aside>
  );
}
