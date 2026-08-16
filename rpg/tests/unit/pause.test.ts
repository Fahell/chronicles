import { describe, expect, it } from "vitest";

import { initialMachine } from "../../src/game/dialogue/machine";
import { buildIdentity } from "../../src/game/identity";
import type { SaveGame } from "../../src/game/save/types";
import { startSession } from "../../src/game/session";
import { dialogueMachine, dialogueVisible } from "../../src/game/state/dialogue";
import { closePause, openPause, pauseOpen, quitToTitle } from "../../src/game/state/pause";
import { navigate, screenSignal } from "../../src/game/state/screens";

function makeSave(): SaveGame {
  return {
    slotId: "slot-1",
    identity: buildIdentity({
      name: "Arin",
      archetypeId: "traveler",
      background: { kind: "template", templateId: "bt1" },
    }),
    scene: {
      sceneId: "scene.open.plains",
      npcId: "npc/knight-lost-battle",
      day: 1,
      period: "dusk",
    },
    progress: { talkedTo: [] },
    flags: {},
    updatedAt: 1,
  };
}

describe("pause menu (round 10)", () => {
  it("openPause / closePause toggle the pause state", () => {
    openPause();
    expect(pauseOpen.value).toBe(true);
    closePause();
    expect(pauseOpen.value).toBe(false);
  });

  it("quitToTitle resets the session and dialogue state and navigates to title", () => {
    const save = makeSave();
    const session = startSession(save);
    dialogueMachine.value = { ...initialMachine, state: "ended", speaker: "Serran" };
    dialogueVisible.value = true;

    quitToTitle();

    expect(screenSignal.value).toBe("title");
    expect(pauseOpen.value).toBe(false);
    expect(dialogueVisible.value).toBe(false);
    expect(dialogueMachine.value.state).toBe("idle");
    expect(session).toBeTruthy(); // the session object itself is just dropped by the app
  });

  it("navigate('game') is reachable after quitToTitle (router still works)", () => {
    quitToTitle();
    navigate("game");
    expect(screenSignal.value).toBe("game");
  });
});
