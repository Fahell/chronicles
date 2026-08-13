# VN-RPG — Scene System & Visual Techniques Spec

> **Status:** Draft (ideation phase)
> **Scope:** scenes and visual techniques only. The narrative/story system is a
> separate spec (built around the `generateText` plugin) and is **out of scope**
> here.
> **Owner:** project owner + primary dev agent
> **Related:** `PERCHANCE-GUIDE.md` (platform reference), `narrative-spec.md`,
> `relationships-spec.md`, `pending-decisions.md`, `AGENTS.md` (conventions),
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
  (stats, inventory, simple progression).
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
- **Day/night cycle** (time-of-day variation)

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

### 3.7 Character presence in scenes (type A)

Characters appear in two distinct ways:

**NPCs — in the scene:**

- Static, but able to **change places with different poses** — e.g., fade out
  and appear in another position with a different pose.
- The user never appears this way.

**User — first person:**

- The user is in **first person**: not placed in the scene.
- The user only appears when **dialogue boxes** show on their own turn to
  speak — the classic VN arrangement where characters appear **behind and
  above the dialogue box**.
- Classic alternation: **when one speaks, the other dims** (the active speaker
  is highlighted).

Open detail: how NPCs are represented during dialogue (their in-scene sprite
vs a dedicated portrait beside the dialogue box) — to be decided in the
prototype.

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

**Expected style:** a "papercraft" look — 2D assets in a 3D world. With the
right treatment this should look good — likely **better than the heuristic of
type A**.

## 4. Assets & AI Generation Pipeline

### 4.1 Asset policy

- Characters and environment objects are generated by the image plugin and
  integrated as **2D layered sprites** over the backdrop (classic VN style).
- **Production:** `removeBackground` is **ON** for asset generation.
- **Development:** `removeBackground` is **OFF** (avoids wasting resources on
  dev-only outputs).
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
with a bad asset. **How** the regenerate option is surfaced to the player is
**not yet defined** (open item, §9; see `pending-decisions.md` §2).

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
- **Intro screen (minimum):** a title screen with at least **New Game**,
  **Load Game** and **Settings**. The look and contents of the title, New
  Game, Load and Settings screens are **not yet defined**
  (`pending-decisions.md` §3).

## 9. Explicitly Open Items

| Item | Notes |
| --- | --- |
| Scene **style, composition, angle** | Deliberately left open (owner decision) |
| Scene definition format | Baseline: hybrid, typed manifest schema v1 (tech-spec §5.3) — experiments refine |
| Final scene approach (A/B/C) | Decided by experiments + §6 criteria |
| Type C papercraft treatment | Feathered edges + ambient-color sides — prototype and evaluate |
| Parallax / camera effects | Deferred; can be revisited |
| Floor/scale alignment strategy (type A) | Main invalidation risk — mitigations to experiment |
| NPC representation during dialogue | In-scene sprite vs dedicated portrait — prototype decision |
| Asset regeneration UI | How the player triggers regeneration of a defective asset (§4.3) |
| Pre-generated webp assets | Which assets (if any) ship pre-generated (§4.2) |
| Intro / New Game / Load / Settings screens | Minimum set defined (§8); look & contents open |
| Narrative system | Separate spec (text plugin) |
| Audio (music/SFX) | Future phase; out of scope now |
| Stack, tooling, framework | Decided after this ideation phase |
| Project name | TBD |

## 10. Next Steps

1. Prototype **approach A** (static image + code effects) as the first scene
   experiment.
2. Build the dev pipeline around mocked `generateImage`/`generateText` with
   dev/prod modes and separate caches.
3. Use the prototype to settle the **scene definition format** (§3.5).
4. Iterate effects priority (§3.3) on the prototype.
5. **De-risk floor/scale early:** experiment with prompt angle consistency and
   scene layout (floor line, scale anchors) as the top risk for type A (§3.6).
6. Prototype the **type C hybrid idea** (floor + backdrop images with feathered
   edges, §3.8) and compare it against type A.
7. Later: define the narrative spec (separate document).
