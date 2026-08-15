import { render } from "preact";

import { bootServices } from "./services/boot";
import { App } from "./ui/App";
import "./style.css";

const mount = document.getElementById("app");

if (!mount) {
  throw new Error("Missing #app mount point — the dev harness page must contain one.");
}

const services = bootServices();

render(<App services={services} />, mount);
