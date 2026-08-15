import { render } from "preact";

import { openPlainsManifest } from "./scene/manifest/openPlains";
import { bootServices } from "./services/boot";
import { App } from "./ui/App";
import "./style.css";

const mount = document.getElementById("app");

if (!mount) {
  throw new Error("Missing #app mount point — the dev harness page must contain one.");
}

const services = bootServices();

// The stage lives OUTSIDE the Preact mount: render() diffs the mount's subtree,
// and the three.js canvas must never be reconciled by Preact.
const stageContainer = document.createElement("div");
stageContainer.id = "stage-container";
stageContainer.className = "stage";
mount.parentElement?.insertBefore(stageContainer, mount);

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
