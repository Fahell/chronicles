import { useEffect } from "preact/hooks";

import {
  advanceDialogue,
  closeDialogue,
  dialogueMachine,
  dialoguePending,
  dialogueVisible,
  pendingSpeaker,
  selectOption,
} from "../game/state/dialogue";
import { t } from "../services/i18n";

export function DialogueBox() {
  const machine = dialogueMachine.value;
  const pending = dialoguePending.value;

  const isSpeaking = machine.state === "speaking";
  const isChoosing = machine.state === "choices";
  const isThinking = pending && !isSpeaking && !isChoosing;

  // Keyboard parity (tech-spec a11y baseline): while the box is open, Enter /
  // Space advance the dialogue and Escape always leaves. Read the signal fresh
  // inside the handler (no stale closure); focused buttons handle their own
  // Enter/Space natively.
  useEffect(() => {
    if (!dialogueVisible.value) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialogue();
        return;
      }
      if ((e.target as HTMLElement).closest("button")) return;
      if ((e.key === "Enter" || e.key === " ") && dialogueMachine.value.state === "speaking") {
        e.preventDefault();
        advanceDialogue();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialogueVisible.value]);

  if (!dialogueVisible.value || (machine.state === "idle" && !pending)) return null;

  // The current page; fall back to the full text (empty pages edge case).
  const pageText = machine.pages[machine.page] ?? machine.text;
  const multiPage = isSpeaking && machine.pages.length > 1;
  const thinkingName = pendingSpeaker.value ?? "…";

  return (
    <section className="dialogue-box" aria-live="polite">
      {isThinking ? (
        <p className="dialogue-text thinking">{t("dialogue.thinking", { name: thinkingName })}</p>
      ) : (
        <>
          {machine.speaker && <p className="speaker">{machine.speaker}</p>}
          <p className="dialogue-text">{pageText}</p>
          {multiPage && (
            <span className="page-indicator">
              {machine.page + 1}/{machine.pages.length}
            </span>
          )}
        </>
      )}

      {isSpeaking && (
        <button type="button" className="advance" onClick={advanceDialogue}>
          {t("dialogue.continue")}
        </button>
      )}

      {isChoosing && (
        <ul className="choices">
          {machine.options.map((option, index) => (
            <li key={`${index}-${option}`}>
              <button type="button" onClick={() => selectOption(index)}>
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Always-escape: a fixed affordance that ends the interaction — even
          while the model is thinking. */}
      <button type="button" className="leave" onClick={closeDialogue}>
        {t("dialogue.leave")}
      </button>
    </section>
  );
}
