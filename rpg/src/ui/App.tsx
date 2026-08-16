import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { SPRITE_NEGATIVE_PROMPT } from "../content/sprite";
import { parseChoices } from "../game/dialogue/parse-choices";
import { buildNpcInstruction } from "../game/payload/builder";
import { ensurePortrait, portraitsSignal } from "../game/portraits";
import { conversationSignal, npcPortraitSeed, sessionSignal } from "../game/session";
import {
  appendPlayerAction,
  closePlayerInput,
  dialogueMachine,
  dialoguePending,
  dialogueVisible,
  pendingSpeaker,
  showTurn,
} from "../game/state/dialogue";
import type { Stage } from "../render/stage";
import { resolveCharacterSprite, resolvePortrait, type SpriteRequest } from "../scene/assets";
import type { BootServices } from "../services/boot";
import { currentLanguage, englishName, t } from "../services/i18n";
import { setRemovalQueue } from "../services/progress";
import { DialogueBox } from "./DialogueBox";

interface AppProps {
  services: BootServices;
  stage: Stage;
}

/** Cap on the in-memory conversation log (the payload trims further). */
const CONVERSATION_CAP = 40;

let rerollCounter = 0;

export function App({ services, stage }: AppProps) {
  const session = sessionSignal.value;
  const [rerolling, setRerolling] = useState(false);
  // Guards the follow-up effect so a choice fires exactly one generation.
  const followUpFired = useRef(false);

  const talk = useCallback(
    async (conversation: typeof conversationSignal.value) => {
      if (!session) return;
      dialoguePending.value = true;
      dialogueVisible.value = true;
      pendingSpeaker.value = session.npc.name;
      try {
        const instruction = buildNpcInstruction({
          scene: session.buildManifest(),
          npc: session.npc,
          user: session.save.identity,
          conversation,
          language: englishName(currentLanguage()),
        });
        const result = await services.runtime.text.generate({ instruction });
        if (!dialogueVisible.value) return;
        const parsed = parseChoices(result.text);
        showTurn(session.npc.name, parsed.dialogue, parsed.options);
      } catch (error) {
        if (!dialogueVisible.value) return;
        const message = error instanceof Error ? error.message : String(error);
        showTurn(session.npc.name, `The ${session.npc.name} could not answer. ${message}`, []);
      } finally {
        dialoguePending.value = false;
        pendingSpeaker.value = null;
      }
    },
    [services, session],
  );

  // Multi-turn loop (owner decision): when the player picks an option, append
  // the choice + the finished turn to the conversation and immediately ask for
  // the NPC's follow-up — which may itself carry new choices. Leave (Escape)
  // always closes without a follow-up (selected === null).
  useEffect(() => {
    const machine = dialogueMachine.value;
    if (machine.state !== "ended" || machine.selected === null) {
      followUpFired.current = false;
      return;
    }
    if (followUpFired.current) return;
    followUpFired.current = true;
    if (!session) return;

    const choice = machine.options[machine.selected];
    const next = [
      ...conversationSignal.value,
      { speaker: "player", text: choice ?? "" },
      { speaker: machine.speaker ?? session.npc.name, text: machine.text },
    ];
    conversationSignal.value = next.slice(-CONVERSATION_CAP);
    void talk(conversationSignal.value);
  }, [dialogueMachine.value, session, talk]);

  // NPC bust portrait (round 10): fire-and-forget at scene boot so the
  // dialogue box has it by the first turn (async — adds zero wait time).
  useEffect(() => {
    if (!session) return;
    void ensurePortrait(services.assets, {
      entity: session.npc.id,
      seed: npcPortraitSeed(session.npc.id, session.save.scene.sceneId),
      prompt: session.npc.portraitPrompt,
    });
  }, [services, session]);

  // Free-form player action (round 10, owner decision): submit appends the
  // typed action + the finished NPC turn to the conversation, shows the
  // player's turn with their portrait, then asks the NPC follow-up.
  const submitPlayerAction = useCallback(
    (text: string) => {
      if (!session) return;
      closePlayerInput();
      const trimmed = text.trim();
      if (!trimmed) return;
      const machine = dialogueMachine.value;
      conversationSignal.value = appendPlayerAction(
        conversationSignal.value,
        machine,
        trimmed,
        CONVERSATION_CAP,
      );
      showTurn(session.save.identity.name, trimmed, []);
      void talk(conversationSignal.value);
    },
    [session, talk],
  );

  // Sprite re-roll (vn-rpg-spec §4.3, owner decision: sprites only): a fresh
  // seed busts the raw cache key → RMBG + matte re-run → the stage swaps the
  // actor's textures. The identity sprite is never re-rolled.
  const reRoll = useCallback(async () => {
    if (rerolling || !session) return;
    setRerolling(true);
    try {
      const req: SpriteRequest = {
        entity: session.npc.id,
        pose: "idle",
        prompt: session.npc.spritePrompt,
        seed: `rr-${++rerollCounter}-${Date.now()}`,
        negativePrompt: SPRITE_NEGATIVE_PROMPT,
      };
      const isProd = services.assets.mode === "prod";
      if (isProd) setRemovalQueue(0, 1);
      const textures = await resolveCharacterSprite(services.assets, req);
      if (isProd) setRemovalQueue(1, 1);
      stage.updateActor(session.npc.id, textures);
      // The portrait re-rolls together with the sprite (same seed → same
      // cache key family; round-10 owner decision).
      const portrait = await resolvePortrait(services.assets, {
        entity: session.npc.id,
        seed: req.seed,
        prompt: session.npc.portraitPrompt,
      });
      portraitsSignal.value = { ...portraitsSignal.value, [session.npc.id]: portrait };
    } finally {
      setRerolling(false);
    }
  }, [rerolling, services, session, stage]);

  useEffect(() => {
    return () => stage.destroy();
  }, [stage]);

  if (!session) return null;

  return (
    <main className="app">
      <div className="hud">
        <p className="muted">
          {services.mode} · {services.mocked ? "mock" : "platform"} runtime
        </p>
        <button type="button" className="talk" onClick={() => void talk(conversationSignal.value)}>
          {t("hud.talkTo", { name: session.npc.name })}
        </button>
        <button
          type="button"
          className="re-roll"
          onClick={() => void reRoll()}
          disabled={rerolling}
        >
          {t("hud.reRoll")}
        </button>
      </div>
      <DialogueBox onSubmitAction={submitPlayerAction} />
    </main>
  );
}
