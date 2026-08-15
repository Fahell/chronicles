# Type-C Open-Variant Scene Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP scene slice per `tech-spec.md` §12.4 — a type-C open-variant scene (three.js floor + backdrop planes from the approved POC), placeholder sprites standing on the floor, Preact dialogue UI with choices, and always-escape.

**Architecture:** The app keeps a thin `Stage` interface; a `ThreeStage` implementation builds the 3D scene from a `SceneManifest` (type C) and the scene layout math. Assets resolve through the existing `AssetCache` (mock in dev) by manifest key. The dialogue machine (pure logic, narrative-spec §3.1 + tech-spec §7.1) drives a Preact overlay. three.js is loaded lazily via dynamic import (async chunk — never in the initial bundle).

**Tech Stack:** TypeScript (strict, TS 7.x), Vite, Preact + `@preact/signals`, three.js (0.185.x, lazy chunk), Valibot (manifest schema v1), Dexie via `fake-indexeddb` (integration tests), Biome, Vitest.

## Global Constraints

- **TypeScript strict** everywhere under `rpg/`; JSX only in `.tsx` files.
- **three.js is loaded lazily only** — via `await import("three")`; the initial bundle must never contain it (tech-spec §2.1/§4.1). Verified by an e2e build-gate assertion.
- **The rest of the app never imports a renderer directly** — everything goes through the `Stage` interface (tech-spec §2.1).
- **Assets are referenced by key, never inlined** — the cache is the source of truth for pixels (tech-spec §5.3).
- **SceneManifest schema v1** (Valibot) — extended for type C with optional fields; existing fields stay valid (no breaking change).
- **Pixel-art crispness:** `NearestFilter` for raster textures (tech-spec §5.1).
- **Viewport:** logical 1280×720, contain/letterbox (existing `viewport.ts`), `devicePixelRatio` capped at 2.
- **Dialogue choices format** (narrative-spec §3.1): `[choices]` alone on its own line; options `N. <text>`, at most 4; escaped `\[choices\]`; parser never throws, degrades to dialogue-only.
- **Always-escape** is a first-class action (narrative-spec §3): a fixed "Leave" affordance in/near the dialogue box ends the interaction.
- **No app-level retry/timeout on plugin content** (pending-decisions §5) — the adapter only surfaces loading state.
- **Mock harness is dev-only** and must stay tree-shaken out of the production bundle (inline `import.meta.env.DEV` gate).
- **Test tiers:** unit (pure logic, fast), integration (stores/services + `fake-indexeddb`), e2e (committed build via CDP MCP + build-gate assertions).
- **All artifacts in English**; Conventional Commits with scope `rpg` (`feat(rpg): …`); commit `rpg/build/` when the bundle changes.

---

### Task 1: Extend the SceneManifest schema v1 for type C

**Files:**
- Modify: `rpg/src/scene/types.ts`
- Test: `rpg/tests/unit/scene-c.test.ts` (new)

**Interfaces:**
- Consumes: existing `sceneManifestSchemaV1` (Valibot object schema).
- Produces: extended schema + `SceneManifest` type with new optional fields:
  - `backdrop.prompt?: string` — image generation prompt (the plugin prompt; feeds `AssetCache.getOrGenerate`).
  - `backdrop.depth?: number`, `backdrop.height?: number`, `backdrop.scale?: number` — backdrop plane placement (type C).
  - `floor.assetKey?: string`, `floor.prompt?: string`, `floor.depth?: number`, `floor.scale?: number` — ground plane (type C); existing `line`/`scaleAnchor` (type A hooks) stay.
  - `camera.fov?: number`, `camera.height?: number`, `camera.pitch?: number` — fixed camera parameters (type C).
  - `actors[].position` becomes `{ x: number; z: number }` (ground-plane coords) plus `actors[].scale?: number`. **This is a deliberate breaking change of the v1 draft** (type C is the approved baseline; nothing in production depends on the old `{x,y}` form).

- [ ] **Step 1: Write the failing test** — `rpg/tests/unit/scene-c.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseSceneManifest } from "../../src/scene/loader";
import type { SceneManifest } from "../../src/scene/types";

const openPlains: SceneManifest = {
  schemaVersion: 1,
  id: "scene.open.plains",
  type: "C",
  backdrop: {
    assetKey: "backdrops/plains",
    prompt: "Wide frontal background plate for an open fantasy scene…",
    description: "A vast open valley beneath a twilight sky.",
    depth: -10,
    height: 6.3,
    scale: 1,
  },
  floor: {
    assetKey: "floors/plains",
    prompt: "Pixel-art ground texture for an open fantasy landscape…",
    depth: -2.2,
    scale: 0.7,
  },
  effects: [],
  actors: [
    { characterId: "npc/elder", pose: "idle", position: { x: -2.2, z: -3.4 } },
    { characterId: "player", pose: "idle", position: { x: 0.1, z: -0.3 }, scale: 1 },
  ],
  camera: { mode: "fixed", fov: 52, height: 2, pitch: 2 },
};

describe("type C manifest (schema v1 extended)", () => {
  it("parses a full type-C manifest with optional placement fields", () => {
    const manifest = parseSceneManifest(openPlains);

    expect(manifest.type).toBe("C");
    expect(manifest.backdrop.depth).toBe(-10);
    expect(manifest.camera.fov).toBe(52);
    expect(manifest.actors[0]?.position).toEqual({ x: -2.2, z: -3.4 });
  });

  it("still accepts the minimal v1 manifest (backward compatible)", () => {
    const minimal = parseSceneManifest({
      schemaVersion: 1,
      id: "scene.a",
      type: "A",
      backdrop: { assetKey: "b", description: "d" },
      effects: [],
      actors: [],
      camera: { mode: "fixed" },
    });

    expect(minimal.type).toBe("A");
  });

  it("rejects an actor position without z", () => {
    expect(() =>
      parseSceneManifest({
        ...openPlains,
        actors: [{ characterId: "x", pose: "idle", position: { x: 1 } }],
      }),
    ).toThrow(/Invalid scene manifest/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit scene-c`
Expected: FAIL — `backdrop.prompt` / `floor.assetKey` / `actors[].position.z` not in the schema.

- [ ] **Step 3: Implement the schema extension** in `rpg/src/scene/types.ts`:

```ts
import {
  array,
  type InferInput,
  literal,
  looseObject,
  number,
  object,
  optional,
  string,
  union,
} from "valibot";

/** Actor placed on the ground plane (type C: x/z coords; y derived from scale). */
const actorSchemaV1 = object({
  characterId: string(),
  pose: string(),
  position: object({ x: number(), z: number() }),
  scale: optional(number()),
});

export const sceneManifestSchemaV1 = object({
  schemaVersion: literal(1),
  id: string(),
  type: union([literal("A"), literal("B"), literal("C")]),
  backdrop: object({
    assetKey: string(),
    prompt: optional(string()),
    description: string(),
    depth: optional(number()),
    height: optional(number()),
    scale: optional(number()),
  }),
  effects: array(object({ kind: string(), params: looseObject({}) })),
  actors: array(actorSchemaV1),
  transitions: optional(object({ enter: string(), exit: string() })),
  floor: optional(
    object({
      assetKey: optional(string()),
      prompt: optional(string()),
      depth: optional(number()),
      scale: optional(number()),
      line: optional(number()),
      scaleAnchor: optional(
        object({ x: number(), y: number(), size: number() }),
      ),
    }),
  ),
  camera: object({
    mode: literal("fixed"),
    fov: optional(number()),
    height: optional(number()),
    pitch: optional(number()),
  }),
});

export type SceneManifest = InferInput<typeof sceneManifestSchemaV1>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd rpg && pnpm test:unit -- --project unit scene` (runs `scene.test.ts` + `scene-c.test.ts`)
Expected: PASS — both the existing minimal-manifest tests and the new type-C tests.

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/types.ts rpg/tests/unit/scene-c.test.ts
git commit -m "feat(rpg): extend SceneManifest v1 for type C (camera, floor, backdrop placement, actor x/z)"
```

---

### Task 2: Scene layout math (pure, unit-tested)

**Files:**
- Create: `rpg/src/scene/layout.ts`
- Test: `rpg/tests/unit/layout.test.ts`

**Interfaces:**
- Consumes: `SceneManifest` (from Task 1).
- Produces:
  - `SceneLayout` type: `{ camera: { position: Vec3; lookAt: Vec3; fov: number }; ground: PlanePlacement; backdrop: PlanePlacement; actors: ActorPlacement[] }` where `PlanePlacement = { width: number; height: number; position: Vec3; scale: number }`, `ActorPlacement = { characterId: string; pose: string; position: Vec3; scale: number }`, `Vec3 = { x: number; y: number; z: number }`.
  - `computeSceneLayout(manifest: SceneManifest): SceneLayout` — pure; defaults match the **approved POC preferred configuration** (camera height 2.0, pitch 2.0, backdrop depth −10.0, ground scale 0.70, backdrop height 6.3, ground depth −2.2, FOV 52) and the POC geometry (ground plane 24×22, backdrop plane 30×20, camera at z 9, lookAt (0, pitch, −6), actor center y = 1.05×scale).

- [ ] **Step 1: Write the failing test** — `rpg/tests/unit/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { computeSceneLayout } from "../../src/scene/layout";
import type { SceneManifest } from "../../src/scene/types";

const manifest: SceneManifest = {
  schemaVersion: 1,
  id: "scene.open.plains",
  type: "C",
  backdrop: { assetKey: "b", description: "d", depth: -10, height: 6.3, scale: 1 },
  floor: { assetKey: "f", depth: -2.2, scale: 0.7 },
  effects: [],
  actors: [
    { characterId: "npc/elder", pose: "idle", position: { x: -2.2, z: -3.4 } },
  ],
  camera: { mode: "fixed", fov: 52, height: 2, pitch: 2 },
};

describe("computeSceneLayout", () => {
  it("applies the approved POC defaults", () => {
    const layout = computeSceneLayout(manifest);

    expect(layout.camera.position).toEqual({ x: 0, y: 2, z: 9 });
    expect(layout.camera.lookAt).toEqual({ x: 0, y: 2, z: -6 });
    expect(layout.camera.fov).toBe(52);
    expect(layout.ground.position).toEqual({ x: 0, y: 0, z: -2.2 });
    expect(layout.ground.scale).toBe(0.7);
    expect(layout.backdrop.position).toEqual({ x: 0, y: 6.3, z: -10 });
  });

  it("derives actor y from scale (center of a 2.1-unit-tall sprite)", () => {
    const layout = computeSceneLayout(manifest);
    expect(layout.actors[0]?.position).toEqual({ x: -2.2, y: 1.05, z: -3.4 });
  });

  it("falls back to defaults when camera fields are absent", () => {
    const minimal: SceneManifest = {
      schemaVersion: 1,
      id: "s",
      type: "C",
      backdrop: { assetKey: "b", description: "d" },
      effects: [],
      actors: [],
      camera: { mode: "fixed" },
    };
    const layout = computeSceneLayout(minimal);

    expect(layout.camera.fov).toBe(52);
    expect(layout.camera.position.y).toBe(2);
    expect(layout.backdrop.position.z).toBe(-10);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit layout`
Expected: FAIL — `computeSceneLayout` does not exist.

- [ ] **Step 3: Implement `rpg/src/scene/layout.ts`** (full file):

```ts
import type { SceneManifest } from "./types";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlanePlacement {
  width: number;
  height: number;
  position: Vec3;
  scale: number;
}

export interface ActorPlacement {
  characterId: string;
  pose: string;
  position: Vec3;
  scale: number;
}

export interface SceneLayout {
  camera: { position: Vec3; lookAt: Vec3; fov: number };
  ground: PlanePlacement;
  backdrop: PlanePlacement;
  actors: ActorPlacement[];
}

/** Approved POC preferred configuration (templates/open-scene-poc README). */
export const DEFAULT_SCENE_CONFIG = {
  cameraHeight: 2,
  cameraPitch: 2,
  cameraZ: 9,
  lookAtY: 2,
  lookAtZ: -6,
  fov: 52,
  groundWidth: 24,
  groundHeight: 22,
  groundDepth: -2.2,
  groundScale: 0.7,
  backdropWidth: 30,
  backdropHeight: 20,
  backdropDepth: -10,
  backdropHeightY: 6.3,
  backdropScale: 1,
  /** Sprite plane height in world units at scale 1 (POC). */
  actorHeight: 2.1,
} as const;

/** Pure scene layout derived from the manifest — no three.js involved. */
export function computeSceneLayout(manifest: SceneManifest): SceneLayout {
  const c = DEFAULT_SCENE_CONFIG;
  const fov = manifest.camera.fov ?? c.fov;
  const camY = manifest.camera.height ?? c.cameraHeight;
  const pitch = manifest.camera.pitch ?? c.cameraPitch;

  const backdropScale = manifest.backdrop.scale ?? c.backdropScale;
  const groundScale = manifest.floor?.scale ?? c.groundScale;
  const groundDepth = manifest.floor?.depth ?? c.groundDepth;

  const actors: ActorPlacement[] = manifest.actors.map((a) => {
    const scale = a.scale ?? 1;
    return {
      characterId: a.characterId,
      pose: a.pose,
      position: { x: a.position.x, y: (c.actorHeight * scale) / 2, z: a.position.z },
      scale,
    };
  });

  return {
    camera: {
      position: { x: 0, y: camY, z: c.cameraZ },
      lookAt: { x: 0, y: pitch, z: c.lookAtZ },
      fov,
    },
    ground: {
      width: c.groundWidth,
      height: c.groundHeight,
      position: { x: 0, y: 0, z: groundDepth },
      scale: groundScale,
    },
    backdrop: {
      width: c.backdropWidth,
      height: c.backdropHeight,
      position: { x: 0, y: manifest.backdrop.height ?? c.backdropHeightY, z: manifest.backdrop.depth ?? c.backdropDepth },
      scale: backdropScale,
    },
    actors,
  };
}
```

> Note: `DEFAULT_SCENE_CONFIG` is the layout's single source of tuning — the owner's approved preset lives here, not scattered in the renderer.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd rpg && pnpm test:unit -- --project unit layout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/layout.ts rpg/tests/unit/layout.test.ts
git commit -m "feat(rpg): add pure scene layout math with the approved POC defaults"
```

---

### Task 3: `[choices]` dialogue parser (pure, unit-tested)

**Files:**
- Create: `rpg/src/game/dialogue/parse-choices.ts`
- Test: `rpg/tests/unit/parse-choices.test.ts`

**Interfaces:**
- Consumes: nothing (plain text in).
- Produces:
  - `interface ParsedDialogue { dialogue: string; options: string[] }` (options capped at 4, trimmed, deduped).
  - `parseChoices(text: string): ParsedDialogue` — implements the narrative-spec §3.1 contract exactly.

- [ ] **Step 1: Write the failing test** — `rpg/tests/unit/parse-choices.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseChoices } from "../../src/game/dialogue/parse-choices";

describe("parseChoices (narrative-spec §3.1)", () => {
  it("splits dialogue text from the [choices] block", () => {
    const { dialogue, options } = parseChoices(
      "The elder studies you.\n\n[choices]\n1. Ask about the ruins\n2. Offer your help",
    );

    expect(dialogue).toContain("The elder studies you.");
    expect(options).toEqual(["Ask about the ruins", "Offer your help"]);
  });

  it("returns all text as dialogue when the marker is absent", () => {
    const { dialogue, options } = parseChoices("Just a line of dialogue.");

    expect(dialogue).toBe("Just a line of dialogue.");
    expect(options).toEqual([]);
  });

  it("treats a marker with zero valid options as dialogue-only", () => {
    const { dialogue, options } = parseChoices("Dialogue.\n\n[choices]\nnot a numbered option");

    expect(dialogue).toContain("Dialogue.");
    expect(options).toEqual([]);
  });

  it("caps options at 4 and trims them", () => {
    const { options } = parseChoices(
      "[choices]\n1. a\n2. b\n3. c\n4. d\n5. e",
    );

    expect(options).toHaveLength(4);
    expect(options[0]).toBe("a");
  });

  it("handles the escaped literal \\[choices\\] as dialogue text", () => {
    const { dialogue, options } = parseChoices(
      "He said \\[choices\\] are important.\n\n[choices]\n1. Agree",
    );

    expect(dialogue).toContain("[choices] are important.");
    expect(options).toEqual(["Agree"]);
  });

  it("never throws on malformed input", () => {
    expect(() => parseChoices("")).not.toThrow();
    expect(() => parseChoices("[choices]")).not.toThrow();
    expect(() => parseChoices("1. no marker")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit parse-choices`
Expected: FAIL — module/function does not exist.

- [ ] **Step 3: Implement `rpg/src/game/dialogue/parse-choices.ts`** (full file):

```ts
export interface ParsedDialogue {
  dialogue: string;
  options: string[];
}

const CHOICE_MARKER = "[choices]";
const MAX_OPTIONS = 4;

/**
 * Parses the AI-proposed choices format (narrative-spec §3.1):
 * - `[choices]` alone on its own line starts the block; everything before is dialogue;
 * - each option is `N. <text>` on its own line, at most 4;
 * - a literal `\[choices\]` inside dialogue is unescaped to literal text;
 * - marker absent → all dialogue, no options;
 * - marker with zero valid options → dialogue-only;
 * - malformed lines are dropped individually; dedupe/trim/cap at 4;
 * - never throws — any failure degrades to dialogue-only.
 */
export function parseChoices(text: string): ParsedDialogue {
  const lines = text.split("\n");

  const markerIndex = lines.findIndex(
    (line) => line.trim() === CHOICE_MARKER,
  );

  if (markerIndex === -1) {
    return { dialogue: unescapeMarker(text), options: [] };
  }

  const dialogue = lines
    .slice(0, markerIndex)
    .join("\n")
    .replace(/\\\[choices\]/g, CHOICE_MARKER)
    .trim();

  const options: string[] = [];
  for (const line of lines.slice(markerIndex + 1)) {
    if (options.length >= MAX_OPTIONS) break;
    const match = /^\s*\d+\.\s+(.+)$/.exec(line.trim());
    const optionText = match?.[1]?.trim();
    if (optionText && !options.includes(optionText)) {
      options.push(optionText);
    }
  }

  return { dialogue, options };
}

function unescapeMarker(text: string): string {
  return text.replace(/\\\[choices\]/g, CHOICE_MARKER).trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd rpg && pnpm test:unit -- --project unit parse-choices`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/game/dialogue/parse-choices.ts rpg/tests/unit/parse-choices.test.ts
git commit -m "feat(rpg): add the [choices] dialogue parser per narrative-spec §3.1"
```

---

### Task 4: Dialogue machine + signals store (pure logic, unit-tested)

**Files:**
- Create: `rpg/src/game/dialogue/machine.ts`
- Modify: `rpg/src/game/state/dialogue.ts` (extend the existing trivial store)
- Test: `rpg/tests/unit/dialogue-machine.test.ts`

**Interfaces:**
- Consumes: `ParsedDialogue` from Task 3.
- Produces (machine.ts):
  - `type DialogueState = "idle" | "speaking" | "choices" | "ended"`.
  - `interface DialogueTurn { speaker: string; text: string; options: string[] }`.
  - `interface DialogueMachine { state: DialogueState; speaker: string | null; text: string; options: string[]; selected: number | null; begin(turn: DialogueTurn): DialogueMachine; selectOption(index: number): DialogueMachine; escape(): DialogueMachine; advance(): DialogueMachine }` — a **pure reducer**: every method returns a new machine snapshot (no class mutation), so it is trivially testable and feeds a signals store.
  - Transitions: `begin` from `idle` → `speaking` (no options) or `choices` (options present); `selectOption` from `choices` → `ended` (records `selected`); `escape` from `speaking`/`choices` → `ended` (always-escape); `advance` from `speaking` → `ended`.

- [ ] **Step 1: Write the failing test** — `rpg/tests/unit/dialogue-machine.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  beginDialogue,
  advanceDialogue,
  chooseOption,
  escapeDialogue,
  initialMachine,
} from "../../src/game/dialogue/machine";

describe("dialogue machine", () => {
  it("begins in idle", () => {
    expect(initialMachine.state).toBe("idle");
  });

  it("goes to speaking for a line without options", () => {
    const machine = beginDialogue({ speaker: "Narrator", text: "A wind blows.", options: [] });
    expect(machine.state).toBe("speaking");
    expect(machine.speaker).toBe("Narrator");
  });

  it("goes to choices when options are present", () => {
    const machine = beginDialogue({
      speaker: "Elder",
      text: "What will you do?",
      options: ["Ask", "Leave"],
    });
    expect(machine.state).toBe("choices");
    expect(machine.options).toHaveLength(2);
  });

  it("selecting an option ends the turn and records the choice", () => {
    const machine = chooseOption(
      beginDialogue({ speaker: "Elder", text: "t", options: ["A", "B"] }),
      1,
    );
    expect(machine.state).toBe("ended");
    expect(machine.selected).toBe(1);
  });

  it("escape always ends the interaction (always-escape)", () => {
    const speaking = escapeDialogue(beginDialogue({ speaker: "Elder", text: "t", options: [] }));
    const choosing = escapeDialogue(beginDialogue({ speaker: "Elder", text: "t", options: ["A"] }));

    expect(speaking.state).toBe("ended");
    expect(choosing.state).toBe("ended");
  });

  it("advance ends a speaking turn", () => {
    const machine = advanceDialogue(beginDialogue({ speaker: "N", text: "t", options: [] }));
    expect(machine.state).toBe("ended");
  });

  it("ignore escapes when already ended (idempotent)", () => {
    const ended = escapeDialogue(initialMachine);
    expect(escapeDialogue(ended).state).toBe("idle");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:unit -- --project unit dialogue-machine`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `rpg/src/game/dialogue/machine.ts`** (full file):

```ts
export type DialogueState = "idle" | "speaking" | "choices" | "ended";

export interface DialogueTurn {
  speaker: string;
  text: string;
  options: string[];
}

export interface DialogueMachine {
  state: DialogueState;
  speaker: string | null;
  text: string;
  options: string[];
  selected: number | null;
}

export const initialMachine: DialogueMachine = {
  state: "idle",
  speaker: null,
  text: "",
  options: [],
  selected: null,
};

/** Pure reducer: returns a new snapshot, never mutates. */
export function beginDialogue(
  turn: DialogueTurn,
  previous: DialogueMachine = initialMachine,
): DialogueMachine {
  if (previous.state !== "idle" && previous.state !== "ended") {
    return previous;
  }
  return {
    ...previous,
    state: turn.options.length > 0 ? "choices" : "speaking",
    speaker: turn.speaker,
    text: turn.text,
    options: turn.options,
    selected: null,
  };
}

export function chooseOption(
  machine: DialogueMachine,
  index: number,
): DialogueMachine {
  if (machine.state !== "choices" || index < 0 || index >= machine.options.length) {
    return machine;
  }
  return { ...machine, state: "ended", selected: index };
}

export function escapeDialogue(machine: DialogueMachine): DialogueMachine {
  if (machine.state === "idle" || machine.state === "ended") return machine;
  return { ...machine, state: "ended", selected: null };
}

export function advanceDialogue(machine: DialogueMachine): DialogueMachine {
  if (machine.state !== "speaking") return machine;
  return { ...machine, state: "ended" };
}
```

- [ ] **Step 4: Extend the signals store** — replace `rpg/src/game/state/dialogue.ts` with:

```ts
import { signal } from "@preact/signals";

import { initialMachine, type DialogueMachine } from "../dialogue/machine";

export const dialogueMachine = signal<DialogueMachine>(initialMachine);

export const dialogueVisible = signal(false);

export function showTurn(speaker: string, text: string, options: string[] = []) {
  dialogueMachine.value = beginDialogue({ speaker, text, options });
  dialogueVisible.value = true;
}

export function selectOption(index: number) {
  dialogueMachine.value = chooseOption(dialogueMachine.value, index);
}

export function closeDialogue() {
  dialogueMachine.value = escapeDialogue(dialogueMachine.value);
  dialogueVisible.value = false;
}

export function advanceDialogue() {
  dialogueMachine.value = advanceDialogue(dialogueMachine.value);
}
```

> Note: the store must import `beginDialogue`/`chooseOption`/`escapeDialogue`/`advanceDialogue` from `../dialogue/machine` — the file above implies the exact imports; write them explicitly.

- [ ] **Step 5: Run the machine + store tests**

Run: `cd rpg && pnpm test:unit -- --project unit dialogue`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/game/dialogue/ rpg/src/game/state/dialogue.ts rpg/tests/unit/dialogue-machine.test.ts
git commit -m "feat(rpg): add the dialogue machine (pure reducer) with always-escape"
```

---

### Task 5: Concrete type-C scene manifest (open plains)

**Files:**
- Create: `rpg/src/scene/manifest/openPlains.ts`

**Interfaces:**
- Consumes: `SceneManifest` type + `parseSceneManifest` (Task 1); the two approved image prompts verbatim from `open-scene-image-prompts.txt`.
- Produces: `export const openPlainsManifest: SceneManifest` (or `unknown` — validated at load by the loader).

- [ ] **Step 1: Create `rpg/src/scene/manifest/openPlains.ts`**

Copy the **GROUND PROMPT** and **LANDSCAPE BACKGROUND PROMPT** text verbatim from `open-scene-image-prompts.txt` into `floor.prompt` / `backdrop.prompt`. Use the approved POC preferred configuration values (Task 2 defaults) and two actors:

```ts
import type { SceneManifest } from "../types";

const groundPrompt =
  "Pixel-art ground texture for an open fantasy landscape used in a 3D visual-novel scene. " +
  /* …copy the GROUND PROMPT verbatim from open-scene-image-prompts.txt… */;

const backdropPrompt =
  "Wide frontal background plate for an open fantasy visual-novel scene rendered with pixel art. " +
  /* …copy the LANDSCAPE BACKGROUND PROMPT verbatim… */;

export const openPlainsManifest = {
  schemaVersion: 1,
  id: "scene.open.plains",
  type: "C",
  backdrop: {
    assetKey: "scenes/open-plains/backdrop",
    prompt: backdropPrompt,
    description:
      "A vast open valley beneath a twilight sky; a distant castle on the right, rocky spires on the left; the central horizon stays open and readable.",
    depth: -10,
    height: 6.3,
    scale: 1,
  },
  floor: {
    assetKey: "scenes/open-plains/floor",
    prompt: groundPrompt,
    depth: -2.2,
    scale: 0.7,
  },
  effects: [],
  actors: [
    { characterId: "player", pose: "idle", position: { x: 0.1, z: -0.3 } },
    {
      characterId: "npc/elder",
      pose: "idle",
      position: { x: -2.2, z: -3.4 },
      scale: 1,
    },
  ],
  camera: { mode: "fixed", fov: 52, height: 2, pitch: 2 },
} satisfies SceneManifest;
```

- [ ] **Step 2: Verify the manifest parses** (quick guard via the existing loader in a one-off node run, or add it to the Task-1 test file):

Run: `cd rpg && pnpm test:unit -- --project unit scene-c`
Then add to `scene-c.test.ts`:

```ts
it("openPlainsManifest parses as a valid type-C manifest", () => {
  const parsed = parseSceneManifest(openPlainsManifest);
  expect(parsed.type).toBe("C");
  expect(parsed.floor?.assetKey).toBe("scenes/open-plains/floor");
});
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/manifest/openPlains.ts rpg/tests/unit/scene-c.test.ts
git commit -m "feat(rpg): add the open-plains type-C scene manifest with the approved prompts"
```

---

### Task 6: Asset resolution via AssetCache (integration-tested)

**Files:**
- Create: `rpg/src/scene/assets.ts`
- Test: `rpg/tests/integration/scene-assets.test.ts`

**Interfaces:**
- Consumes: `AssetCache` (`getOrGenerate`), `SceneManifest` (Task 1).
- Produces:
  - `interface SceneTextures { backdrop: string; floor: string }` (data URLs).
  - `resolveSceneTextures(manifest: SceneManifest, assets: AssetCache): Promise<SceneTextures>` — for a type-C manifest, calls `getOrGenerate` once for the floor (`entity: manifest.id, pose: "floor"`) and once for the backdrop (`pose: "backdrop"`); throws on non-C manifests (the slice only supports type C; types A/B are future work).

- [ ] **Step 1: Write the failing integration test** — `rpg/tests/integration/scene-assets.test.ts`:

```ts
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveSceneTextures } from "../../src/scene/assets";
import { AssetCache } from "../../src/services/generation";
import type { ImageService } from "../../src/services/perchance-runtime";
import { openPlainsManifest } from "../../src/scene/manifest/openPlains";

describe("resolveSceneTextures (fake-indexeddb)", () => {
  beforeEach(async () => {
    await Dexie.delete("rpg_test_scene");
  });
  afterEach(async () => {
    await Dexie.delete("rpg_test_scene");
  });

  function cache(): AssetCache {
    const service: ImageService = {
      async generate(opts) {
        return { dataUrl: `data:image/png;base64,${opts.prompt.length}:${opts.seed}` };
      },
    };
    return new AssetCache("dev", service, { dbName: "rpg_test_scene" });
  }

  it("resolves floor + backdrop data URLs from the cache", async () => {
    const assets = cache();
    const textures = await resolveSceneTextures(openPlainsManifest, assets);

    expect(textures.backdrop).toMatch(/^data:image\//);
    expect(textures.floor).toMatch(/^data:image\//);
    expect(textures.backdrop).not.toBe(textures.floor);

    // Second call hits the cache (same seeds).
    const again = await resolveSceneTextures(openPlainsManifest, assets);
    expect(again.backdrop).toBe(textures.backdrop);

    await assets.close();
  });

  it("rejects non-type-C manifests", async () => {
    const assets = cache();
    await expect(
      resolveSceneTextures(
        { ...openPlainsManifest, type: "A" },
        assets,
      ),
    ).rejects.toThrow(/only type C/);
    await assets.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd rpg && pnpm test:integration -- --project integration scene-assets`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `rpg/src/scene/assets.ts`** (full file):

```ts
import type { AssetCache } from "../services/generation";
import type { SceneManifest } from "./types";

export interface SceneTextures {
  backdrop: string;
  floor: string;
}

/**
 * Resolves a type-C manifest's asset keys to pixels via the AssetCache.
 * Each plane is generated under its own pose so re-rolls stay independent.
 */
export async function resolveSceneTextures(
  manifest: SceneManifest,
  assets: AssetCache,
): Promise<SceneTextures> {
  if (manifest.type !== "C") {
    throw new Error("resolveSceneTextures: only type C is supported in this slice");
  }
  if (!manifest.floor?.assetKey || !manifest.backdrop.prompt || !manifest.floor.prompt) {
    throw new Error("resolveSceneTextures: type-C manifest needs floor + backdrop prompts");
  }

  const [backdrop, floor] = await Promise.all([
    assets.getOrGenerate({
      entity: manifest.id,
      pose: "backdrop",
      prompt: manifest.backdrop.prompt,
      seed: `${manifest.id}:backdrop:v1`,
    }),
    assets.getOrGenerate({
      entity: manifest.id,
      pose: "floor",
      prompt: manifest.floor.prompt,
      seed: `${manifest.id}:floor:v1`,
    }),
  ]);

  return { backdrop: backdrop.dataUrl, floor: floor.dataUrl };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd rpg && pnpm test:integration -- --project integration scene-assets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/assets.ts rpg/tests/integration/scene-assets.test.ts
git commit -m "feat(rpg): resolve type-C scene textures through the AssetCache"
```

---

### Task 7: ThreeStage — three.js implementation of the Stage interface (lazy)

**Files:**
- Modify: `rpg/src/render/stage.ts` (extend the interface)
- Create: `rpg/src/render/three-stage.ts`
- Modify: `rpg/tests/e2e/build.test.ts` (add lazy-chunk assertions)

**Interfaces:**
- Consumes: `SceneLayout` (Task 2), `SceneTextures` (Task 6).
- Produces:
  - Extended `Stage` interface:
    ```ts
    export interface Stage {
      readonly width: number;
      readonly height: number;
      mount(container: HTMLElement): void;
      setTextures(textures: SceneTextures): void;
      setActors(actors: ActorPlacement[]): void;
      setActiveSpeaker(characterId: string | null): void;
      resize(width: number, height: number): void;
      tick(dt: number): void;
      destroy(): void;
    }
    ```
  - `createThreeStage(layout: SceneLayout): Promise<Stage>` — `await import("three")` internally (lazy chunk); builds camera, ambient + directional lights, ground plane (rotated −π/2, `NearestFilter` texture), backdrop plane, actor sprite planes (canvas placeholders) with ground shadows; the render loop is driven by the app's `tick` (no internal rAF ownership — the app calls `tick` each frame).

> The stage itself is NOT unit-tested (requires WebGL); its correctness is validated in the browser via the CDP MCP (Task 9) and the lazy-chunk e2e assertion below.

- [ ] **Step 1: Extend the interface** in `rpg/src/render/stage.ts` (replace the file):

```ts
import type { ActorPlacement, SceneLayout } from "../scene/layout";
import type { SceneTextures } from "../scene/assets";

/**
 * Thin Stage abstraction (tech-spec §2.1). The rest of the app never
 * imports a renderer directly — PixiJS (2D overlays) and three.js
 * (type C scenes) both implement this interface.
 */
export interface Stage {
  readonly width: number;
  readonly height: number;
  mount(container: HTMLElement): void;
  setTextures(textures: SceneTextures): void;
  setActors(actors: ActorPlacement[]): void;
  setActiveSpeaker(characterId: string | null): void;
  resize(width: number, height: number): void;
  tick(dt: number): void;
  destroy(): void;
}
```

- [ ] **Step 2: Write the failing e2e build-gate assertion** — append to `rpg/tests/e2e/build.test.ts`:

```ts
it("keeps three.js out of the initial bundle (lazy chunk)", () => {
  const { readFileSync } = require("node:fs");
  const entry = readFileSync(resolve(buildDir, "rpg.js"), "utf8");

  // three.js must not be bundled into the entry — it loads via async chunk.
  expect(entry.includes("WebGLRenderer")).toBe(false);
});
```

> Note: replace the `require` with the top-level `readFileSync` import already present in the file.

- [ ] **Step 3: Run to verify the gate currently passes (three.js not yet imported)**

Run: `cd rpg && pnpm build && pnpm test:e2e`
Expected: PASS (three.js is not in the bundle yet — the gate is green *before* the implementation, which is fine: it guards against regressions once Task 7 lands).

- [ ] **Step 4: Implement `rpg/src/render/three-stage.ts`** (full file):

```ts
import type { ActorPlacement, SceneLayout, Vec3 } from "../scene/layout";
import type { SceneTextures } from "../scene/assets";
import type { Stage } from "./stage";

type ThreeModule = typeof import("three");
type Scene = InstanceType<ThreeModule["Scene"]>;

function actorCanvas(label: string, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 300;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgba(7, 19, 33, 0.3)";
  ctx.fillRect(15, 15, 150, 270);
  ctx.fillStyle = "#f4dfbd";
  ctx.fillRect(68, 42, 44, 44);
  ctx.fillStyle = color;
  ctx.fillRect(52, 92, 76, 104);
  ctx.fillStyle = "#1b2636";
  ctx.fillRect(56, 196, 27, 62);
  ctx.fillRect(97, 196, 27, 62);
  ctx.fillStyle = "#f3ce76";
  ctx.fillRect(50, 266, 34, 10);
  ctx.fillRect(96, 266, 34, 10);
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, 90, 22);
  return canvas;
}

/**
 * three.js implementation of the Stage for type-C scenes (tech-spec §2.1).
 * Loads three.js lazily via dynamic import — the initial bundle never pays
 * for the 3D renderer. The app drives the loop by calling tick(dt).
 */
export async function createThreeStage(
  layout: SceneLayout,
  container: HTMLElement,
): Promise<Stage> {
  const THREE = await import("three");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1c2e");

  const camera = new THREE.PerspectiveCamera(
    layout.camera.fov,
    1,
    0.1,
    100,
  );
  camera.position.set(
    layout.camera.position.x,
    layout.camera.position.y,
    layout.camera.position.z,
  );
  camera.lookAt(
    layout.camera.lookAt.x,
    layout.camera.lookAt.y,
    layout.camera.lookAt.z,
  );

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 1);
  const directional = new THREE.DirectionalLight(0xffe3a0, 0.35);
  directional.position.set(-4, 8, 4);
  scene.add(ambient, directional);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.ground.width, layout.ground.height),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.scale.setScalar(layout.ground.scale);
  ground.position.set(
    layout.ground.position.x,
    layout.ground.position.y,
    layout.ground.position.z,
  );
  scene.add(ground);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.backdrop.width, layout.backdrop.height),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  backdrop.scale.setScalar(layout.backdrop.scale);
  backdrop.position.set(
    layout.backdrop.position.x,
    layout.backdrop.position.y,
    layout.backdrop.position.z,
  );
  scene.add(backdrop);

  const actorMeshes = new Map<string, { sprite: THREE.Mesh; shadow: THREE.Mesh }>();
  const labels = new Map<string, string>();
  const colors = new Map<string, string>();

  const loader = new THREE.TextureLoader();
  const size = { width: 0, height: 0 };

  function applyTexture(
    mesh: THREE.Mesh,
    dataUrl: string,
    onError?: () => void,
  ) {
    loader.load(dataUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.LinearMipMapLinearFilter;
      (mesh.material as THREE.MeshBasicMaterial).map = texture;
      (mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }, undefined, onError);
  }

  return {
    get width() {
      return size.width;
    },
    get height() {
      return size.height;
    },
    mount: () => {},
    setTextures(textures: SceneTextures) {
      applyTexture(backdrop, textures.backdrop);
      applyTexture(ground, textures.floor);
    },
    setActors(actors: ActorPlacement[]) {
      for (const actor of actorMeshes.values()) {
        scene.remove(actor.sprite, actor.shadow);
      }
      actorMeshes.clear();

      for (const actor of actors) {
        const label = actor.characterId.split("/").pop() ?? actor.characterId;
        const color = "#8dd8d0";
        const canvas = actorCanvas(label, color);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        const sprite = new THREE.Mesh(
          new THREE.PlaneGeometry(1.25 * actor.scale, 2.1 * actor.scale),
          new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
        );
        sprite.position.set(actor.position.x, actor.position.y, actor.position.z);

        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.48 * actor.scale, 24),
          new THREE.MeshBasicMaterial({ color: 0x071321, transparent: true, opacity: 0.35 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(actor.position.x, 0.025, actor.position.z);

        scene.add(sprite, shadow);
        actorMeshes.set(actor.characterId, { sprite, shadow });
        labels.set(actor.characterId, label);
        colors.set(actor.characterId, color);
      }
    },
    setActiveSpeaker(characterId: string | null) {
      for (const [id, { sprite }] of actorMeshes) {
        const active = id === characterId;
        (sprite.material as THREE.MeshBasicMaterial).opacity = active ? 1 : 0.55;
        (sprite.material as THREE.MeshBasicMaterial).transparent = true;
      }
    },
    resize(width: number, height: number) {
      size.width = width;
      size.height = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    tick() {
      // Actors face the camera (billboard) each frame.
      for (const { sprite } of actorMeshes.values()) {
        sprite.lookAt(camera.position.x, sprite.position.y, camera.position.z);
      }
      renderer.render(scene, camera);
    },
    destroy() {
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
```

> Note: unused locals (`labels`, `colors`, `Scene` type, `applyTexture.onError`) must be removed or used — Biome will flag them. Clean them up in Step 5.

- [ ] **Step 5: Lint + typecheck + fix**

Run: `cd rpg && pnpm typecheck && pnpm lint`
Fix any Biome unused-variable/format errors (`pnpm lint:fix`), then re-run until clean.

- [ ] **Step 6: Build + run the e2e lazy-gate**

Run: `cd rpg && pnpm build && pnpm test:e2e`
Expected: PASS — and the lazy-gate assertion passes only if three.js is a separate async chunk (it is, via `await import("three")`); confirm `build/chunks/` contains a three.js chunk.

- [ ] **Step 7: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/render/ rpg/tests/e2e/build.test.ts
git commit -m "feat(rpg): add the lazy three.js Stage implementation (type C)"
```

---

### Task 8: Scene loader (orchestration) + boot wiring

**Files:**
- Modify: `rpg/src/scene/loader.ts` (add `loadScene`)
- Modify: `rpg/src/services/boot.ts` (expose the scene loader deps)
- Modify: `rpg/src/main.tsx` (boot → load scene → render App with stage)

**Interfaces:**
- Consumes: `parseSceneManifest` (existing), `computeSceneLayout` (Task 2), `resolveSceneTextures` (Task 6), `createThreeStage` (Task 7), `AssetCache` (existing).
- Produces: `loadScene(manifestInput: unknown, deps: { assets: AssetCache; container: HTMLElement; viewport: { width: number; height: number } }): Promise<Stage>` — validates, lays out, resolves textures, creates the ThreeStage, mounts, resizes to the viewport, sets actors from the manifest.

- [ ] **Step 1: Add `loadScene` to `rpg/src/scene/loader.ts`** (append):

```ts
import { computeSceneLayout } from "./layout";
import { resolveSceneTextures } from "./assets";
import { createThreeStage } from "../render/three-stage";
import type { Stage } from "../render/stage";

export interface SceneLoadDeps {
  assets: AssetCache;
  container: HTMLElement;
  viewport: { width: number; height: number };
}

export async function loadScene(
  manifestInput: unknown,
  deps: SceneLoadDeps,
): Promise<Stage> {
  const manifest = parseSceneManifest(manifestInput);
  const layout = computeSceneLayout(manifest);
  const textures = await resolveSceneTextures(manifest, deps.assets);
  const stage = await createThreeStage(layout, deps.container);
  stage.resize(deps.viewport.width, deps.viewport.height);
  stage.setTextures(textures);
  stage.setActors(layout.actors);
  return stage;
}
```

> Add the missing top-level imports (`AssetCache` from `../services/generation`) and keep existing exports intact.

- [ ] **Step 2: Update `rpg/src/services/boot.ts`** — expose the viewport + a `loadScene` convenience bound to the booted cache:

```ts
export interface BootServices {
  mode: RuntimeMode;
  mocked: boolean;
  runtime: PerchanceRuntime;
  assets: AssetCache;
  /** Loads a scene into the given container (type C slice). */
  loadScene: (
    manifest: unknown,
    container: HTMLElement,
    viewport: { width: number; height: number },
  ) => Promise<Stage>;
}
```

```ts
// in bootServices():
const loadScene = (
  manifest: unknown,
  container: HTMLElement,
  viewport: { width: number; height: number },
) => loadSceneImpl(manifest, { assets, container, viewport });

return { mode, mocked, runtime, assets, loadScene };
```

> Name collision: import the loader's function under an alias (`loadScene as loadSceneImpl`) in `boot.ts`.

- [ ] **Step 3: Update `rpg/src/main.tsx`** — load the open-plains scene after boot and hand the stage + services to the App:

```tsx
import { render } from "preact";

import { bootServices } from "./services/boot";
import { openPlainsManifest } from "./scene/manifest/openPlains";
import { App } from "./ui/App";
import "./style.css";

const mount = document.getElementById("app");
if (!mount) throw new Error("Missing #app mount point");

const services = bootServices();
const stageContainer = document.createElement("div");
stageContainer.id = "stage-container";
mount.appendChild(stageContainer);

const stage = await services.loadScene(openPlainsManifest, stageContainer, {
  width: window.innerWidth,
  height: window.innerHeight,
});

function frame(prev: number) {
  const now = performance.now();
  stage.tick((now - prev) / 1000);
  requestAnimationFrame(() => frame(now));
}
requestAnimationFrame(() => frame(performance.now()));

render(<App services={services} stage={stage} />, mount);
```

> Note: top-level await is fine in Vite ESM. The App receives `stage` as a prop and drives the dialogue overlay.

- [ ] **Step 4: Typecheck + lint + fix**

Run: `cd rpg && pnpm typecheck && pnpm lint:fix && pnpm lint`
Expected: clean.

- [ ] **Step 5: Build + full local test suite**

Run: `cd rpg && pnpm build && pnpm test && pnpm test:e2e`
Expected: all green (existing 44+ tests + the new ones from Tasks 1–6).

- [ ] **Step 6: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/scene/loader.ts rpg/src/services/boot.ts rpg/src/main.tsx
git commit -m "feat(rpg): wire loadScene into boot and render the open-plains stage"
```

---

### Task 9: Dialogue UI (Preact overlay) + always-escape

**Files:**
- Create: `rpg/src/ui/DialogueBox.tsx`
- Modify: `rpg/src/ui/App.tsx` (stage container + overlay layout, status line)
- Modify: `rpg/src/style.css` (overlay + dialogue box styles, letterbox-aware)

**Interfaces:**
- Consumes: `dialogueMachine`, `dialogueVisible`, `selectOption`, `closeDialogue`, `advanceDialogue` from `rpg/src/game/state/dialogue.ts` (Task 4).
- Produces: `<DialogueBox />` — a Preact component rendering the current turn: speaker label, text, choice buttons (from `options`), an "Advance" affordance when `speaking`, and a fixed **"Leave" button (always-escape)** in/near the box that calls `closeDialogue`. Renders nothing when `!dialogueVisible`.

- [ ] **Step 1: Create `rpg/src/ui/DialogueBox.tsx`**:

```tsx
import {
  dialogueMachine,
  dialogueVisible,
  selectOption,
  closeDialogue,
  advanceDialogue,
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
```

> Note: Preact signals auto-subscribe when read in render — no manual subscription needed.

- [ ] **Step 2: Update `rpg/src/ui/App.tsx`** — render the stage container + overlay + a demo "Talk" button (wired to the mock text service so the flow is observable locally):

```tsx
import { useCallback, useEffect } from "preact/hooks";

import { showTurn } from "../game/state/dialogue";
import type { BootServices } from "../services/boot";
import { parseChoices } from "../game/dialogue/parse-choices";
import { DialogueBox } from "./DialogueBox";
import type { Stage } from "../render/stage";

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
      <div id="stage-container" className="stage" aria-label="Scene" />
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
```

> Note: `main.tsx` (Task 8 Step 3) creates `#stage-container`, loads the scene into it, and renders the App — the container is already in the DOM when `App` mounts, so the App just renders the overlay/hud around it. Keep the tick loop in `main.tsx`.

- [ ] **Step 3: Add styles to `rpg/src/style.css`** (overlay + box; stage fills the viewport; box anchored bottom-center; letterbox-aware via the same logical width):

```css
.app { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
.stage { position: absolute; inset: 0; }
.stage canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.hud { position: absolute; top: 0.75rem; left: 0.75rem; display: flex; gap: 0.75rem; align-items: center; }
.dialogue-box {
  position: absolute; left: 50%; bottom: 1rem; transform: translateX(-50%);
  width: min(720px, 90vw); background: rgba(10, 14, 22, 0.92); color: #e8e8e8;
  border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 8px; padding: 0.75rem 1rem;
  display: flex; flex-direction: column; gap: 0.5rem;
}
.speaker { margin: 0; font-weight: 700; color: #f3ce76; }
.dialogue-text { margin: 0; line-height: 1.5; }
.choices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.choices button, .advance, .leave { text-align: left; padding: 0.4rem 0.6rem; border-radius: 4px; }
.leave { align-self: flex-end; margin-top: 0.25rem; }
```

- [ ] **Step 4: Typecheck + lint + fix**

Run: `cd rpg && pnpm typecheck && pnpm lint:fix && pnpm lint`
Expected: clean.

- [ ] **Step 5: Build + tests**

Run: `cd rpg && pnpm build && pnpm test:all`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/src/ui/ rpg/src/style.css rpg/src/main.tsx
git commit -m "feat(rpg): add the dialogue box overlay with choices and always-escape"
```

---

### Task 10: Browser validation (CDP MCP) + final green

**Files:**
- None (validation only) — run the dev server, drive the UI via the Chrome DevTools MCP, fix anything that breaks, then final commit.

- [ ] **Step 1: Serve the app**

Run (in `rpg/`): `pnpm dev` (Vite on 5173).

- [ ] **Step 2: Verify the scene renders**

Via CDP MCP: navigate to `http://127.0.0.1:5173/`, take a snapshot + screenshot.
Expected: a `<canvas>` inside `#stage-container`, the two placeholder actor sprites visible on the floor plane, the backdrop + ground textures applied (mock placeholders), no console errors.

- [ ] **Step 3: Exercise the dialogue flow**

Via CDP MCP: click **"Talk to the elder"** → expect the dialogue box with speaker "Elder", the mock text, and 3 choice buttons (the mock script's choice payload). Click a choice → the box closes (machine ends). Click **"Talk"** again → then click **"Leave"** → the box closes (always-escape verified).

- [ ] **Step 4: Verify the production build + lazy chunk**

Run: `cd rpg && pnpm build`
Check `build/rpg.js` does **not** contain `WebGLRenderer`, and `build/chunks/` contains a three.js chunk (lazy). Run `pnpm test:e2e` → green.

- [ ] **Step 5: Final validation + commit**

Run: `cd rpg && pnpm typecheck && pnpm lint && pnpm test:all && pnpm build && pnpm test:e2e`
Expected: all green. Commit any final fixes:

```bash
cd /home/rafaeltavares237/projects/rpg && git add rpg/ && git commit -m "feat(rpg): complete the type-C open-variant scene slice (MVP)"
```

---

## Self-Review

**1. Spec coverage:**
- tech-spec §12.4 (three.js floor + backdrop per POC, placeholder sprites, dialogue UI, always-escape): Tasks 2, 5, 7, 8, 9 ✅
- tech-spec §2.1 (lazy three.js, thin Stage interface): Tasks 7, 8 ✅
- tech-spec §5.3 (assets by key, prompt params in manifest): Tasks 1, 5, 6 ✅
- tech-spec §5.1 (1280×720 contain, dpr cap 2, NearestFilter): Task 2 defaults + Task 7 renderer ✅ (logical resolution is the container size for the slice; strict letterbox integration with `viewport.ts` is flagged as follow-up — see Notes)
- narrative-spec §3.1 ([choices] format + robust parser): Task 3 ✅
- narrative-spec §3 / tech-spec §7.1 (always-escape, machine states): Task 4 ✅
- vn-rpg-spec §3.8 (type C approved, open variant): Tasks 1, 5 ✅
- pending-decisions §5 (no retry/timeout): Global Constraints + no timeout logic introduced ✅

**2. Placeholder scan:** all code blocks are complete; the only intentional "copy verbatim" references are the two image prompts (Task 5) with exact source file `open-scene-image-prompts.txt` and explicit instruction. No "TBD"/"TODO"/"add validation" placeholders.

**3. Type consistency:**
- `ActorPlacement`/`Vec3`/`PlanePlacement`/`SceneLayout` defined once (Task 2), consumed by Tasks 7, 8 ✅
- `Stage` interface extended once (Task 7), implemented by `ThreeStage`, consumed by `loadScene`/`App` ✅
- `SceneTextures` defined once (Task 6), consumed by Task 7/8 ✅
- Machine names: `beginDialogue`/`chooseOption`/`escapeDialogue`/`advanceDialogue` consistent between Task 4 steps and store ✅
- `openPlainsManifest` imported by Task 6 test + Task 8 boot ✅

**Open follow-ups (out of slice scope, noted for later):**
- Strict letterbox of the stage to a fixed 1280×720 logical box using `viewport.ts` (the slice uses the container size directly); a11y pass (Lighthouse) on the dialogue box; PixiJS 2D overlay stack (particles/fog/lighting); closed-variant type C; WebMCP dev tools exposing scene/dialogue state.
