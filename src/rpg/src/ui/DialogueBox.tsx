import {
  advanceDialogue,
  closeDialogue,
  dialogueMachine,
  dialoguePending,
  dialogueVisible,
  selectOption,
} from "../game/state/dialogue";

export function DialogueBox() {
  const machine = dialogueMachine.value;
  const pending = dialoguePending.value;
  if (!dialogueVisible.value || (machine.state === "idle" && !pending)) return null;

  const isSpeaking = machine.state === "speaking";
  const isChoosing = machine.state === "choices";
  const isThinking = pending && !isSpeaking && !isChoosing;

  return (
    <section className="dialogue-box" aria-live="polite">
      {isThinking ? (
        <p className="dialogue-text thinking">The elder is thinking…</p>
      ) : (
        <>
          {machine.speaker && <p className="speaker">{machine.speaker}</p>}
          <p className="dialogue-text">{machine.text}</p>
        </>
      )}

      {isSpeaking && (
        <button type="button" className="advance" onClick={advanceDialogue}>
          Continue
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
        Leave
      </button>
    </section>
  );
}
