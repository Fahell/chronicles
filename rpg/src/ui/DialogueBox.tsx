import {
  advanceDialogue,
  closeDialogue,
  dialogueMachine,
  dialogueVisible,
  selectOption,
} from "../game/state/dialogue";

export function DialogueBox() {
  const machine = dialogueMachine.value;
  if (!dialogueVisible.value || machine.state === "idle") return null;

  const isSpeaking = machine.state === "speaking";
  const isChoosing = machine.state === "choices";

  return (
    <section className="dialogue-box" aria-live="polite">
      {machine.speaker && <p className="speaker">{machine.speaker}</p>}
      <p className="dialogue-text">{machine.text}</p>

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

      {/* Always-escape: a fixed affordance that ends the interaction. */}
      <button type="button" className="leave" onClick={closeDialogue}>
        Leave
      </button>
    </section>
  );
}
