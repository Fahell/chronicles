# Gameplay Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP slice: save slots + identity wizard + narrative payload system (narrator + multi-turn NPC dialogue) + i18n skeleton + a11y core + fog effect + sprite re-roll, on top of the working type-C scene and removal pipeline.

**Architecture:** The app keeps the boot → loading → removal-chip shell, but main.tsx renders a screen router (title → wizard/load/settings/credits/help → game) instead of loading the scene immediately. The scene is loaded only after a save exists (identity + picked NPC), then a narrator opening generation runs, then multi-turn dialogue. Pure logic (identity, content, payload builder, save store, i18n) lives outside components for unit tests; Dexie v3 adds the `save` table; PixiJS provides the first declarative effect (fog) via a `StageEffect` interface; re-roll reuses the cutout pipeline with a new seed.

**Tech Stack:** TypeScript strict, Preact + signals, Dexie (v3 migration), i18next + i18next-browser-languagedetector, PixiJS v8 (fog overlay), three.js (existing stage), Vitest (node env, fake-indexeddb for integration), Biome.

## Global Constraints

- English in all artifacts (code, comments, docs, commit messages); pt-BR only in chat.
- No app-level retry/timeout on plugin content (pending-decisions §5); only loading state.
- Only `perchance-runtime.ts` touches `root.*`; everything else uses typed services.
- Dev vs prod mode drives removeBackground, Dexie DB name (`rpg_dev`/`rpg`), mock — never hardcode a mode value in a service.
- Identity is **locked to the save**: name changeable only before creation; appearance/background never after (narrative §7).
- Save slots: **3 manual + autosave** (owner decision, this phase). Autosave trigger (end of day) is a stub — day-cycle is a later phase.
- Background payload version ≤ ~300 chars, English, no narrative preamble; UI version full text (narrative §5.4).
- AI language: the detected/selected player language (owner decision); payload instruction says "Respond in {language}".
- i18n: 5 supported languages (`en, zh, hi, es, ar`), **English authored now**, others fall back (owner decision).
- Zero gameplay (stats/inventory) in this slice (gameplay-spec §9).
- NPC sprite re-roll only (owner decision); user sprite is part of identity, never re-rolled.
- No `src/` folder locally; app lives under `rpg/`. Relative imports only.
- Commit the regenerated `rpg/build/` when the bundle changes. No push (round time only).

---

## File Structure

**Create:**
- `rpg/src/game/identity.ts` — Identity model + helpers (payload truncation, appearance summary)
- `rpg/src/content/archetypes.ts` — 4 visual archetypes (sprite prompts + appearance summaries)
- `rpg/src/content/backgrounds.ts` — 3 user background templates (payload + UI versions)
- `rpg/src/content/npcPool.ts` — 9 NPCs (3 types × 3 backgrounds) + `pickNpc`
- `rpg/src/game/save/types.ts` — SaveGame / SaveRow / slot constants
- `rpg/src/game/save/store.ts` — SaveStore (Dexie-backed CRUD + slot policy)
- `rpg/src/game/payload/builder.ts` — narrator/NPC instruction builders + budget guard
- `rpg/src/game/session.ts` — session signal, dynamic scene-manifest builder, conversation state
- `rpg/src/services/i18n.ts` — i18next init (detection, fallback), `t`, `currentLanguage`
- `rpg/src/game/state/screens.ts` — screen router signals
- `rpg/src/ui/screens/TitleScreen.tsx`, `NewGameWizard.tsx`, `LoadScreen.tsx`, `SettingsScreen.tsx`, `CreditsScreen.tsx`, `HelpScreen.tsx`, `UnsupportedScreen.tsx`, `GameScreen.tsx`
- `rpg/src/effects/types.ts` — StageEffect interface
- `rpg/src/effects/fog.ts` — PixiJS fog overlay
- `rpg/src/effects/index.ts` — effect factory registry
- Tests: `tests/unit/identity.test.ts`, `tests/unit/content.test.ts`, `tests/unit/payload-builder.test.ts`, `tests/unit/i18n.test.ts`, `tests/integration/save-store.test.ts`, `tests/integration/session.test.ts`, `tests/unit/fog-registry.test.ts`

**Modify:**
- `rpg/src/services/db.ts` — v3 migration: `save` table
- `rpg/src/scene/manifest/openPlains.ts` — export base scene (no static actors), add fog effect entry
- `rpg/src/render/stage.ts` — add `effects: StageEffect[]` + `updateActor(characterId, textures)`
- `rpg/src/render/three-stage.ts` — implement `updateActor` + effect ticking
- `rpg/src/scene/loader.ts` — create effects from manifest, push into stage
- `rpg/src/scene/assets.ts` — extract `resolveCharacterSprite`; add `reRollActorSprite` + `generateIdentitySprite`
- `rpg/src/ui/App.tsx` — session-driven dialogue loop (multi-turn), re-roll button, t() strings
- `rpg/src/ui/DialogueBox.tsx` — t() strings
- `rpg/src/main.tsx` — WebGL2 gate + screen router
- `rpg/src/style.css` — title/wizard/load/settings styles (port POC), global focus ring
- `rpg/src/services/mock/script.ts` — narrator + multi-turn script entries
- `README.md`, `AGENTS.md`, `test-prompt.txt` — docs round

---

## Task 1: Save v1 — Dexie v3 + SaveStore

**Files:**
- Create: `rpg/src/game/save/types.ts`, `rpg/src/game/save/store.ts`
- Modify: `rpg/src/services/db.ts`
- Test: `rpg/tests/integration/save-store.test.ts`

**Interfaces:**
- Consumes: `RpgDatabase` (existing), `Identity` from Task 2 (`rpg/src/game/identity.ts`)
- Produces:
  - `export const MANUAL_SLOTS = 3`, `export const AUTOSAVE_SLOT = "autosave"`, `export type SlotId = string`
  - `export interface SaveGame { slotId: SlotId; identity: Identity; scene: { sceneId: string; npcId: string; day: number; period: string }; progress: { talkedTo: string[] }; flags: Record<string, unknown>; updatedAt: number }`
  - `export interface SaveRow extends SaveGame { createdAt: number }`
  - `export class SaveStore { constructor(db: RpgDatabase); list(): Promise<SaveGame[]>; get(slotId: SlotId): Promise<SaveGame | undefined>; put(save: SaveGame): Promise<void>; remove(slotId: SlotId): Promise<void>; manualSlots(): SlotId[]; hasFreeManualSlot(): Promise<boolean>; nextFreeSlot(): Promise<SlotId | null>; saveAutosave(save: SaveGame): Promise<void> }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/save-store.test.ts
import { describe, expect, it } from "vitest";
import { RpgDatabase } from "../../src/services/db";
import { buildIdentity } from "../../src/game/identity";
import { MANUAL_SLOTS, SaveStore, AUTOSAVE_SLOT } from "../../src/game/save/store";

async function makeStore() {
  const db = new RpgDatabase("dev", "test_saves");
  return { db, store: new SaveStore(db) };
}

function identity(name: string) {
  return buildIdentity({ name, archetypeId: "traveler", appearanceSeed: "s1", background: { kind: "template", templateId: "bt1" } });
}

describe("SaveStore", () => {
  it("lists saves newest-first and supports get/put/remove", async () => {
    const { db, store } = await makeStore();
    await store.put({ slotId: "slot-1", identity: identity("A"), scene: { sceneId: "scene.open.plains", npcId: "npc/knight-1", day: 1, period: "dusk" }, progress: { talkedTo: [] }, flags: {}, updatedAt: 1 });
    await store.put({ slotId: "slot-2", identity: identity("B"), scene: { sceneId: "scene.open.plains", npcId: "npc/mage-1", day: 1, period: "dusk" }, progress: { talkedTo: [] }, flags: {}, updatedAt: 2 });
    const saves = await store.list();
    expect(saves.map((s) => s.slotId)).toEqual(["slot-2", "slot-1"]);
    expect((await store.get("slot-1"))?.identity.name).toBe("A");
    await store.remove("slot-1");
    expect(await store.get("slot-1")).toBeUndefined();
    db.close();
  });

  it("reports free manual slots and writes the autosave slot separately", async () => {
    const { db, store } = await makeStore();
    expect(await store.hasFreeManualSlot()).toBe(true);
    expect(await store.nextFreeSlot()).toBe("slot-1");
    for (let i = 0; i < MANUAL_SLOTS; i++) {
      await store.put({ slotId: `slot-${i + 1}`, identity: identity(`N${i}`), scene: { sceneId: "s", npcId: "n", day: 1, period: "dusk" }, progress: { talkedTo: [] }, flags: {}, updatedAt: i });
    }
    expect(await store.hasFreeManualSlot()).toBe(false);
    expect(await store.nextFreeSlot()).toBeNull();
    await store.saveAutosave({ slotId: AUTOSAVE_SLOT, identity: identity("Auto"), scene: { sceneId: "s", npcId: "n", day: 1, period: "dusk" }, progress: { talkedTo: [] }, flags: {}, updatedAt: 99 });
    expect((await store.get(AUTOSAVE_SLOT))?.identity.name).toBe("Auto");
    db.close();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run --project integration tests/integration/save-store.test.ts` → FAIL (module missing)

- [ ] **Step 3: Implement types + store + migration**

`rpg/src/game/save/types.ts`:
```ts
export const MANUAL_SLOTS = 3;
export const AUTOSAVE_SLOT = "autosave";
export type SlotId = string;
export interface SaveScene { sceneId: string; npcId: string; day: number; period: string }
export interface SaveGame { slotId: SlotId; identity: Identity; scene: SaveScene; progress: { talkedTo: string[] }; flags: Record<string, unknown>; updatedAt: number }
export interface SaveRow extends SaveGame { createdAt: number }
```
(`Identity` imported from `../identity`.)

`rpg/src/services/db.ts` — add table + v3:
```ts
import type { SaveRow } from "../game/save/types";
export class RpgDatabase extends Dexie {
  assets!: Table<AssetRow, string>;
  cutouts!: Table<CutoutRow, string>;
  save!: Table<SaveRow, string>;
  constructor(mode: RuntimeMode, dbName?: string) {
    super(dbName ?? (mode === "dev" ? "rpg_dev" : "rpg"));
    this.version(2).stores({ assets: "key, mode, createdAt", cutouts: "key, mode, createdAt" });
    this.version(3).stores({ save: "slotId, updatedAt" });
  }
}
```

`rpg/src/game/save/store.ts`:
```ts
export class SaveStore {
  constructor(private readonly db: RpgDatabase) {}
  async list(): Promise<SaveGame[]> {
    const rows = await this.db.save.where("slotId").startsWithIgnoreCase("slot-").sortBy("updatedAt");
    return rows.reverse().map((r) => toSave(r));
  }
  async get(slotId: SlotId): Promise<SaveGame | undefined> {
    const row = await this.db.save.get(slotId);
    return row ? toSave(row) : undefined;
  }
  async put(save: SaveGame): Promise<void> {
    await this.db.save.put({ ...save, createdAt: Date.now() });
  }
  async remove(slotId: SlotId): Promise<void> { await this.db.save.delete(slotId); }
  manualSlots(): SlotId[] { return Array.from({ length: MANUAL_SLOTS }, (_, i) => `slot-${i + 1}`); }
  async hasFreeManualSlot(): Promise<boolean> { return (await this.nextFreeSlot()) !== null; }
  async nextFreeSlot(): Promise<SlotId | null> {
    const existing = new Set((await this.db.save.toArray()).map((r) => r.slotId));
    for (const slot of this.manualSlots()) if (!existing.has(slot)) return slot;
    return null;
  }
  async saveAutosave(save: SaveGame): Promise<void> { await this.put({ ...save, slotId: AUTOSAVE_SLOT }); }
}
```
(`toSave` strips `createdAt`.)

- [ ] **Step 4: Run to verify pass** — same command → PASS

- [ ] **Step 5: Typecheck + lint** — `pnpm typecheck && pnpm lint`

- [ ] **Step 6: Commit** — `feat(rpg): add save v1 (Dexie v3 slots + SaveStore)`

## Task 2: Identity + seed content

**Files:**
- Create: `rpg/src/game/identity.ts`, `rpg/src/content/archetypes.ts`, `rpg/src/content/backgrounds.ts`, `rpg/src/content/npcPool.ts`
- Test: `rpg/tests/unit/identity.test.ts`, `rpg/tests/unit/content.test.ts`

**Interfaces:**
- Produces:
  - `export interface Identity { name: string; archetypeId: string; appearanceSeed: string; background: { kind: "template"; templateId: string } | { kind: "custom"; text: string }; backgroundPayload: string; backgroundUi: string; spriteCutout: string | null }`
  - `export function buildIdentity(input: { name: string; archetypeId: string; appearanceSeed?: string; background: Identity["background"] }): Identity`
  - `export function summarizeAppearance(identity: Identity): string`
  - `export interface Archetype { id: string; label: string; appearanceSummary: string; spritePrompt: string }`
  - `export const ARCHETYPES: Archetype[]`, `export function archetypeById(id: string): Archetype | undefined`
  - `export interface BackgroundTemplate { id: string; label: string; payload: string; ui: string }`
  - `export const USER_BACKGROUND_TEMPLATES: BackgroundTemplate[]`, `export function backgroundTemplateById(id: string): BackgroundTemplate | undefined`
  - `export interface NpcDefinition { id: string; name: string; type: string; backgroundPayload: string; backgroundUi: string; spritePrompt: string }`
  - `export const NPC_POOL: NpcDefinition[]` (9), `export function pickNpc(rng?: () => number): NpcDefinition`
  - `export const PAYLOAD_BACKGROUND_LIMIT = 300`
  - `export function compactPayload(text: string, limit?: number): string`

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/identity.test.ts
import { describe, expect, it } from "vitest";
import { buildIdentity, compactPayload } from "../../src/game/identity";

describe("identity", () => {
  it("builds an identity with a compact payload version of a custom background", () => {
    const id = buildIdentity({ name: "Arin", archetypeId: "traveler", background: { kind: "custom", text: "A long backstory with lots of fluff that goes on and on about the village and the river and the war. " .repeat(40) } });
    expect(id.name).toBe("Arin");
    expect(id.appearanceSeed).toBeTruthy();
    expect(id.backgroundPayload.length).toBeLessThanOrEqual(300);
    expect(id.backgroundUi).toContain("village");
  });
  it("uses the template payload/UI versions when a template is selected", () => {
    const id = buildIdentity({ name: "Lia", archetypeId: "mage", background: { kind: "template", templateId: "bt1" } });
    expect(id.backgroundPayload).toBeTruthy();
    expect(id.backgroundUi).toBeTruthy();
    expect(id.background.kind).toBe("template");
  });
});
```

```ts
// tests/unit/content.test.ts
import { describe, expect, it } from "vitest";
import { ARCHETYPES, archetypeById } from "../../src/content/archetypes";
import { USER_BACKGROUND_TEMPLATES, backgroundTemplateById } from "../../src/content/backgrounds";
import { NPC_POOL, pickNpc } from "../../src/content/npcPool";
import { PAYLOAD_BACKGROUND_LIMIT } from "../../src/game/identity";

describe("seed content", () => {
  it("has 4 archetypes with unique ids and prompt text", () => {
    expect(ARCHETYPES.length).toBe(4);
    expect(new Set(ARCHETYPES.map((a) => a.id)).size).toBe(4);
    for (const a of ARCHETYPES) expect(a.spritePrompt.length).toBeGreaterThan(50);
    expect(archetypeById("traveler")).toBeDefined();
  });
  it("has 3 user background templates within the payload limit", () => {
    expect(USER_BACKGROUND_TEMPLATES.length).toBe(3);
    for (const b of USER_BACKGROUND_TEMPLATES) {
      expect(b.payload.length).toBeLessThanOrEqual(PAYLOAD_BACKGROUND_LIMIT);
      expect(backgroundTemplateById(b.id)).toBeDefined();
    }
  });
  it("has 9 NPCs (3 types × 3 backgrounds), ids unique, payloads bounded", () => {
    expect(NPC_POOL.length).toBe(9);
    expect(new Set(NPC_POOL.map((n) => n.id)).size).toBe(9);
    for (const n of NPC_POOL) {
      expect(n.backgroundPayload.length).toBeLessThanOrEqual(PAYLOAD_BACKGROUND_LIMIT);
      expect(n.spritePrompt.length).toBeGreaterThan(50);
      expect(n.name).toBeTruthy();
    }
  });
  it("pickNpc is seeded and returns a pool member", () => {
    const rng = () => 0;
    const a = pickNpc(rng);
    const b = pickNpc(rng);
    expect(a.id).toBe(b.id);
    expect(NPC_POOL.some((n) => n.id === a.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run --project unit tests/unit/identity.test.ts tests/unit/content.test.ts`

- [ ] **Step 3: Implement** — identity helpers; archetypes (knight, mage, rogue, traveler — each with `appearanceSummary` e.g. "a knight in silver plate with a weathered tabard" and a pixel-art `spritePrompt` in the open-plains style ending with the pure-black background sentence); 3 user background templates; NPC pool: types `wandering knight`, `forest mage`, `street rogue` × backgrounds `lost memory of a past battle`, `searching for a missing sibling`, `sworn to protect a hidden village`, authored names (e.g. knight/lost-memory: "Serran the Hollow Knight"). `pickNpc` = `NPC_POOL[Math.floor((rng ?? Math.random)() * NPC_POOL.length)]`.

- [ ] **Step 4: Run to verify pass** — same command → PASS

- [ ] **Step 5: Typecheck + lint + commit** — `feat(rpg): add identity model and seed content (archetypes, backgrounds, NPC pool)`

## Task 3: Payload builder

**Files:**
- Create: `rpg/src/game/payload/builder.ts`
- Test: `rpg/tests/unit/payload-builder.test.ts`

**Interfaces:**
- Consumes: `Identity` (Task 2), `NpcDefinition` (Task 2), `SceneManifest` (existing)
- Produces:
  - `export const PAYLOAD_BUDGET = 24_000`
  - `export interface ConversationTurn { speaker: string; text: string }`
  - `export interface NarratorContext { scene: SceneManifest; user: Identity; npc: NpcDefinition; language: string }`
  - `export interface NpcContext { scene: SceneManifest; npc: NpcDefinition; user: Identity; conversation: ConversationTurn[]; language: string }`
  - `export function languageDirective(language: string): string` — `"Respond in {language}. "` (English name from a small map, fallback the code itself)
  - `export function buildNarratorInstruction(ctx: NarratorContext): string`
  - `export function buildNpcInstruction(ctx: NpcContext): string`
  - `export function trimConversation(turns: ConversationTurn[], budget = PAYLOAD_BUDGET): ConversationTurn[]`

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/payload-builder.test.ts
import { describe, expect, it } from "vitest";
import { buildNarratorInstruction, buildNpcInstruction, languageDirective, trimConversation, PAYLOAD_BUDGET } from "../../src/game/payload/builder";
import { buildIdentity } from "../../src/game/identity";
import { NPC_POOL } from "../../src/content/npcPool";
import { openPlainsManifest } from "../../src/scene/manifest/openPlains";

const user = buildIdentity({ name: "Arin", archetypeId: "traveler", background: { kind: "template", templateId: "bt1" } });
const npc = NPC_POOL[0]!;

describe("payload builder", () => {
  it("language directive is present and language-aware", () => {
    expect(languageDirective("Spanish")).toContain("Spanish");
  });
  it("narrator instruction describes the scene and who is present, without the user's background", () => {
    const text = buildNarratorInstruction({ scene: openPlainsManifest, user, npc, language: "English" });
    expect(text).toContain(openPlainsManifest.backdrop.description);
    expect(text).toContain(npc.name);
    expect(text).toContain(user.name);
    expect(text).not.toContain(user.backgroundPayload);
  });
  it("npc instruction carries the npc background, user appearance (not background), and the conversation", () => {
    const conversation = [{ speaker: "player", text: "Hello." }, { speaker: npc.name, text: "Greetings." }];
    const text = buildNpcInstruction({ scene: openPlainsManifest, npc, user, conversation, language: "English" });
    expect(text).toContain(npc.backgroundPayload);
    expect(text).toContain(user.name);
    expect(text).not.toContain(user.backgroundPayload);
    expect(text).toContain("Hello.");
    expect(text).toContain("[choices]"); // dialogue format rules reused
  });
  it("trimConversation drops oldest turns to fit the budget", () => {
    const long = Array.from({ length: 200 }, (_, i) => ({ speaker: "s", text: "word ".repeat(60) + i }));
    const trimmed = trimConversation(long);
    const total = trimmed.reduce((n, t) => n + t.text.length + t.speaker.length, 0);
    expect(total).toBeLessThanOrEqual(PAYLOAD_BUDGET);
    expect(trimmed.length).toBeLessThan(long.length);
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement** — `buildNpcInstruction` composes: role framing (who the NPC is + backgroundPayload), user summary (name + `summarizeAppearance`, explicitly "a stranger — do not assume shared history"), scene context (backdrop description + prompts), conversation (recent turns via `trimConversation`, formatted `Name: text`), `languageDirective`, then the existing `dialogueInstruction`-style `[choices]` rules (import from `../dialogue/prompts` and append to the composed base instruction). `buildNarratorInstruction` similar with third-person world-narrator framing, no `[choices]` rules. `trimConversation` drops oldest turns while over budget, then (only if still over) hard-truncates the tail and appends `…`.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Typecheck + lint + commit** — `feat(rpg): add per-voice payload builder with budget guard`

## Task 4: i18n structure

**Files:**
- Create: `rpg/src/services/i18n.ts`
- Test: `rpg/tests/unit/i18n.test.ts`

**Interfaces:**
- Produces:
  - `export const SUPPORTED_LANGUAGES = ["en", "zh", "hi", "es", "ar"] as const`
  - `export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]`
  - `export const LANGUAGE_NAMES: Record<SupportedLanguage, string>` — `{ en: "English", zh: "Chinese", hi: "Hindi", es: "Spanish", ar: "Arabic" }`
  - `export async function initI18n(options?: { lng?: string; detection?: boolean }): Promise<void>`
  - `export function t(key: string, opts?: Record<string, unknown>): string`
  - `export function currentLanguage(): SupportedLanguage` — normalized (falls back to `en`)
  - `export function setLanguage(code: string): Promise<void>`
  - `export function englishName(code: string): string` — maps a detected code to the English name for the AI directive

- [ ] **Step 1: Failing test**

```ts
// tests/unit/i18n.test.ts
import { describe, expect, it } from "vitest";
import { initI18n, t, currentLanguage, englishName, SUPPORTED_LANGUAGES } from "../../src/services/i18n";

describe("i18n", () => {
  it("initializes with English-only resources and falls back for missing keys", async () => {
    await initI18n({ lng: "en", detection: false });
    expect(t("hud.talkTo", { name: "X" })).toBe("Talk to X");
    expect(t("hud.leave")).toBe("Leave");
    expect(t("missing.key")).toBe("missing.key");
  });
  it("detection is off in tests and currentLanguage normalizes to supported", async () => {
    await initI18n({ lng: "pt-BR", detection: false });
    expect(currentLanguage()).toBe("en");
    expect(englishName("pt-BR")).toBe("Portuguese");
    expect(englishName("zh-CN")).toBe("Chinese");
  });
  it("changeLanguage switches the active language", async () => {
    await initI18n({ lng: "en", detection: false });
    await setLanguage("es");
    expect(currentLanguage()).toBe("es");
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement** — `initI18n` creates the i18next instance with `resources` (inline `en` only), `fallbackLng: "en"`, `lng` from options or (when `detection` is true and `typeof window !== "undefined"`) `i18next-browser-languagedetector`. Key strings: `hud.talkTo` ("Talk to {name}"), `hud.leave` ("Leave"), `dialogue.continue` ("Continue"), `dialogue.thinking` ("{name} is thinking…"), `title.*`, `wizard.*`, `load.*`, `settings.*`. `currentLanguage` maps `i18n.language` through a normalize function (`zh-* → zh`, `es-* → es`, etc., unknown → `en`). `englishName` uses a small map of known codes + best-effort Intl.DisplayNames when available, else returns the code.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Typecheck + lint + commit** — `feat(rpg): add i18n skeleton (detection, fallback, English resources)`

## Task 5: Dynamic scene + asset helpers

**Files:**
- Modify: `rpg/src/scene/assets.ts`, `rpg/src/scene/manifest/openPlains.ts`, `rpg/src/render/stage.ts`, `rpg/src/render/three-stage.ts`, `rpg/src/scene/loader.ts`
- Create: `rpg/src/game/session.ts`
- Test: `rpg/tests/integration/session.test.ts`, `rpg/tests/unit/scene-c.test.ts` (extend: effects entry + dynamic actors)

**Interfaces:**
- Produces:
  - `rpg/src/scene/assets.ts`:
    - `export interface SpriteRequest { entity: string; pose: string; prompt: string; seed: string; negativePrompt?: string }`
    - `export async function resolveCharacterSprite(assets: AssetCache, req: SpriteRequest): Promise<ActorTextures>` — shared prod/dev path used by scene actors, wizard identity, and re-roll
    - `export async function reRollActorSprite(assets: AssetCache, req: SpriteRequest): Promise<ActorTextures>` — same pipeline with a fresh seed (caller supplies)
  - `rpg/src/scene/manifest/openPlains.ts`:
    - `export const openPlainsBase` — `{ schemaVersion, id, type, backdrop, floor, camera, effects: [{ kind: "fog", params: { color: 0x9fb4c8, opacity: 0.4, layers: 3, speed: 0.5 } }] }`
    - `export function buildOpenPlainsManifest(userActor, npcActor): SceneManifest` — base + actors
    - `export const openPlainsManifest` — kept (default actors: user placeholder + first NPC) so existing tests/loader stay valid
  - `rpg/src/render/stage.ts`:
    - `export interface StageEffect { update(dt: number): void; destroy(): void }` (imported from `../../effects/types`)
    - `Stage` gains `effects: StageEffect[]` and `updateActor(characterId: string, textures: ActorTextures): void`
  - `rpg/src/game/session.ts`:
    - `export interface GameSession { save: SaveGame; npc: NpcDefinition; buildManifest(): SceneManifest }`
    - `export const sessionSignal = signal<GameSession | null>(null)`
    - `export const conversationSignal = signal<ConversationTurn[]>([])`
    - `export function startSession(save: SaveGame): GameSession` — resolves `npc` from `save.scene.npcId`, builds actors from `save.identity` + `npc`, resets `conversationSignal`
    - `export function userActor(identity: Identity)` / `export function npcActor(npc: NpcDefinition)` — actor specs with positions (user at x 0.1/z -0.9, npc at x -2.2/z -3.8, scale ~0.9)

- [ ] **Step 1: Failing integration test**

```ts
// tests/integration/session.test.ts
import { describe, expect, it } from "vitest";
import { RpgDatabase } from "../../src/services/db";
import { buildIdentity } from "../../src/game/identity";
import { NPC_POOL } from "../../src/content/npcPool";
import { startSession, userActor, npcActor } from "../../src/game/session";
import { parseSceneManifest } from "../../src/scene/loader";

describe("session", () => {
  it("builds a valid dynamic manifest with user + picked NPC actors", async () => {
    const db = new RpgDatabase("dev", "test_session");
    const identity = buildIdentity({ name: "Arin", archetypeId: "traveler", background: { kind: "template", templateId: "bt1" } });
    const npc = NPC_POOL[2]!;
    const save = { slotId: "slot-1", identity, scene: { sceneId: "scene.open.plains", npcId: npc.id, day: 1, period: "dusk" }, progress: { talkedTo: [] }, flags: {}, updatedAt: 1 };
    const session = startSession(save);
    const manifest = parseSceneManifest(session.buildManifest());
    expect(manifest.actors.map((a) => a.characterId)).toEqual(["player", `npc/${npc.id}`]);
    expect(manifest.actors[1]!.sprite?.assetKey).toContain(npc.id);
    expect(userActor(identity).characterId).toBe("player");
    expect(npcActor(npc).characterId).toBe(`npc/${npc.id}`);
    db.close();
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement** — extract `resolveCharacterSprite` from the existing actor loop in `resolveSceneTextures` (identical prod/dev behavior + queue progress), rewire the loop to call it, add `reRollActorSprite` (same, explicit seed). `openPlainsBase` + `buildOpenPlainsManifest`; keep `openPlainsManifest` for compatibility. Stage interface + three-stage `updateActor` (swap sprite/outline materials, set visible) + `effects` array ticked in `tick()`; loader creates effects via the Task 9 factory when `manifest.effects` is non-empty and pushes them into `stage.effects`. `session.ts` per interfaces.

- [ ] **Step 4: Run to verify pass** — session test + full `pnpm test` (existing assets tests must stay green after the refactor)

- [ ] **Step 5: Typecheck + lint + commit** — `refactor(rpg): dynamic scene actors via session + shared sprite resolution`

- [ ] **Step 1: Failing router test**

```ts
// tests/unit/screens.test.ts
import { describe, expect, it } from "vitest";
import { navigate, screenSignal } from "../../src/game/state/screens";

describe("screen router", () => {
  it("navigates between screens", () => {
    navigate("wizard");
    expect(screenSignal.value).toBe("wizard");
    navigate("game");
    expect(screenSignal.value).toBe("game");
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement router + screens** — router is a signal + `navigate`. Port the POC (`templates/title-screen-poc/index.html` + `styles.css`) into `TitleScreen` as Preact with `t()` strings: **NEW GAME / LOAD GAME / SETTINGS / CREDITS / HELP**; Load disabled (`.is-disabled`) when `SaveStore.list()` is empty (title fetches it on mount via `useEffect`). `NewGameWizard`: 4 steps — ① name (`input`), ② archetype grid (radio cards; on selection, generates the sprite via `resolveCharacterSprite(services.assets, { entity: "identity/player", pose: "portrait", prompt: archetype.spritePrompt, seed: appearanceSeed, resolution: "512x768" })` (Task 5 helper; dev = placeholder cutout) → preview `<img>`, ③ background: template radio list + custom `textarea` toggle, ④ review (name, sprite thumb, background preview) + **Create** → `SaveStore.nextFreeSlot()` → if null, show overwrite picker (slot grid with names/dates) → `put(save)` → `onCreated(save)`. `LoadScreen`: slot grid (3 manual + autosave) with name + day/period + updatedAt date, empty state message, click → `onLoad(save)`. `SettingsScreen`: Language tab with the 5 languages (radio → `setLanguage`), Accessibility/Display/Audio tabs as disabled stubs. `CreditsScreen`/`HelpScreen`: static content + back.

- [ ] **Step 4: main.tsx rewiring** — after boot + WebGL2 gate (Task 8 pulls the gate; for now keep boot flow), render `Root`: reads `screenSignal`; on `title` → TitleScreen; `wizard` → NewGameWizard; `load` → LoadScreen; `settings`/`credits`/`help` → stubs; `game` → GameScreen (Task 7). The scene load moves OUT of the boot sequence into `GameScreen`.

- [ ] **Step 5: Styles** — port the POC CSS into `style.css` under `.title-screen`-scoped selectors (adapting to Preact class names), add wizard/load/settings styles in the same visual language; global `:focus-visible` ring (Task 8 lands the full ring; add the base now).

- [ ] **Step 6: Typecheck + lint + build + commit** — `feat(rpg): add onboarding screens (title, wizard, load, settings, credits, help)`

## Task 6: Screen router + onboarding UI

**Files:**
- Create: `rpg/src/game/state/screens.ts`, `rpg/src/ui/screens/TitleScreen.tsx`, `NewGameWizard.tsx`, `LoadScreen.tsx`, `SettingsScreen.tsx`, `CreditsScreen.tsx`, `HelpScreen.tsx`
- Modify: `rpg/src/main.tsx`, `rpg/src/style.css`
- Test: `rpg/tests/unit/screens.test.ts` (router only — components are CDP-validated)

**Interfaces:**
- Consumes: `SaveStore` (Task 1), `Identity`/`ARCHETYPES`/`USER_BACKGROUND_TEMPLATES` (Task 2), `t`/`setLanguage`/`SUPPORTED_LANGUAGES` (Task 4), `resolveCharacterSprite`/`SpriteRequest` (Task 5), `AssetCache` via `BootServices`
- Produces:
  - `export type Screen = "title" | "wizard" | "load" | "settings" | "credits" | "help" | "game"`
  - `export const screenSignal = signal<Screen>("title")`, `export function navigate(screen: Screen): void`
  - `TitleScreen({ services, onPlay(save: SaveGame) })`, `NewGameWizard({ services, onCreated(save: SaveGame), onBack() })`, `LoadScreen({ services, onLoad(save: SaveGame), onBack() })`, `SettingsScreen({ onBack() })`, `CreditsScreen({ onBack() })`, `HelpScreen({ onBack() })`
  - `rpg/src/services/boot.ts` — no change; screens receive `BootServices`

## Task 7: Game screen — narrator + multi-turn dialogue + re-roll

**Files:**
- Create: `rpg/src/ui/screens/GameScreen.tsx`
- Modify: `rpg/src/ui/App.tsx`, `rpg/src/ui/DialogueBox.tsx`, `rpg/src/main.tsx`, `rpg/src/services/mock/script.ts`
- Test: extend `rpg/tests/unit/dialogue-machine.test.ts` (multi-turn states) + `rpg/tests/integration/dialogue-flow.test.ts` (mock runtime: choice → follow-up turn)

**Interfaces:**
- Consumes: `sessionSignal` (Task 6), `buildNpcInstruction`/`buildNarratorInstruction` (Task 3), `resolveCharacterSprite`/`reRollActorSprite` (Task 6), `SaveStore` (Task 1), `t` (Task 4)
- Produces:
  - `GameScreen({ services, save, stage, onExit() })` — loads the scene from the session manifest on mount (LoadingScreen via progress store), runs the narrator opening (`generateText(buildNarratorInstruction(...))` → `showTurn("Narrator", text, [])`), renders HUD + DialogueBox; **Talk to {npc name}** triggers the dialogue loop
  - Dialogue loop (App.tsx): `talk()` → `buildNpcInstruction` (conversation = `conversationSignal.value`) → `showTurn(npc.name, ...)`; on `selectOption(i)`: append `{ speaker: "player", text: option }` + `{ speaker: npc.name, text: response }` to `conversationSignal`, then immediately `talk()` again (loop with new choices) unless the player chose **Leave** (always-escape, unchanged)
  - `ReRollButton` in the HUD: `reRollActorSprite(assets, { entity, pose, prompt, seed: `rr-${Date.now()}-${counter}`, negativePrompt })` → `stage.updateActor(characterId, textures)`; disabled while a generation is in flight

- [ ] **Step 1: Failing unit test (multi-turn machine)**

```ts
// extend tests/unit/dialogue-machine.test.ts
import { advanceDialogue, beginDialogue, chooseOption } from "../../src/game/dialogue/machine";
it("supports a follow-up turn after choosing (multi-turn loop)", () => {
  const first = beginDialogue({ speaker: "NPC", text: "What do you want?", options: ["Help", "Leave me"] });
  const advanced = advanceDialogue(advanceDialogue(first)); // both pages read → choices
  const chosen = chooseOption(advanced, 0);
  expect(chosen.state).toBe("ended");
  const follow = beginDialogue({ speaker: "NPC", text: "Then we fight.", options: [] }, chosen);
  expect(follow.state).toBe("speaking");
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement GameScreen + App loop + script** — per interfaces. `script.ts` gains a narrator entry (`/narrat|scene|opening/i`) and a follow-up entry (`/help|ruins/i` → reply with new `[choices]`), so the dev harness exercises the loop.

- [ ] **Step 4: Integration test** — `tests/integration/dialogue-flow.test.ts`: use the mock runtime (`createMockHarness`), drive `buildNpcInstruction` → parse → `showTurn` → `selectOption` → assert the conversation grew and a second generation produced a new turn.

- [ ] **Step 5: Run full suite + typecheck + lint + commit** — `feat(rpg): wire narrator opening and multi-turn dialogue loop with sprite re-roll`

## Task 8: A11y core

**Files:**
- Create: `rpg/src/ui/screens/UnsupportedScreen.tsx`, `rpg/src/services/webgl.ts`
- Modify: `rpg/src/main.tsx`, `rpg/src/style.css`
- Test: `rpg/tests/unit/webgl.test.ts` (pure check function)

**Interfaces:**
- Produces:
  - `export function webgl2Available(): boolean` — guarded canvas context probe
  - `UnsupportedScreen()` — static, keyboard-reachable, no game logic

- [ ] **Step 1: Failing test**

```ts
// tests/unit/webgl.test.ts
import { describe, expect, it } from "vitest";
import { webgl2Available } from "../../src/services/webgl";
describe("webgl2 gate", () => {
  it("returns false in node (no canvas)", () => {
    expect(webgl2Available()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement** — `webgl2Available` guards `typeof document === "undefined"` → false, else probes `canvas.getContext("webgl2")`. `main.tsx`: before rendering anything, if `!webgl2Available()` render `UnsupportedScreen` and stop. CSS: global `:focus-visible` outline (WCAG AA contrast), `prefers-reduced-motion` already present in the POC styles — add the global variant to `style.css`. Keyboard parity: the POC title menu already implements arrow-key navigation + focus management — port it to `TitleScreen` (Task 5), same pattern for the slot grid + wizard.

- [ ] **Step 4: Run to verify pass + full suite**

- [ ] **Step 5: Commit** — `feat(rpg): a11y core (WebGL2 unsupported screen, focus ring, keyboard parity)`

## Task 9: Fog effect (PixiJS overlay)

**Files:**
- Create: `rpg/src/effects/types.ts`, `rpg/src/effects/fog.ts`, `rpg/src/effects/index.ts`
- Modify: `rpg/src/scene/loader.ts` (factory call — stubbed in Task 6), `rpg/src/scene/manifest/openPlains.ts` (effect entry — added in Task 6)
- Test: `rpg/tests/unit/fog-registry.test.ts`

**Interfaces:**
- Produces:
  - `export interface StageEffect { update(dt: number): void; destroy(): void }`
  - `export interface EffectSpec { kind: string; params: Record<string, unknown> }`
  - `export async function createEffects(specs: EffectSpec[], container: HTMLElement, viewport: { width: number; height: number }): Promise<StageEffect[]>`
  - `export function createFogEffect(viewport, params): Promise<StageEffect>` — params: `{ color?: number; opacity?: number; layers?: number; speed?: number }`
  - `export function fogParams(spec: EffectSpec)` — pure validation/coercion of the params (unit-testable)

- [ ] **Step 1: Failing test**

```ts
// tests/unit/fog-registry.test.ts
import { describe, expect, it } from "vitest";
import { fogParams, createEffects } from "../../src/effects/index";
describe("fog effect", () => {
  it("coerces fog params with defaults", () => {
    expect(fogParams({ kind: "fog", params: { opacity: 0.3 } })).toEqual({ color: 0x9fb4c8, opacity: 0.3, layers: 3, speed: 0.5 });
    expect(fogParams({ kind: "fog", params: {} })).toMatchObject({ opacity: 0.4, layers: 3 });
  });
  it("unknown effect kinds are skipped, not fatal", async () => {
    // createEffects with a fake container (no pixi init in node) returns [] for unknown kinds
    const effects = await createEffects([{ kind: "nope", params: {} }], document.createElement("div"), { width: 800, height: 600 });
    expect(effects).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement** — `fog.ts`: `createFogEffect` async-inits a PixiJS `Application` (`backgroundAlpha: 0`, `antialias: false`, canvas absolutely positioned over the stage container at the letterbox rect computed by `rpg/src/render/viewport.ts`), draws `layers` wide soft blobs (a generated radial-gradient texture, `BlurFilter` optional), each drifting horizontally at `speed * layerIndex` px/s, wrapped at the rect edges; `update(dt)` advances offsets; `destroy()` calls `app.destroy()`. `index.ts` maps `kind === "fog"` → factory, skips unknowns. `loader.ts` passes `manifest.effects` to `createEffects` and pushes results into `stage.effects` (Task 6 hook).

- [ ] **Step 4: Run to verify pass** (registry only — the visual is CDP-validated in Task 12)

- [ ] **Step 5: Typecheck + lint + build + commit** — `feat(rpg): declarative fog effect on the type-C stage (PixiJS overlay)`

## Task 10: Docs

**Files:**
- Modify: `README.md`, `AGENTS.md`, `test-prompt.txt`

- [ ] **Step 1: README** — add the onboarding flow + payload/dialogue loop to the orientation doc (what the Perchance agent needs to test: title → wizard → scene → narrator opening → multi-turn dialogue with choices → re-roll button → leave).

- [ ] **Step 2: AGENTS.md** — spec index unchanged; add `rpg/src/game/` (save, payload, session), `rpg/src/content/` (seed content), `rpg/src/effects/` (fog) to the repository map; note i18n (EN-only resources, fallback) and the WebGL2 unsupported screen.

- [ ] **Step 3: test-prompt.txt (round 8)** — English handoff: boot → title renders (New Game/Load/Settings/Credits/Help, Load disabled with no saves) → New Game wizard (name → appearance generates + previews sprite → background template/custom → review) → save slot created → scene loads → narrator opening appears → Talk to {NPC} → multi-turn loop (choice → follow-up with new choices) → Leave always works → re-roll button regenerates the NPC sprite (new seed, cutout cache miss) → reload: identity/NPC persist from the save (no regeneration), title Load shows the slot. Report console errors, timing, and any UX gaps.

- [ ] **Step 4: Commit** — `docs(rpg): onboarding + narrative loop orientation and round-8 test prompt`

## Task 11: Full validation + browser (CDP) + commit build

- [ ] **Step 1: Full suite** — `cd rpg && pnpm typecheck && pnpm lint && pnpm test:all && pnpm build && pnpm test:e2e` — all green; confirm the pixi chunk lands in the main bundle (no new lazy chunk regressions).

- [ ] **Step 2: Browser (CDP)** — start dev server (setsid, port 5173); drive: title renders → wizard flow (mock: sprite preview = placeholder) → save created → scene loads → narrator opening shown → Talk → choices → follow-up → Leave → re-roll button swaps the NPC sprite → reload keeps the save (Load shows the slot). Screenshot key screens. Check console (only the favicon 404 + benign warnings).

- [ ] **Step 3: Shutdown** — `pkill -f "/opt/google/chrome/chrome"`; kill the dev server; confirm zero Chrome processes.

- [ ] **Step 4: Commit the build** — `build(rpg): regenerate the gameplay-phase bundle`

- [ ] **Step 5: Self-review against the decisions** — walk the owner decisions (3 manual + autosave ✓, wizard complete ✓, sprite at identity ✓, narrator opening only ✓, multi-turn loop ✓, seed-authored NPC pool ✓, full save schema ✓, EN+i18n structure ✓, detected AI language ✓, fog first ✓, sprite-only re-roll ✓, a11y core ✓, one phase no new spec ✓). Fix gaps found.

- [ ] **Step 6: Summary for the owner** — what shipped, validation results, nothing pushed (push + ship happen at round time).

---

## Execution notes

- Execute inline (no subagent tool in this session), task by task, TDD (failing test → implement → pass → commit).
- Between tasks: `pnpm typecheck && pnpm lint && pnpm test` (unit+integration).
- The `[choices]` parser, dialogue machine, pagination, and always-escape are untouched except where noted (multi-turn is App-level orchestration, not a machine rewrite).
- The openPlains manifest keeps a default `openPlainsManifest` export so the existing scene-c tests and the POC remain valid.
