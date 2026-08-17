import { useCallback, useEffect, useState } from "preact/hooks";

import { buildInspectorState, type InspectorVoiceId } from "../../game/inspector";
import { conversationSignal, dayStateFromSave, sessionSignal } from "../../game/session";
import type { BootServices } from "../../services/boot";
import type { CharacterLogEntry } from "../../services/db";
import { currentLanguage, englishName, t } from "../../services/i18n";

interface DevInspectorProps {
  services: BootServices;
}

type Tab = "voice" | "logs";

/**
 * Dev context inspector v1 (tech-spec §6.4): a panel showing everything that
 * defines a voice at the current moment — payload sections exactly as the
 * builder emitted them (summarizable sections highlighted), the raw image
 * prompt, visual description, per-section counts, and a budget bar against
 * the ~24k window. One voice at a time (NPC / narrator / user), Refresh +
 * Copy payload. A second tab (round 12) shows the per-character raw log
 * (day-cycle-spec §4) — what the end-of-day run will consume. Off by
 * default; enabled by `?inspector=1`.
 */
export function DevInspector({ services }: DevInspectorProps) {
  const session = sessionSignal.value;
  const [tab, setTab] = useState<Tab>("voice");
  const [voice, setVoice] = useState<InspectorVoiceId>("npc");
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [logEntries, setLogEntries] = useState<CharacterLogEntry[]>([]);

  // Day-cycle §4 observability: load the NPC's raw log entries (newest last)
  // whenever the Logs tab is opened or refreshed.
  const loadLogs = useCallback(async () => {
    if (!session) return;
    const entries = await services.logs.recent(session.save.slotId, session.npc.id, 100);
    setLogEntries(entries);
  }, [services.logs, session]);
  useEffect(() => {
    if (tab === "logs") void loadLogs();
  }, [tab, loadLogs, refreshKey]);

  if (!session) return null;

  // Rebuild the state on every render (voice switch, refresh click, turn
  // changes — the signals re-render automatically).
  void refreshKey;
  const state = buildInspectorState({
    scene: session.buildManifest(),
    npcs: session.npc2 ? [session.npc, session.npc2] : [session.npc],
    user: session.save.identity,
    conversation: conversationSignal.value,
    language: englishName(currentLanguage()),
    day: dayStateFromSave(session.save.scene),
  });
  // The select only offers existing voice keys, so the active panel is always
  // present (voice defaults to "npc", which every session has).
  const panel = state.voices[voice]!;

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

  const entryTypeLabel = (type: CharacterLogEntry["type"]): string => type;

  return (
    <aside className="dev-inspector" aria-label={t("inspector.title")}>
      <div className="inspector-head">
        <h3>{t("inspector.title")}</h3>
        <span className="inspector-scene">
          {state.sceneId} · day {state.day} · {state.period}
        </span>
      </div>

      <div className="inspector-tabs">
        <button
          type="button"
          className={tab === "voice" ? "is-active" : ""}
          onClick={() => setTab("voice")}
        >
          {t("inspector.voice")}
        </button>
        <button
          type="button"
          className={tab === "logs" ? "is-active" : ""}
          onClick={() => setTab("logs")}
        >
          {t("inspector.logs")}
        </button>
      </div>

      {tab === "logs" ? (
        <div className="inspector-logs">
          <p className="inspector-logs-summary">
            {logEntries.length} {t("inspector.entriesFor", { name: session.npc.name })}
          </p>
          {logEntries.length === 0 && <p className="muted">{t("inspector.logsEmpty")}</p>}
          <ul className="inspector-log-list">
            {logEntries.map((entry) => (
              <li key={entry.entryId} className={`log-type-${entry.type}`}>
                <div className="inspector-log-head">
                  <span className="inspector-log-type">{entryTypeLabel(entry.type)}</span>
                  <span className="inspector-log-meta">
                    day {entry.dayId} · {entry.period} · {entry.owner} · {entry.chars} ch
                  </span>
                </div>
                <pre className="inspector-log-text">{entry.text}</pre>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
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
              <li
                key={section.name}
                className={section.summarizable ? "is-summarizable" : "is-fixed"}
              >
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
        </>
      )}
    </aside>
  );
}
