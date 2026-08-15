import { render } from "preact";

import { openPlainsManifest } from "./scene/manifest/openPlains";
import { bootServices } from "./services/boot";
import { App } from "./ui/App";
import "./style.css";

// Accept both the canonical `#app` and the older `[data-rpg-app]` marker so
// panel-file edits on the platform can't break boot (root index.html is the
// source that gets pasted into the Perchance HTML panel).
const mount = document.getElementById("app") ?? document.querySelector("[data-rpg-app]");

if (!mount) {
  throw new Error('Missing mount point — the page must contain <div id="app">.');
}

const services = bootServices();

// The stage lives OUTSIDE the Preact mount: render() diffs the mount's subtree,
// and the three.js canvas must never be reconciled by Preact.
const stageContainer = document.createElement("div");
stageContainer.id = "stage-container";
stageContainer.className = "stage";
mount.parentElement?.insertBefore(stageContainer, mount);

// First scene generation can take ~50s on the platform (real plugin) — show a
// boot overlay so the screen is never silent during it.
const bootOverlay = document.createElement("div");
bootOverlay.id = "boot-loader";
bootOverlay.textContent = "Generating scene…";
mount.parentElement?.insertBefore(bootOverlay, mount);

const stage = await services.loadScene(openPlainsManifest, stageContainer, {
  width: window.innerWidth,
  height: window.innerHeight,
});
bootOverlay.remove();

function frame(prev: number) {
  const now = performance.now();
  stage.tick((now - prev) / 1000);
  requestAnimationFrame(() => frame(now));
}
requestAnimationFrame(() => frame(performance.now()));

const onResize = () => stage.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", onResize);

render(<App services={services} stage={stage} />, mount);
