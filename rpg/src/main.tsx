import { render } from "preact";

import { App } from "./ui/App";
import "./style.css";

const mount = document.getElementById("app");

if (!mount) {
  throw new Error("Missing #app mount point — the dev harness page must contain one.");
}

render(<App />, mount);
