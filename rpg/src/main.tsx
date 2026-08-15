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
