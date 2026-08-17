import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import type { NpcDefinition } from "../content/npcPool";
import { SPRITE_NEGATIVE_PROMPT } from "../content/sprite";
import { advanceScene, type DayState, sleep } from "../game/day/clock";
import { endDayAndPersist } from "../game/day/endDay";
import type { buildDayRecap } from "../game/day/recap";
import { parseChoices } from "../game/dialogue/parse-choices";
import { buildNpcInstruction } from "../game/payload/builder";
import { ensurePortrait, portraitsSignal } from "../game/portraits";
import {
  conversationSignal,
  dayStateFromSave,
  npcPortraitSeed,
  sessionSignal,
  updateSessionSave,
} from "../game/session";
import {
  appendPlayerAction,
  closePlayerInput,
  dialogueMachine,
  dialoguePending,
  dialogueVisible,
  pendingSpeaker,
  showTurn,
} from "../game/state/dialogue";
import { inspectorEnabled, inspectorOpen, toggleInspector } from "../game/state/inspector";
import { pauseOpen, shouldTogglePause, togglePause } from "../game/state/pause";
import type { Stage } from "../render/stage";
import { resolveCharacterSprite, resolvePortrait, type SpriteRequest } from "../scene/assets";
import type { BootServices } from "../services/boot";
import { currentLanguage, englishName, t } from "../services/i18n";
import { setRemovalQueue } from "../services/progress";
import { DialogueBox } from "./DialogueBox";
import { DevInspector } from "./screens/DevInspector";
import { PauseMenu } from "./screens/PauseMenu";

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
  const [resting, setResting] = useState(false);
  // Guards the follow-up effect so a choice fires exactly one generation.
  const followUpFired = useRef(false);

  // Day-cycle §4: appends one raw entry to the given NPC's character log. Raw
  // lore is append-only — fire-and-forget from the dialogue flows, never
  // blocking (the turn log is awaited so an immediate Rest sees it).
  const logTurn = useCallback(
    (npc: NpcDefinition, text: string): Promise<void> => {
      if (!session) return Promise.resolve();
      const day = dayStateFromSave(session.save.scene);
      return services.logs.append({
        slotId: session.save.slotId,
        characterId: npc.id,
        type: "turn",
        owner: "npc",
        dayId: day.day,
        period: day.period,
        text,
      });
    },
    [services.logs, session],
  );

  const logAction = useCallback(
    (npc: NpcDefinition, text: string) => {
      if (!session) return;
      const day = dayStateFromSave(session.save.scene);
      void services.logs.append({
        slotId: session.save.slotId,
        characterId: npc.id,
        type: "action",
        owner: "user",
        dayId: day.day,
        period: day.period,
        text,
      });
    },
    [services.logs, session],
  );

  // Day-cycle §3: the in-game clock lives in the save; every completed
  // dialogue turn consumes one interaction. When a period's budget is spent
  // the clock advances; when Night's budget is spent the day ends.
  const persistClock = useCallback(
    async (next: DayState): Promise<void> => {
      if (!session) return;
      const save = {
        ...session.save,
        scene: {
          ...session.save.scene,
          day: next.day,
          period: next.period,
          scenesInPeriod: next.scenesInPeriod,
        },
        updatedAt: Date.now(),
      };
      updateSessionSave(save);
      await services.saves.put(save);
    },
    [services.saves, session],
  );

  const showDayRecap = useCallback(
    (dayEnded: DayState, recap: ReturnType<typeof buildDayRecap>): void => {
      const lines = [
        t("day.recapTitle", { day: dayEnded.day }),
        ...recap.map((entry) => {
          const bond =
            entry.change === "closer"
              ? t("day.closer", { name: entry.npcName })
              : entry.change === "apart"
                ? t("day.apart", { name: entry.npcName })
                : t("day.unchanged", { name: entry.npcName });
          const memory = entry.memory
            ? "\n" + t("day.memory", { name: entry.npcName, memory: entry.memory })
            : "";
          return bond + memory;
        }),
      ];
      showTurn(t("dialogue.narrator"), lines.join("\n"), []);
    },
    [],
  );

  /** All NPCs present in the session (1..2). */
  const npcs = useCallback((): NpcDefinition[] => {
    if (!session) return [];
    return session.npc2 ? [session.npc, session.npc2] : [session.npc];
  }, [session]);

  /** Advances the clock one interaction; if the day ended, runs day-end. */
  const advanceClock = useCallback(async (): Promise<void> => {
    if (!session) return;
    const current = dayStateFromSave(session.save.scene);
    const next = advanceScene(current);
    await persistClock(next);
    if (next.day > current.day) {
      // Night's budget spent — the day ended by exhaustion (§3); run the
      // end-of-day processing against the day that just ended.
      const recap = await endDayAndPersist(services, session, current, next);
      showDayRecap(current, recap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistClock, services, session, showDayRecap]);

  /** The player rests: end the current day now (sleep is a player action, §3). */
  const rest = useCallback(async (): Promise<void> => {
    if (!session || resting) return;
    setResting(true);
    try {
      const current = dayStateFromSave(session.save.scene);
      const next = sleep(current);
      const recap = await endDayAndPersist(services, session, current, next);
      showDayRecap(current, recap);
    } finally {
      setResting(false);
    }
  }, [resting, services, session, showDayRecap]);

  const talk = useCallback(
    async (npc: NpcDefinition, conversation: typeof conversationSignal.value) => {
      if (!session) return;
      dialoguePending.value = true;
      dialogueVisible.value = true;
      pendingSpeaker.value = npc.name;
      try {
        const instruction = buildNpcInstruction({
          scene: session.buildManifest(),
          npc,
          coPresent: npcs().filter((other) => other.id !== npc.id),
          user: session.save.identity,
          conversation,
          language: englishName(currentLanguage()),
          day: dayStateFromSave(session.save.scene),
        });
        const result = await services.runtime.text.generate({ instruction });
        if (!dialogueVisible.value) return;
        const parsed = parseChoices(result.text);
        showTurn(npc.name, parsed.dialogue, parsed.options);
        // Day-cycle §4: the finished turn is raw lore — append it to the NPC's
        // character log BEFORE the clock advances, so an immediate Rest (day
        // end) never misses the last turn (the log is the run's input).
        await logTurn(npc, parsed.dialogue);
        void advanceClock();
      } catch (error) {
        if (!dialogueVisible.value) return;
        const message = error instanceof Error ? error.message : String(error);
        showTurn(npc.name, `The ${npc.name} could not answer. ${message}`, []);
      } finally {
        dialoguePending.value = false;
        pendingSpeaker.value = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, session, logTurn, advanceClock, npcs],
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
    // Day-cycle §4: the selected choice is the player's own action (lore),
    // logged to the NPC who was speaking (machine.speaker, last known).
    const speakerNpc = npcs().find((n) => n.name === machine.speaker) ?? session.npc;
    logAction(speakerNpc, choice ?? "");
    void talk(speakerNpc, conversationSignal.value);
  }, [dialogueMachine.value, session, talk, logAction, npcs]);

  // NPC bust portraits (round 10): fire-and-forget at scene boot so the
  // dialogue box has them by the first turn (async — adds zero wait time).
  useEffect(() => {
    if (!session) return;
    for (const npc of npcs()) {
      void ensurePortrait(services.assets, {
        entity: npc.id,
        seed: npcPortraitSeed(npc.id, session.save.scene.sceneId),
        prompt: npc.portraitPrompt,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, session]);

  // Esc dual behavior (vn-rpg-spec §8.2, round-10 decision): with a dialogue
  // open, Esc closes it; with no dialogue open, Esc toggles the pause menu.
  // Round-10 fix: gate on the dialogue state (deterministic, order-independent).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (!shouldTogglePause(dialogueVisible.value, e.defaultPrevented)) return;
      togglePause();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

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
      // The typed action is the player's own action — logged to the NPC who
      // was speaking (the free-form input only opens inside an NPC turn).
      const speakerNpc = npcs().find((n) => n.name === machine.speaker) ?? session.npc;
      logAction(speakerNpc, trimmed);
      void talk(speakerNpc, conversationSignal.value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, talk, logAction, npcs],
  );

  // Sprite re-roll (vn-rpg-spec §4.3, owner decision: sprites only): a fresh
  // seed busts the raw cache key → RMBG + matte re-run → the stage swaps the
  // actor's textures. The identity sprite is never re-rolled. Re-rolls the
  // PRIMARY NPC (the secondary stays as generated — a future per-NPC picker
  // is out of scope).
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
        {npcs().map((npc) => (
          <button
            key={npc.id}
            type="button"
            className="talk"
            onClick={() => void talk(npc, conversationSignal.value)}
          >
            {t("hud.talkTo", { name: npc.name })}
          </button>
        ))}
        <button
          type="button"
          className="re-roll"
          onClick={() => void reRoll()}
          disabled={rerolling}
        >
          {t("hud.reRoll")}
        </button>
        <button type="button" className="rest" onClick={() => void rest()} disabled={resting}>
          {t("hud.sleep")}
        </button>
        {inspectorEnabled.value && (
          <button
            type="button"
            className="dev-inspector-toggle"
            onClick={toggleInspector}
            aria-pressed={inspectorOpen.value}
          >
            {t("hud.devInspector")}
          </button>
        )}
      </div>
      <DialogueBox onSubmitAction={submitPlayerAction} />
      {inspectorEnabled.value && inspectorOpen.value && <DevInspector services={services} />}
      {pauseOpen.value && <PauseMenu services={services} />}
    </main>
  );
}
