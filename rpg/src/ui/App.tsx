import { useCallback, useEffect } from "preact/hooks";
import { parseChoices } from "../game/dialogue/parse-choices";
import { dialogueInstruction } from "../game/dialogue/prompts";
import { dialoguePending, dialogueVisible, showTurn } from "../game/state/dialogue";
import type { Stage } from "../render/stage";
import type { BootServices } from "../services/boot";
import { DialogueBox } from "./DialogueBox";

interface AppProps {
  services: BootServices;
  stage: Stage;
}

export function App({ services, stage }: AppProps) {
  const talk = useCallback(async () => {
    // Show the thinking box immediately; Leave stays available (always-escape).
    dialoguePending.value = true;
    dialogueVisible.value = true;

    try {
      const result = await services.runtime.text.generate({
        instruction: dialogueInstruction(
          "The player greets the village elder. Reply in character, briefly, as the elder of the open-plains village.",
        ),
      });
      // The player may have left while the model was thinking — drop the turn.
      if (!dialogueVisible.value) return;
      const parsed = parseChoices(result.text);
      showTurn("Elder", parsed.dialogue, parsed.options);
    } catch (error) {
      if (!dialogueVisible.value) return;
      const message = error instanceof Error ? error.message : String(error);
      showTurn("Elder", `The elder could not answer. ${message}`, []);
    } finally {
      dialoguePending.value = false;
    }
  }, [services]);

  useEffect(() => {
    return () => stage.destroy();
  }, [stage]);

  return (
    <main className="app">
      <div className="hud">
        <p className="muted">
          {services.mode} · {services.mocked ? "mock" : "platform"} runtime
        </p>
        <button type="button" onClick={talk}>
          Talk to the elder
        </button>
      </div>
      <DialogueBox />
    </main>
  );
}
