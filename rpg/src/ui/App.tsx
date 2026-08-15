import { useCallback, useEffect } from "preact/hooks";

import { parseChoices } from "../game/dialogue/parse-choices";
import { showTurn } from "../game/state/dialogue";
import type { Stage } from "../render/stage";
import type { BootServices } from "../services/boot";
import { DialogueBox } from "./DialogueBox";

interface AppProps {
  services: BootServices;
  stage: Stage;
}

export function App({ services, stage }: AppProps) {
  const talk = useCallback(async () => {
    const result = await services.runtime.text.generate({
      instruction:
        "The player greets the village elder. Give them a short response with choices to continue the conversation.",
    });
    const parsed = parseChoices(result.text);
    showTurn("Elder", parsed.dialogue, parsed.options);
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
