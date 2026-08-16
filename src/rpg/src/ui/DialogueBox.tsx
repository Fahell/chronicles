import { useEffect, useRef } from "preact/hooks";

import { portraitFor } from "../game/portraits";
import { sessionSignal } from "../game/session";
import {
  advanceDialogue,
  closeDialogue,
  closePlayerInput,
  dialogueMachine,
  dialoguePending,
  dialogueVisible,
  openPlayerInput,
  PLAYER_ACTION_MAX,
  pendingSpeaker,
  playerInputOpen,
  selectOption,
} from "../game/state/dialogue";
import { t } from "../services/i18n";

interface DialogueBoxProps {
  /** Submits a typed free-form player action (round 10). */
  onSubmitAction?: (text: string) => void;
}

export function DialogueBox({ onSubmitAction }: DialogueBoxProps) {
  const machine = dialogueMachine.value;
  const pending = dialoguePending.value;
  const inputOpen = playerInputOpen.value;
  const session = sessionSignal.value;

  const isSpeaking = machine.state === "speaking";
  const isChoosing = machine.state === "choices";
  const isThinking = pending && !isSpeaking && !isChoosing;

  // The current speaker's bust portrait (NPC or player; narrator has none).
  const portrait = portraitFor(machine.speaker, session);

  // Keyboard parity (tech-spec a11y baseline): while the box is open, Enter /
  // Space advance the dialogue and Escape always leaves. Escape closes the
  // free-form input first when it is open (round 10). Read the signal fresh
  // inside the handler (no stale closure); focused buttons handle their own
  // Enter/Space natively.
  useEffect(() => {
    if (!dialogueVisible.value) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (playerInputOpen.value) {
          closePlayerInput();
          return;
        }
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
      {portrait && (
        <div className="portrait-frame" aria-hidden="true">
          <img className="portrait-img" src={portrait} alt="" />
        </div>
      )}

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

      {inputOpen ? (
        <PlayerActionInput onSubmit={onSubmitAction} />
      ) : (
        <>
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
              {/* Fixed free-form option (round 10, owner decision): the player
                  can always write their own action when choices are offered. */}
              <li>
                <button type="button" className="choice-custom" onClick={openPlayerInput}>
                  {t("dialogue.writeOwnAction")}
                </button>
              </li>
            </ul>
          )}
        </>
      )}

      {/* Always-escape: a fixed affordance that ends the interaction — even
          while the model is thinking. */}
      <button type="button" className="leave" onClick={closeDialogue}>
        {t("dialogue.leave")}
      </button>
    </section>
  );
}

/** The free-form player action input box (round 10): player portrait + textarea. */
function PlayerActionInput({ onSubmit }: { onSubmit?: (text: string) => void }) {
  const session = sessionSignal.value;
  const portrait = portraitFor(session?.save.identity.name ?? null, session);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard-first a11y (tech-spec §5.5): focus lands in the textarea as soon
  // as the input opens — no autoFocus attribute (Biome a11y rule).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      className="player-action"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const input = form.elements.namedItem("action") as HTMLTextAreaElement;
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        onSubmit?.(text);
      }}
    >
      {portrait && (
        <div className="portrait-frame portrait-frame-input" aria-hidden="true">
          <img className="portrait-img" src={portrait} alt="" />
        </div>
      )}
      <div className="player-action-fields">
        <textarea
          ref={inputRef}
          name="action"
          className="player-action-input"
          placeholder={t("dialogue.actionPlaceholder")}
          maxLength={PLAYER_ACTION_MAX}
          rows={2}
        />
        <div className="player-action-buttons">
          <button type="submit" className="advance">
            {t("dialogue.send")}
          </button>
          <button type="button" className="leave" onClick={closePlayerInput}>
            {t("dialogue.cancel")}
          </button>
        </div>
      </div>
    </form>
  );
}
