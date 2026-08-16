import { render } from "preact";

import { openPlainsManifest } from "./scene/manifest/openPlains";
import { preloadBackgroundRemoval } from "./services/bg-removal";
import { bootServices } from "./services/boot";
import { installProgressLogger } from "./services/progress";
import { App } from "./ui/App";
import { LoadingScreen } from "./ui/LoadingScreen";
import { RemovalChip } from "./ui/RemovalChip";
import "./style.css";

// Accept both the canonical `#app` and the older `[data-rpg-app]` marker so
// panel-file edits on the platform can't break boot (root index.html is the
// source that gets pasted into the Perchance HTML panel).
const mount = document.getElementById("app") ?? document.querySelector("[data-rpg-app]");

if (!mount) {
  throw new Error('Missing mount point — the page must contain <div id="app">.');
}

const services = bootServices();
installProgressLogger();

// Start the RMBG-1.4 model download at boot (prod only) so sprite removal
// never blocks the UI; remove() awaits it if a sprite is generated first
// (wait-queue semantics — vn-rpg-spec §4.1). Dev keeps the mock cut-outs.
if (services.mode === "prod") {
  void preloadBackgroundRemoval();
}

// The stage lives OUTSIDE the Preact mount: render() diffs the mount's subtree,
// and the three.js canvas must never be reconciled by Preact.
const stageContainer = document.createElement("div");
stageContainer.id = "stage-container";
stageContainer.className = "stage";
mount.parentElement?.insertBefore(stageContainer, mount);

// Animated boot loading screen — live stage updates come from the progress
// store (the main thread is free because inference runs in the proxy worker).
render(<LoadingScreen />, mount);

// The removal chip lives OUTSIDE the App mount (owner decision, round 6): App
// mounts only after the scene loads, but removal runs DURING boot — the chip
// must be live while the loading screen is up (and stays ready for future
// in-game re-rolls). Its CSS is position:fixed, so the wrapper stays invisible.
const chipMount = document.createElement("div");
chipMount.id = "removal-chip-root";
document.body.appendChild(chipMount);
render(<RemovalChip />, chipMount);

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

const onResize = () => stage.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", onResize);

render(<App services={services} stage={stage} />, mount);
