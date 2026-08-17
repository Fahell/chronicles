# Perchance — A Practical Developer's Guide

A knowledge dump about the **Perchance** platform: what it is, how its generator
language works, how to build apps with it, how the plugins work, and how to work
on a project locally. Written for a developer who is downloading a Perchance
project (like this one) and wants to understand the platform from the ground up.

> Level: you know HTML/CSS/JS. This guide teaches the Perchance-specific parts.

---

## 1. What is Perchance?

Perchance (https://perchance.org) is a free platform for building **generative
web apps** — random generators, games, interactive stories, tools — using a
simple indentation-based **list syntax** (called **pjs**, "Perchance JS") on top
of ordinary HTML/CSS/JavaScript.

The core idea:

- You write **hierarchical lists** of text/options (with optional weights).
- You sprinkle **JavaScript in `[square brackets]`** anywhere you want dynamic
  content (in pjs lists, in HTML text, in HTML attributes).
- When the page renders, every `[block]` is evaluated by the engine and replaced
  with its result.
- The result is a normal web page in an iframe, served at
  `https://perchance.org/<generatorName>`.

Everything else (three.js, i18next, Dexie, game loops, canvases) is just normal
web development inside `index.html` / `main.pjs`.

**Key mental model:** a Perchance generator is a *web app* whose "template
engine" is Perchance's list syntax. You can do anything a normal website can do.

---

## 2. Anatomy of a generator

A generator is made of these parts:

```
main.pjs               — the Perchance code (lists, data, JS functions, imports)
index.html             — the HTML <body> content (templated with [square blocks])
src/                   — your own persistent file tree (JS, CSS, images, data, docs)
imports/<name>/        — read-only auto-downloaded copies of every {import:...}
scratch/               — ephemeral AI-helper workspace (NOT part of the generator)
```

### `main.pjs`

- Holds your **lists** (data in Perchance syntax) and **top-level JS**.
- Is implicitly loaded *before* `index.html` runs.
- Every top-level name becomes a **global** on the page (`window.fruit`), and is
  also reachable as `root.fruit` in Perchance contexts.
- It is *not* a `.js` file in the normal sense — the engine parses its list
  syntax. Plain JS still works, but with a Perchance-specific header syntax (see
  §4).

### `index.html`

- This is the **contents of `<body>` only**. Never add `<html>`, `<head>`, or
  `<body>` tags — Perchance supplies the wrapper.
- You *can* put `<style>`, `<script>`, `<link>` etc. directly in it.
- It supports Perchance templating: `[expression]` in text nodes and in
  non-event HTML attributes are evaluated at render time.
- The engine evaluates the **whole** template (all square blocks and pjs
  expressions) *first*, and only then runs `index.html`'s `<script>` tags, in
  order. Do not rely on top-to-bottom interleaving between `[blocks]` and
  scripts.

### `src/`

- Your **persistent, ship-persistent** file tree — like a real small project repo.
- Files are referenced by relative path from the page:
  - `<script src="src/game.js"></script>`
  - `<script type="module" src="src/main.js"></script>`
  - `<img src="src/sprites/hero.png">`
  - `fetch("src/data/items.json")`
  - `import { step } from "./physics.js"` (from another src file)
- `src/` consumes the generator's storage quota (100MB total, 5MB per file,
  1000 files) and every file is **publicly visible** to anyone. Keep it tidy:
  only files the shipped generator actually uses. No secrets, no build caches.
- Everything that is *not* `main.pjs`, `index.html`, or under `src/` is
  **ephemeral** (see `scratch/`).

### `imports/`

- When you add `{import:someName}` to your code, the platform automatically
  downloads that generator's source into `imports/someName/` so you can read it.
- These are **read-only reference copies** — editing them does nothing to the
  real import.
- To *change* an import's behavior, **vendor it**: copy the lists/code you need
  into your own `main.pjs` and stop referencing the import.

### `scratch/` (AI-helper workspace — you won't have this locally)

- When you use Perchance's AI coding helper, `scratch/` is where downloads,
  unzipped archives, notes, and intermediate data live.
- It is ephemeral (gone next session) and does **not** ship with the generator.

---

## 3. main.pjs and index.html — what they really are

> **Who this section is for:** another coding agent (or developer) who has never
> used Perchance and is going to work on this project **outside** the platform,
> probably mocking the Perchance runtime. This is the knowledge you would get
> wrong or waste hours discovering by yourself.

### 3.1 The two biggest traps

1. **`main.pjs` is NOT a real JavaScript file.** Despite the `.js` extension it
   is a *data file* in Perchance's list syntax. It will not `node --check`; it
   is not loaded by the browser directly. The Perchance engine parses it (on the
   platform) into internal list objects **before anything else runs**, and turns
   its top-level names into page globals. Treat it as "declarative data +
   config", not as application code.

2. **`index.html` is NOT a complete HTML document.** It contains only the
   content Perchance puts inside `<body>`. There is no `<!DOCTYPE>`, no
   `<html>`, no `<head>`, no `<body>` — Perchance wraps it. And it is
   **templated**: any `[square block]` in its text or attributes is evaluated by
   the engine at render time, before any of your `<script>` tags run.

### 3.2 The exact load sequence on the platform

Know this order cold — it explains most Perchance "bugs":

1. Perchance loads the generator's `main.pjs`, plus every `{import:...}` it
   references (transitively), and fetches each one's source.
2. It **parses the pjs list syntax** into list objects. Every top-level name in
   `main.pjs` becomes available as `window.<name>` **and** as `root.<name>`
   (via the special `root` list/global).
3. It builds the page shell (header, wrapper, `$meta` SEO data) and wraps
   `index.html`'s content inside it.
4. It **evaluates the ENTIRE template**: every `[ ... ]` square block in
   `index.html` text/attributes *and* in pjs list items is resolved, recursing
   into nested list selections (`[myList.selectOne]`, `{a|b}`, `^weights`, …).
5. **Only then** do the `<script>` tags in `index.html` run, in order — classic
   scripts first, then deferred/module scripts.
6. Async platform work (`root.generateImage`, `root.generateText`, …) continues
   at runtime; everything after load is ordinary web JS.

Two consequences that bite everyone:

- A `[window.x = 123]` square block sitting *below* a `<script>` tag in the HTML
  still runs **before** that script. Script variables do **not** exist yet when
  square blocks evaluate.
- The template is evaluated in one pass, so you cannot rely on top-to-bottom
  interleaving between `[blocks]` and scripts.

### 3.3 The contract — what the platform guarantees in your page

A local agent must know exactly which globals exist *because the platform made
them*, versus which the project makes itself:

| Global | Who makes it | Meaning |
| --- | --- | --- |
| `root` (and `window.root`) | platform | The generator's top-level list object. `root.<name>` for any top-level pjs name; plugin functions live here too (`root.generateImage`, …). |
| `window.<topLevelName>` | platform | Same names, as page globals. |
| `window.generatorName` | platform | Editable generator name from the settings modal. |
| `window.generatorPublicId` | platform | 32-char hex id; the iframe URL is `https://<publicId>.perchance.org/<name>`. |
| `window.MathemaI18n` | project | i18n wrapper (typed: `app/services/i18n.ts`; historical legacy: `src/mathema/js/i18n.js`). |
| `window.MathemaSettings` | project | Settings API (historical legacy: `src/mathema/js/settings.js`). |
| `window.SceneTest1` / `SceneTest2` | project | Scene launchers, registered by the scene modules. |

Plus platform behaviors you should never fight:

- **Element `id`s are page globals**: `<div id="scoreEl"></div>` is reachable
  as bare `scoreEl`. Project convention: suffix ids with their type
  (`scoreEl`, `rerollBtn`, `Input`, `Ctn`, `El`).
- The **`hidden` attribute always beats inline styles** in the Perchance
  wrapper — use `el.hidden = true` to hide things.
- The wrapper applies **`body { text-align:center; }`** by default; override it
  explicitly in CSS if unwanted.
- `Math.random()` is the RNG that powers `selectOne`/`selectMany`/`{a|b}` —
  wrap it if you need seeded randomness.

### 3.4 Value-parsing footguns in main.pjs

Because pjs values are parsed, not just strings:

```pjs
hp = 10        // becomes the NUMBER 10 (typeof hp === 'number')
isBald = true  // becomes the BOOLEAN true — not the string "true"!
name = Bob     // stays a string
desc = [this.name] has [this.hp] HP   // evaluated lazily when read
```

Indentation is significant (children are nested under their parent). `^` sets
odds, `{a|b}` is alternation, `[ ]` is a JS block, `$output`/`$meta` are
special top-level lists. See §4 for the full syntax.

### 3.5 The truth about THIS project's files

`main.pjs` is deliberately tiny — it holds only platform config and imports:

```pjs
generateImage = {import:text-to-image-plugin}   // → root.generateImage
generateText = {import:ai-text-plugin}          // → root.generateText

$meta
  title = Mathema Chronicles
  description = ...
  tags = ...
```

That is the **entire** engine surface of this project. `index.html` currently
has **zero square blocks** — it is plain HTML/CSS + a few `<script>` tags.The only real platform calls happen at runtime, from the typed scene
controller:

- `root.generateImage(opts)` — the typed production app calls this through
  `app/services/perchance-runtime.ts`. Called with `{ prompt,
  resolution, negativePrompt, removeBackground }`; the result is an object
  whose `dataUrl` (or the result itself) is a data-URL string used as a
  three.js texture. The typed production path caches results in the `assets`
  table of the single Dexie database `mathema`.
- `root.generateText({ instruction })` — the typed scene controller calls the
  platform adapter/plugin. The result
  object exposes the text as `generatedText`, `text`, or is a string directly.
  It's used to write JRPG dialogue.

Everything else — three.js (esm.sh), Dexie (bundled from npm for the typed
production path), canvas, and CSS — is normal web tech that runs identically
anywhere. The legacy `js/`, `css/`, `scene-tests/` trees and their CDN
i18next/Dexie path were removed from the project in Fase 8 of the migration.

### 3.6 What a local agent must mock (with a working harness)

If you clone this project and open `index.html` locally, the platform globals
are missing, and the two `root.*` calls will throw. Because the scene modules
call the *global* `root` (bare `root.generateImage(...)`), you can provide it
with an ordinary script placed **before** the module `<script>` tags. A minimal
mock:

```html
<script>
  // mock-perchance.js — set up before the scene modules load
  window.root = {};

  // Deterministic fake image: a small solid-color PNG as a data URL.
  // (Return {dataUrl} — the scenes accept `result.dataUrl || result`.)
  window.root.generateImage = async (opts) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3ddc55';               // palette placeholder
    ctx.fillRect(0, 0, 64, 64);
    return { dataUrl: c.toDataURL('image/png') };
  };

  // Canned dialogue text. The code reads result.generatedText || result.text || result.
  window.root.generateText = async ({ instruction }) => {
    return { generatedText: 'The sanctuary dissolves into the void...' };
  };

  // kv is NOT used by this project; add only if you introduce it.
  // window.root.kv = { myFolder: { get: async () => null, set: async () => {}, ... } };
</script>
```

Include that in a **local-only copy** of `index.html` (or behind an
`if (!window.root)` guard) and the whole app boots locally: title menu,
settings (Dexie persistence is real), scene 1 and scene 2, dialogue flow —
everything except the actual AI generation and image assets.

### 3.7 What a local agent must NOT fake or test locally

- **pjs list semantics** — `selectOne` weighting, `^` odds, `{a|b}`, `$output`,
  `$meta` parsing. That's engine territory. Keep random-data lists and config in
  `main.pjs`; verify them on the platform preview, not with unit tests.
- **Plugin streaming behaviors** — e.g. assigning an un-awaited
  `root.generateText(...)` promise to `innerHTML` auto-streams on the platform.
- **The asset pipeline** — real `root.generateImage` output (pixel-art sprites
  with `removeBackground`). Your mock images are placeholders; art quality can
  only be judged on the platform.

So the sane division of labor: **local agent edits the app logic and layout,
runs it against mocks, and flags anything pjs/import-related for a platform
check.**

### 3.8 Conventions to follow when editing

- Keep application JS in `index.html` and `src/mathema/`; keep random-data lists
  and high-level config in `main.pjs`.
- If you add a top-level pjs list `x`, scripts read it as `window.x` (or
  `root.x` inside square blocks / pjs); the engine evaluates it lazily.
- If you add an `{import:...}` to `main.pjs`, the platform drops a read-only
  copy under `imports/<name>/`; to change behavior, vendor it (copy the code
  into your own `main.pjs`).
- Never put secrets in any of these files — everything ships publicly.
- Always show a loading indicator around `generateImage`/`generateText` calls
  (they can take up to a minute).
- Relative paths in `index.html` start at `src/mathema/...`; modules inside
  `src/mathema/` import each other relatively (`./dialogue.js`,
  `../scene1/dialogue.js`).

## 4. Perchance-js (pjs) — the list syntax

### 3.1 Lists are indented hierarchies

```
fruit
  apple
  banana
  orange
```

A top-level list is a name (`fruit`) followed by indented items. `fruit.selectOne`
returns a random item. Indentation uses **tabs** (or consistent spaces — the
engine treats deeper indentation as children).

### 3.2 Weighted items — `^`

```
mammal
  cat
  mouse^2          // 2× more likely than cat
  rabbit^[x]       // dynamic odds from JS (x is a variable)
  bird^[a === 3]   // only selectable if a === 3 (0 = impossible)
```

### 3.3 Nested lists and templates

An item can contain another list, and list items can contain `[JS]` blocks:

```
beastSentence
  The [beast] has a [beast.length < 6 ? "short" : "long"] name.

beast
  [animal][animal]     // e.g. "catbird"
  were-[animal]
```

`[animal]` picks a random item from the `animal` list. This **recursively
evaluates** the whole template.

### 3.4 Square-bracket blocks = JavaScript

Anywhere `[ ... ]` appears, the contents run as JS and the result is inserted.
This works in pjs items, in `index.html` text nodes, and in non-event
attributes.

Useful patterns:

```
// Set a variable and output nothing:
[a = 123, ""]The value is [a].

// Capture a selection and reuse it in two places:
sentence = I like [f = fruit.selectOne]. The reason I like [f] is that it's tasty.

// Output evaluated HTML:
$output = [this.joinItems("<br>")]
```

### 3.5 `{a|b|c}` alternation (shorthand for unweighted lists)

```
I once {ate|swallowed} {1|3|9} {apples|{carrots|bananas}}. It was {amazing|cool^3}.
```

Nestable, and each branch can carry its own `^odds`.

### 3.6 List objects and methods

Inside JS you get **list object** wrappers. Useful methods/properties:

| Method | What it does |
| --- | --- |
| `fruit.selectOne` | Pick one random item (a list object). |
| `fruit.selectMany(3)` | Pick 3 with replacement. |
| `fruit.selectUnique(2)` | Pick 2 without replacement. |
| `fruit.getLength` | Item count. |
| `fruit.selectAll` | Convert to an array of item objects. |
| `item.evaluateItem` | The evaluated string value of an item (recursively resolves `[blocks]`). |
| `list.items` | Direct access to the raw items. |

Example — iterating:

```
logFruit() =>
  for (let item of fruit.selectAll) {
    console.log("node:", item);
    console.log("raw:", item.evaluateItem);
  }
```

### 3.7 Ranges and arrays

```
d20 = {1-20}                      // picks 1..20 (weighted by how it's written: {1-20} = one of the integers)
snackArray = [["apple", "banana", "orange"]]   // literal JS array, outer [] is "this is JS", inner [] is the array
```

Note the comment: the **outer** brackets say "this is JS"; the inner brackets
are a real JS array literal.

### 3.8 Special top-level lists

- **`$output`** — if a generator has a top-level `$output`, then importing that
  generator gives you the `$output` value rather than its root list. Used for
  "give me the result of this generator" style imports.
- **`$meta`** — generator metadata:

```
$meta
  title = My Cool Thing
  description = This shows in search/listing.
  image = https://user.uploads.dev/file/....jpg
  tags = example, metadata, very cool
  header
    mode = minimal   // minimal header: small button in the corner instead of full header
```

- **`$meta.dynamic(inputs)`** — metadata that changes with query parameters
  (per-URL titles/descriptions/social images). Runs in an isolated server sandbox
  with limited APIs. (In this project you can look at how scene pages use it.)

### 3.9 Value parsing

- `name = Bob` → string.
- `hp = 10` → number (the engine parses values into numbers if
  `Number(String(n)) === n`).
- `isBald = true` → boolean (`true`/`false` are parsed as booleans — careful,
  this is a footgun: `"true"` in a list item becomes boolean `true`).
- `desc = [this.name] has [this.hp] HP` → evaluated at read time.

### 3.10 Function definitions in pjs

JavaScript functions in pjs use a different header and **no outer braces**:

```
foo(b) =>
  let a = 123;
  return a + 10;

async getText(prefix = "") =>
  let t = await fetch("https://example.com").then(r => r.text());
  return prefix + t.trim();
```

These become globals and are callable from `index.html` scripts, other pjs code,
and square blocks.

### 3.11 Escaping / literals

Perchance gives special meaning to `[ ]`, `{ }`, `^`, `$`. To emit them
literally, import the **literal-plugin** and use `[root.literal("...")]`, or
escape with backslashes where supported. This is important when generating text
that contains curly/square brackets (e.g. AI output).

---

## 5. Importing other generators & plugins

```pjs
animal = {import:animal}               // another generator's lists
generateText = {import:ai-text-plugin} // a plugin
```

- The import must be a top-level assignment in `main.pjs`.
- After import, access plugin functions through **`root`** in code:
  `await root.generateText(...)`. Keep only the bare top-level assignment
  (`generateText = {import:...}`) un-prefixed.
- To read any generator's source at runtime from *your app*:

```js
const res = await fetch(
  "https://perchance.org/api/getGeneratorsAndDependencies?generatorNames=animal,adjective"
).then(r => r.json());
// res.generators.animal.code / .imports ...
```

- The AI helper can also fetch any generator's source for study via its tools.

**Vendoring an import:** the `imports/` copies are read-only. To customize, copy
the relevant lists/code into your own `main.pjs` and remove the `{import:...}`.

---

## 6. HTML templating & DOM interop

### Square blocks in HTML

```html
<h1>Welcome, [playerName]</h1>
<div class="card" data-type="[type]">...</div>
```

Works in text and in **non-event** attributes. For `onclick`-style *event*
attributes, don't rely on template evaluation — use JS instead.

### Elements with ids are globals

An element `<div id="scoreEl"></div>` is directly addressable as `scoreEl` in
JS — no `getElementById`. Convention: suffix ids with their type
(`scoreEl`, `rerollBtn`, `input`, `Ctn`, `El`).

### The `hidden` attribute always wins

Perchance's engine gives the `hidden` attribute precedence over inline styles.
Use `myEl.hidden = true` to hide things — it's reliable.

### Default `body` styling

Perchance's wrapper applies `body { text-align:center; }`. If you don't want
centered text, override explicitly:

```html
<style>body { text-align:left; }</style>
```

### Execution order (critical gotcha)

1. The engine evaluates the **whole template** (every `[block]` in pjs and HTML,
   in order) **first**.
2. Only then do `index.html`'s `<script>` tags run, in order.
3. So a `[window.x = 123]` sitting *below* a `<script>` in the HTML still runs
   *before* that script — and a script's variables don't exist yet when square
   blocks evaluate.

If you need code to run before template evaluation, use `browser_refresh`'s
`preambleJs` (AI-helper only) or design your code so it doesn't depend on that
ordering. In practice: keep JS in `index.html` scripts and pass data in via
globals or DOM.

---

## 7. The engine's execution model

- Everything is lazily evaluated: `list.selectOne` resolves the item's template
  (including nested `[blocks]`, `{a|b}` alternatives, and imports) at call time.
- `evaluateItem` forces full evaluation of an item's template.
- `Math.random()` powers the built-in randomness. You can **wrap/replace**
  `Math.random()` to get seeded randomness for `selectOne`/`selectMany`, etc.
- `$output = [...]` at the top level of a generator is what an importer gets
  when they `{import:thatGenerator}` — the import *is* the `$output` value.

---

## 8. Built-in plugins

Add the import at the top of `main.pjs` (a top-level assignment — **not** in
`index.html`), then use via `root.<name>`.

### `generateText` — ai-text-plugin

```js
generateText = {import:ai-text-plugin}
```

```js
let poem = await root.generateText(`Write a poem about ${topic}`);
// Streaming:
await root.generateText({
  instruction: "Continue: " + storyEl.textContent,
  startWith: "Bob:",
  stopSequences: ["\n"],
  onChunk: (data) => { outEl.textContent += data.textChunk; },
});
```

- Generation can take up to a minute — **always show a loading indicator**.
- The returned promise streams automatically if assigned to `innerHTML`
  (`outEl.innerHTML = root.generateText("...")`), and has `.stop()`.
- **Vision:** `instruction` can be an array mixing text with ONE image `Blob`:
  `root.generateText({instruction: ["What's in this photo?", imageBlob]})`.
- For long visible output, use `onChunk` to stream so users read as it arrives.

### `generateImage` — text-to-image-plugin

```js
generateImage = {import:text-to-image-plugin}
```

```js
let result = await root.generateImage(`An anime drawing of ${topic}`);
img.src = result.dataUrl;
let big = await root.generateImage("cute cat", { resolution: "768x768" });
// valid: 512x512, 512x768, 768x512, 768x768
```

- Takes seconds — show a loading indicator; prefer larger resolutions and scale
  down with CSS.
- Un-awaited call rendered to HTML (`ctn.innerHTML = root.generateImage("...")`)
  shows a gallery tile with a save button; `root.generateImage({gallery:true})`
  embeds the public gallery (sort/filter/moderation).
- Other options: `negativePrompt`, `seed`, `guidanceScale`, `removeBackground`,
  `saveTitle`, `imageTags` (NSFW check).

### `kv` — kv-plugin (persistent storage)

```js
kv = {import:kv-plugin}
```

```js
await root.kv.myFolder.set("abc", 123);
let num = await root.kv.myFolder.get("abc");
await root.kv.myFolder.delete("abc");
await root.kv.characters.set("Bob", { name: "Bob", hp: 100, inventory: ["stick"] });
await root.kv.myFolder.setMany([["a", 1], ["b", 2]]);
let vals = await root.kv.myFolder.getMany(["a", "b"]);
let entries = await root.kv.myFolder.entries();
await root.kv.myFolder.update("abc", v => v + 1); // atomic transaction
```

IndexedDB-backed, per-user, survives reloads.

### `superFetch` — super-fetch-plugin (fetch without CORS)

```js
superFetch = {import:super-fetch-plugin}
let html = await root.superFetch(url).then(r => r.text());
```

For when the generator itself must read cross-origin pages/APIs at runtime.

### `uploadPlugin` — upload-plugin

```js
uploadPlugin = {import:upload-plugin}
let { url, size, error, deletionUrl } = await root.uploadPlugin(blobOrString, { expires: ... });
// errors: "over_daily_allowance" | "file_too_big" | "invalid_filetype"
```

- Editable public text files via `root.uploadPlugin.editable.set/get` (5 MiB
  limit; name them with long random lowercase-hyphen strings for privacy).
- Quota note: CREATE charges full size + 100KiB fee; UPDATE charges only growth.

### `commentsPlugin` — comments-plugin

```js
commentsPlugin = {import:comments-plugin}
commentsCtn.innerHTML = root.commentsPlugin({ channel: "general", width: "100%", height: "100%" });
```

Channels: lowercase alphanumeric + hyphens. Has moderation, onComment/onLoad
hooks, custom emojis, slash commands. **`comment.message` is UNSAFE HTML** —
escape before injecting.

### `secretPlugin` — secret-plugin (post-quantum public-key encryption)

```js
secretPlugin = {import:secret-plugin}
let keys = root.secretPlugin.generateKeyPair();   // {public, private}
let enc = root.secretPlugin.encrypt("Hello!", keys.public);
let dec = root.secretPlugin.decrypt(enc, keys.private);
```

### `createServerSocket` — server-plugin (realtime multiplayer)

```js
createServerSocket = {import:server-plugin}
let socket = root.createServerSocket();
```

- Put synchronous server handlers in the first
  `<script type="text/x-server-plugin">` element in `index.html`.
- The server executes authoritatively, but **the entire script is public
  source** — never put secrets (passwords, tokens, keys) in it.
- Supports pub/sub, durable `Uint8Array` state (50 MiB, no expiry), connection
  network groups, RPC. Native when saved; a local emulator while editing.

### Others worth knowing

- `literal-plugin` — escape special Perchance characters in text.
- `music-generation` skill — runtime music generation tooling for the AI helper
  (generates MP3s; wire them into the app via `upload_file` URLs + `new Audio`).
- `dynamic-metadata` skill — `$meta.dynamic` query-aware titles/descriptions.

> Note: some plugins ship full reference "skills" on the platform's AI helper.
> For this project, plugin usage examples live in the code under `src/`.

---

## 9. Working on the project locally

> **If you are a coding agent working outside the platform, read §3 first** —
> it explains the real nature of `main.pjs`/`index.html`, the load order, the
> platform globals, and includes a working mock harness for `root.generateImage`
> / `root.generateText` so you can run the whole app locally.

The download contains `main.pjs`, `index.html`, and `src/`. Here is what works
locally and what does not.

> **Note for this project (Mathema Chronicles):** everything below `src/` is
> nested one level deeper — the actual project lives in `src/mathema/`
> (app/build output, assets, README, this guide). `main.pjs` and
> `index.html` must stay at the root (Perchance requires them there), but they
> only *reference* `src/mathema/` via relative URLs like
> `<script src="src/mathema/build/mathema.js">`. So to download "the project",
> grab the single `src/mathema/` folder; the root files are just the two
> Perchance entry points.

### What runs locally without the platform

- `src/` is **plain web code** — scripts, modules, CSS, images, JSON. It runs in
  any browser/editor exactly as expected.
- `index.html` is mostly plain HTML + `<script src="src/...">` + `<style>`. It
  opens fine locally.
- All normal JS, three.js, canvas, i18next, Dexie, etc.

### What needs the Perchance engine

- **pjs list syntax** in `main.pjs` (`fruit.selectOne`, `{a|b}`, `^weights`,
  `[blocks]` inside pjs, `{import:...}`). This is parsed/executed by Perchance's
  engine, which only runs on the platform.
- **`[square blocks]` inside `index.html`** — the engine replaces them. Locally
  they'll just show literally as text.
- **Imported plugins** (`generateText`, `generateImage`, `kv`, etc.) — these are
  other generators loaded by the platform at runtime.

So: edit locally freely, but **test on the platform preview** (the live iframe
in the editor), because only there does the whole thing assemble.

### Recommended local workflow

1. Download the project (the download chip includes `main.pjs`, `index.html`,
   and `src/`).
2. Put it in a folder and open `src/mathema/` code with your editor.
3. Use the platform editor for any change to `main.pjs` (pjs/imports) or to
   `[block]` templating in `index.html`.
4. `src/mathema/*` edits can be iterated locally: run a tiny static server
   (`python3 -m http.server`) and open `index.html` **with the mock harness
   from §3.6 injected** (a local-only `<script>` defining `window.root` before
   the module tags) — the whole app then boots locally; only the AI-generated
   assets/text and pjs templating are stubbed. Full testing still happens on the
   platform.
5. If you restructure paths, keep relative references intact: `index.html`
   points at `src/mathema/...`, and modules inside `src/mathema/` import each
   other relatively (`./dialogue.js`, `../scene1/dialogue.js`).
6. Keep the AI helper's workspace in mind: `scratch/` is ephemeral; anything you
   want to keep must live in `src/` (or `main.pjs`/`index.html`).

### Runtime URLs

- Live app: `https://perchance.org/<generatorName>`
- The generator's iframe runs at
  `https://${window.generatorPublicId}.perchance.org/${window.generatorName}`.
- Built-in globals: `window.generatorName` and `window.generatorPublicId`
  (32-char hex).

---

## 10. Best practices & gotchas

### Async work

- `generateText`/`generateImage` can take up to a minute. **Always show a
  loading indicator** (spinner + text), and stream text via `onChunk` where
  sensible.
- If the generator builds its UI asynchronously after load (fetch, plugin init,
  three.js scene), don't query for dynamic elements at script top-level — poll,
  or attach a `MutationObserver`, or hook the app's own render.

### Performance & assets

- Pixel-art: use `THREE.NearestFilter` / `image-rendering: pixelated` for
  crispness (this project does this for its HD-2D sprites).
- Regenerating AI assets is expensive — **cache** them. The typed production
  path uses the `assets` table of the single Dexie database `mathema` plus a
  memory cache. Changing an asset's prompt requires renaming its key to bust
  the cache. The old `mathema_assets` database exists only as historical
  leftover from the removed legacy harness and is not read by the typed bundle.
- Storage quota: 100MB total, 5MB/file, 1000 files in `src/`. Big assets
  (audio, models) go through `upload_file` → embed the returned URL.
- Avoid hotlinking random js/images from GitHub etc. Upload or pin CDN versions
  (e.g. `https://esm.sh/three@0.170.0`).

### Layout

- Override `body { text-align:center; }` explicitly if unwanted.
- Use the `hidden` attribute instead of `display:none` where possible.
- Applications should generally respond to screen size / aspect ratio.

### Metadata

- Set `$meta.title/description/image/tags` for nice listings.
- If the app is WebGL/WebGPU-heavy, set a `$meta.image` (the platform's
  auto-screenshot may not capture WebGL) so the listing page looks right.

### Security

- Never put secrets (API keys, passwords, tokens) in public generator code
  (`main.pjs`, `index.html`, `src/`, or `text/x-server-plugin` scripts — all
  public). If you need an admin secret, hash it (e.g. SHA-256) and compare
  hashes server-side; never embed plaintext.
- Treat comment/user-supplied HTML as unsafe (`comment.message` needs escaping).

### Misc

- `Math.random()` is the built-in RNG — wrap it for seeded runs.
- Keep heavy data generation in pjs lists (Perchance syntax) and application
  logic in `index.html`/`src/` JS — that's the idiomatic split.

---

## 11. Quick reference card

```pjs
$meta
  title = My App
  description = ...
  image = https://...
  tags = a, b
  header
    mode = minimal

generateText = {import:ai-text-plugin}
generateImage = {import:text-to-image-plugin}
kv = {import:kv-plugin}

// weighted list
animal
  cat
  dog^2
  [custom]

// alternation
greeting = {hello|hi|hey}

// JS block + capture
name = [n = ["Ada", "Grace", "Alan"].selectOne, n]
msg = Greetings, [n]!

// function
double(x) =>
  return x * 2;

// $output = "give me the value, not the root list"
$output = [fruit.selectOne]
```

```html
<!-- index.html -->
<style>body { text-align: left; }</style>
<h1>[appTitle]</h1>
<div id="outCtn"></div>
<script>
  outCtn.innerHTML = root.generateText("Tell me a short joke.");
</script>
```

---

*Generated as part of the Mathema Chronicles project — a reference for anyone
(including future AI sessions) picking up this repo. For plugin details, load
the matching skill on the platform's AI helper, or read `imports/<plugin>/`.*
