# VN-RPG — Scene System & Visual Techniques Spec

> **Status:** Draft (ideation phase)
> **Scope:** scenes and visual techniques only. The narrative/story system is a
> separate spec (built around the `generateText` plugin) and is **out of scope**
> here.
> **Owner:** project owner + primary dev agent
> **Related:** `PERCHANCE-GUIDE.md` (platform reference), `narrative-spec.md`,
> `relationships-spec.md`, `gameplay-spec.md` (stats/inventory/progression),
> `day-cycle-spec.md` (day structure & time-of-day),
> `pending-decisions.md`, `AGENTS.md` (conventions),
> `README.md` (platform-facing orientation).

---

## 1. Purpose

This document defines **what the project's scene system should be and how it
should behave**, before any stack, tooling, or framework decisions are made.
The project is in the ideation stage: for each phase we may experiment with
multiple implementation forms, since there is no fully defined path yet. This
spec captures the agreed direction and explicitly marks everything that remains
open.

## 2. Project Vision (context)

- A **visual-novel-style RPG** built as a Perchance generator, powered by the
  two platform plugins:
  - `generateImage` → all visual assets and scene imagery.
  - `generateText` → narrative/secondary text content.
- **Gameplay balance:** reading + player choices, plus **light RPG systems**
  (stats, inventory, simple progression) — defined in `gameplay-spec.md`
  (zero gameplay in the MVP slice).
- **Art direction:** **HD-2D / pixel art** (crisp textures, the
  nearest-neighbor / pixelated mindset from the previous project).
- **Text role:** main story arc is scripted; AI text is used for *secondary*
  content (NPCs, descriptions, reactions).
- **Experimentation mindset:** each stage may test several implementation
  approaches before settling on one.

## 3. Scene System

### 3.1 Scene approaches under consideration

| Approach | Description | Priority |
| --- | --- | --- |
| **A. Static image + code effects (2.5D)** | AI-generated background enhanced by code-driven effects (particles, fog, lighting) | **First experiment** |
| **B. Pure code scene (e.g. three.js)** | Fully procedural/3D scene, no image | Explore later |
| **C. Mixed (three.js + image)** | AI images as floor + backdrop inside a 3D scene — papercraft idea (§3.8) | Explore later |

No single path is predefined — the experiments will decide.

### 3.2 Scene anatomy (candidate layering)

A classic VN "stage" stacked back-to-front:

1. **Backdrop layer** — the scene background.
2. **Effects layer** — code-driven atmosphere (particles, fog, lighting, time of
   day).
3. **Character/asset layer** — layered 2D sprites.
4. **UI layer** — dialogue box, choices, menus.

### 3.3 Effects priority (v1)

Must-have first, in the first scene prototype:

- **Particles** (rain, snow, embers, dust, falling petals)
- **Fog / haze** (atmospheric depth)
- **Dynamic lighting** (lights, shadows, glow, torches)
- **Day/night cycle** (time-of-day variation) — backed by the structural day
  system (`day-cycle-spec.md` §3): the in-game period (Morning/Afternoon/Night)
  drives both the visual cycle here and the time-of-day context injected into
  LLM payloads (`narrative-spec.md` §5.3).

Deferred for now (re-evaluable later): parallax depth, camera
movement/zoom/shake.

### 3.4 Interactivity

The scene is a **pure backdrop**: interaction happens only through dialogue
choices. No clickable hotspots or exploration in this phase (open to revisit
later).

### 3.5 Scene definition format

**Baseline direction (hybrid):** declarative typed manifests
(`SceneManifest`, schema v1 in `tech-spec.md` §5.3, grounded in Ren'Py /
Monogatari patterns — `research-resolutions.md` §2) as the default, with a
**code escape hatch** (`ScenePlugin`) for special scenes (type C/B, future
cases). The concrete schema is drafted; experiments will refine it.

- Data-driven (declarative files: backdrop, effects, actors, transitions)
- Code-built (per-scene functions/classes) — the escape hatch
- Hybrid (declarative data + special scenes in code) — **the baseline**

### 3.6 Scene type A — known challenges (scale & floor)

The first and most complicated challenge of scene type A is **making
characters have a realistic size inside an AI-generated scene**.

Every generated backdrop (a garden, a room, a hall, a forest) carries two
intrinsic problems:

1. **Floor boundary** — where the ground actually is: how far into the scene a
   character can stand, and at what height the character's feet should land.
2. **Scale** — the size relationship between the character and the environment
   elements in the image.

**Angle consistency (the intended lever):** the image prompt can enforce a
strict angle in the format we request, and the prompt can be iteratively
"trained" until generations become consistent. This helps — but it does not, by
itself, solve realism.

**The realism trap (populated empty scenes):** the concept is a **static, empty
scene to be filled with generated assets**. That is what makes the scene
different — and potentially error-prone. Example: generate a scene with a front
view and depth, empty in the center, with pillars at the edges. The center is
where NPCs, objects, and everything else are placed. But different images, with
different angles, can make the same objects **too large or too small for the
scene**.

**The invalidation risk:** the same character, with no change in its own
height, can end up looking like a dwarf in a closed scene with depth and large
objects (e.g., a room), yet look normal in an open-air scene. Aligning
**floor** (how far into the scene the character can stand) and **scale** is the
main complexity — and potentially the main **invalidator** of scene type A in
this project.

> **Status:** flagged as the top technical risk for type A. Mitigations are to
> be discovered through experiments (see §10).

### 3.7 Character presence in scenes (owner revision)

All characters — NPCs **and the user's avatar** — are placed **in the scene**
(owner decision, interview):

- **Static sprites that change places with different poses** — e.g., fade out
  and appear in another position with a different pose (NPCs and the user
  alike).
- **Facing:** each character is **always turned toward their interlocutor** —
  the user's avatar faces the NPC being spoken to, and the NPC faces the user.
  With multiple NPCs, each faces whoever they talk to. Implemented at runtime
  via positioning/mirroring of authored sprites (open detail: whether
  dedicated side/back orientations are ever needed, §9).
- **Active-speaker emphasis:** when one speaks, the others dim — brightness
  based (a11y-safe, `tech-spec.md` §5.5).

**Dialogue representation — speaker portrait in the box (owner revision):**

- The dialogue box shows **the portrait of whoever is speaking** — NPC **and**
  user — **plus the dialogue text**.
- The classic "characters behind and above the dialogue box" arrangement is
  **dropped**.
- **Portrait assets:** every speaker needs a **portrait** — a new asset type
  in the pipeline (§4). v1: **one neutral portrait per character**; pose-linked
  portraits may come later (ties to the pose sets, `narrative-spec.md` §6).
- Scene types B/C remain to be verified; this presence model is the baseline. (Update: **type C is now approved** — see §3.8 status.)

### 3.8 Scene type C — hybrid idea (three.js + images)

**Two images per scene:**

1. **Floor image** — texture for the 3D ground plane.
2. **Backdrop image** — the scene background (delimits the scale).

**Empty sides, not a box:** the lateral sides are intentionally empty. To avoid
the "box"/rectangular look, the images' edges are **feathered** — softly faded
out, like being erased, with an **irregular shape** — and the empty space at
the sides follows the **ambient color of the time of day**: white for day,
darkening to black for night. (This also feeds the day/night cycle effect,
§3.3.)

**Why this solves type A's problems (§3.6):** the 3D scene provides a real
floor (an image) and the backdrop delimits the scale, so **floor and scale stop
being heuristics**:

- the character can go anywhere in the scene,
- the fixed camera shows the character at the correct size, and
- any object asset can be placed at any depth.

**Ground↔backdrop junction (no holes at the upper sides):** in perspective
the rectangular floor becomes a trapezoid — its far edge is narrower than the
backdrop, which exposes the backdrop's below-horizon band as holes at the
upper sides of the screen (Perchance round 3 finding). Two layout invariants
prevent this (enforced in `scene/layout.ts` defaults + tests):

1. **The floor's far edge reaches the backdrop plane** — `floor.depth +
   floor.height*scale/2 ≤ backdrop.depth` (the defaults place it ~0.05
   behind the plane, so the backdrop occludes the overlap and no z-fighting
   occurs at the seam).
2. **The far edge spans the backdrop's width** — `floor.width*scale/2 ≥
   backdrop.width/2`, so the backdrop's below-horizon band is fully hidden
   behind the floor at the far corners.

**Expected style:** a "papercraft" look — 2D assets in a 3D world. With the
right treatment this should look good — likely **better than the heuristic of
type A**.

> **Status: ✅ APPROVED — primary scene format (owner decision, after POC).**
> The **open-scene hybrid proof of concept** (`templates/open-scene-poc/`)
> validated the idea in practice with two generated images (one floor texture,
> one landscape backdrop): a real 3D floor plane plus a distant backdrop
> solved the floor/scale alignment problem for the open case, and the
> diagnostic sliders made the junction tunable (depth, height, scale, FOV).
>
> Decision recorded:
>
> - **Type C (hybrid three.js + plugin images) is the approved baseline for
>   scene construction.**
> - **Type A (pure static image + code effects) is NOT discarded.** It can
>   still be used in selected moments/settings — it remains a valid fallback —
>   but its fundamental challenges (§3.6) still need better solutions before it
>   is relied upon.
> - Type B (pure three.js) is not excluded either; nothing in this decision
>   removes it from consideration.
> - The open-scene POC only validated the **open** variant of type C.
>   **Closed scenes** (interior/enclosed variants) still need their own
>   validation (different floor/wall/ceiling, occlusion, and camera needs) —
>   recorded as future work in `templates/open-scene-poc/README.md`.

## 4. Assets & AI Generation Pipeline

### 4.1 Asset policy

- Characters and environment objects are generated by the image plugin and
  integrated as **2D layered sprites** over the backdrop (classic VN style).
- **`removeBackground` is per-asset, never mode-derived:** only **character
  sprites** enable it. Scene planes (backdrop/floor) must NOT have background
  removal — applied to a landscape, the model classifies the sky as
  "background" and nulls it to black (Perchance round 3 forensics: 76.8%
  pure-black pixels on the backdrop with it on vs 0% without, same
  prompt+seed). Default is `false` for every request.
- **Sprite matte cleanup (removal is never 100%):** the plugin's background
  removal leaves a semi-transparent fringe and dark spill around the
  silhouette ("faint rectangular edges", Perchance round 3). Two measures
  close the gap: (a) sprite prompts ask for a **solid pure black background**
  (easiest case for the removal model; any residual spill is near-black);
  (b) every generated portrait passes through a client-side matte cleanup
  (`scene/sprite-matte.ts`) that trims barely-transparent fringe and removes
  dark pixels **adjacent to transparency** only — opaque dark clothing is
  never touched. The sprite material also sets `alphaTest` (residual
  semi-transparent pixels are discarded, not blended dark against the
  scene). A future option is a heavier external remover (e.g. pyodide/
  python) — deferred.
- **Dev discipline:** only a few real images are generated per test round —
  just enough to validate the implementation, never throwaway art at scale.
- **NPC pose sets:** each NPC's sprite set is composed of **poses**, gated by
  the relationship system (`narrative-spec.md` §6): strangers get default +
  1 idle + angry; the remaining poses activate on demand in dev tests.
- **Future — world-generated characters:** characters created by the world
  generation vision (`relationships-spec.md` §7) will flow into asset
  generation here (image + pose set).

### 4.2 Generation timing & distribution

- **Pre-generate + cache** (persistent cache, Dexie-style): scenes load
  instantly, generation happens ahead of play.
- **Caching is separated per mode** (dev cache vs prod cache) so development
  generations never pollute the production cache.
- **Distribution model (owner direction — `pending-decisions.md` §2):**
  hybrid leaning per-player. The **initial path** is **full generation on the
  Perchance platform** (per player/device) with a **persistent cache**, so
  assets are not regenerated on reload. Some assets **may** be pre-generated
  and shipped as **webp** where instant availability pays off — but that is
  not the initial path.

### 4.3 Asset regeneration (user control)

The image plugin supports **regenerating a generated image**. A generated
asset can come out with a defect (artifacts, wrong details), so regeneration
is integrated **intelligently as user control** — the player must not be stuck
with a bad asset.

**Decided baseline (owner interview):**

- **UX:** a **"regenerate" (re-roll) button on the asset** itself (e.g., the
  portrait, the inventory item, the backdrop) that re-runs the generation —
  the classic AI regenerate pattern, simple and cheap. No variant carousel in
  v1.
- **Seed semantics:** regeneration uses a **new seed**. Character/scene
  consistency relies on the **fixed prompt template** (§4.4); the new seed is
  what actually fixes the defect. A re-roll produces a new cached generation
  (cache key includes seed, `tech-spec.md` §6.1).

### 4.4 Character consistency

- Fixed **prompt template + fixed seed per character** to keep the visual
  stable across generations.

### 4.5 Scene images

- The background generation approach is part of the scene experiments.
  Style, composition, and angle are **explicitly open** (see §9).

## 5. Runtime & Platform Constraints (non-negotiables)

- The plugins are **not APIs** — they only execute inside the Perchance
  platform; there is no local equivalent.
- The generator runs inside a **cross-origin iframe** (not the top frame):
  external CDP/browser-automation testing of the live generator is not viable.
  Final runtime validation happens via `test-prompt.txt`, handed to the
  Perchance AI agent.- Generation takes time: **always show a loading indicator** and cache
  results aggressively.
- **No app-level retry/timeout on plugin content** (owner decision,
  `pending-decisions.md` §5): the plugins handle their own generation failures
  and retries. Implementing our own timeout/retry is purely heuristic and
  discouraged — a timeout firing while a generation is merely slow would waste
  an in-flight generation. Loading indicators are UX, not timeouts.
- Perchance quotas: `src/` = 100 MB total, 5 MB per file, 1000 files max.
- Ship policy: only the app code and `README.md` are uploaded to the platform.

## 6. Evaluation Criteria (choosing the final scene approach)

The following weigh most when comparing approaches:

1. **Visual quality**
2. **Performance** (FPS + load time)

Other factors (dev complexity, platform fit, generation cost) are still tracked
but secondary.

## 7. First Playable Demo (MVP)

A **single complete scene**:

- Generated background
- Code-driven effects (from §3.3)
- A layered character sprite
- Working dialogue flow

Local development runs against mocked plugins; final runtime validation happens
on the Perchance platform.

## 8. Screen & Presentation

- **Responsive, landscape-oriented**, on both desktop and mobile.

### 8.1 Onboarding flow (owner decisions — `pending-decisions.md` §3)

```
Title
 ├─ New Game → identity wizard (name → appearance → background → review) → first scene
 ├─ Load Game → slot grid (3–6 + autosave) → load → scene
 ├─ Settings → tabs (Language / Accessibility / Display / Audio-future)
 ├─ Credits
 └─ Help / Controls
```

- **Title screen:** shows **"Chronicles of {player name}"** (the player's
  name from identity creation, `narrative-spec.md` §7) with **New Game / Load
  Game / Settings / Credits / Help**. **Look & layout are based on a reference
  image the owner will share** (pending — the title's visual design anchors to
  it). When no save exists, **Load is disabled**.
- **New Game — identity wizard (guided steps):** ① **name** → ② **appearance**
  (free or archetype) → ③ **background story** (write or template) →
  ④ **review/confirm**. Each step offers **random/template** quick paths.
  Creating the game **creates a new save slot**; when all 3–6 slots are full,
  the player is asked to **overwrite an existing one** (with confirmation).
  **Identity is locked to the save**: the name is only changeable *before*
  creating the game; appearance and background are never changed afterwards
  (`narrative-spec.md` §7).
- **Load Game:** a grid of the **3–6 manual slots + autosave**, each showing a
  **thumbnail (backdrop from cache) + player name + day/period + scene name +
  date** (`tech-spec.md` §7.2). Disabled when no saves exist.
- **Settings (tabs):** **Language** (5 languages + fallback EN,
  `narrative-spec.md` §8.1) / **Accessibility** (text size, skip,
  reduced-motion toggle — post-MVP, `tech-spec.md` §5.5) / **Display**
  (quality/fullscreen where applicable — contents open) / **Audio** (future
  phase — reserved tab).
- **Secondary screens:** **Credits** (required — CC BY/CC0 asset
  attributions, `gameplay-spec.md` §6.4) and **Help / Controls** (keyboard
  shortcuts, how to play).

### 8.2 In-game (pause) menu

- **Basic pause menu (v1):** **Save / Settings / Quit-to-title**. Opened with
  **Esc** (keyboard parity, `tech-spec.md` §5.5).
- In-game **Load and Sleep are deferred** from the pause menu. **Sleep**
  (day-end trigger, `day-cycle-spec.md` §3) is a **scene-level action
  candidate** (open detail — placement TBD).

### 8.3 MVP scope (base slice)

- **Complete in the MVP:** the **title screen** (based on the owner's reference
  image) and the **New Game identity wizard**.
- **Navigable stubs in the MVP:** Load, Settings, Credits, Help.
- **Full contents post-MVP:** Load slot details, Settings tabs (incl. a11y),
  Credits/Help content, pause menu.

- **Accessibility baseline** (`tech-spec.md` §5.5): full keyboard parity,
  screen-reader dialogue + menus, visible focus, contrast AA; the **MVP slice
  ships the core** (keyboard, aria-live, focus, contrast, unsupported-browser
  screen), and the full a11y settings land post-MVP.

## 9. Explicitly Open Items

| Item | Notes |
| --- | --- |
| Scene **style, composition, angle** | Deliberately left open (owner decision) |
| Scene definition format | Baseline: hybrid, typed manifest schema v1 (tech-spec §5.3) — experiments refine |
| Final scene approach (A/B/C) | Decided by experiments + §6 criteria |
| Type C papercraft treatment | Feathered edges + ambient-color sides — prototype and evaluate |
| Parallax / camera effects | Deferred; can be revisited |
| Floor/scale alignment strategy (type A) | Main invalidation risk — mitigations to experiment |
| NPC representation during dialogue | **Resolved (§3.7):** speaker portrait in the dialogue box (NPC + user); user avatar in scene, facing interlocutor |
| Portrait assets | One neutral portrait per character v1; pose-linked portraits later (ties to pose sets, `narrative-spec.md` §6) — asset-pipeline detail |
| Facing mechanics | Sprites mirrored/positioned at runtime to face the interlocutor; whether dedicated side/back orientations are ever needed (§3.7) |
| Asset regeneration UI | **Resolved (§4.3):** re-roll button on the asset + **new seed** |
| Pre-generated webp assets | Which assets (if any) ship pre-generated (§4.2) |
| Onboarding screens | **Resolved (§8.1–8.3):** flow + contents defined (wizard, load slots, settings tabs, credits/help, pause); **title look resolved** via the reference image + POC (`templates/title-screen-poc/`) |
| Narrative system | Separate spec (text plugin) |
| Audio (music/SFX) | Future phase; out of scope now |
| Stack, tooling, framework | **Resolved:** APPROVED stack in `tech-spec.md` §2 (pnpm / Vite / Preact+signals / three.js / PixiJS / Dexie / i18next / Biome / Vitest) |
| Project name | **Chronicles** (working title) — title screen shows "Chronicles of {player name}" (§8) |

## 10. Next Steps

1. **Type C (open variant) is the approved baseline** (§3.8) — the MVP scene
   slice builds on it: three.js floor + backdrop planes with placeholder
   sprites (validated by `templates/open-scene-poc/`).
2. Build the dev pipeline around mocked `generateImage`/`generateText` with
   dev/prod modes and separate caches.
3. Use the first scene build to settle the **scene definition format** (§3.5).
4. Iterate effects priority (§3.3) — the PixiJS 2D overlay stack
   (particles/fog/lighting/day-night) complements the 3D stage.
5. Keep **type A** as a valid fallback for selected moments (§3.8); its
   floor/scale alignment (§3.6) remains to be solved when it is actually used.
6. Validate the **closed variant** of type C (walls/ceiling, occlusion,
   camera) as a future prototype.
7. Later: scene definition content (style/composition/angle), audio
   (music/SFX), and world-generation content.
