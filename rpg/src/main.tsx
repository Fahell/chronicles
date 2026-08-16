import { render } from "preact";
import { enableInspectorFromUrl } from "./game/state/inspector";
import { navigate, screenSignal } from "./game/state/screens";
import { preloadBackgroundRemoval } from "./services/bg-removal";
import { bootServices } from "./services/boot";
import { initI18n } from "./services/i18n";
import { installProgressLogger } from "./services/progress";
import { webgl2Available } from "./services/webgl";
import { RemovalChip } from "./ui/RemovalChip";
import { CreditsScreen } from "./ui/screens/CreditsScreen";
import { GameScreen } from "./ui/screens/GameScreen";
import { HelpScreen } from "./ui/screens/HelpScreen";
import { LoadScreen } from "./ui/screens/LoadScreen";
import { NewGameWizard } from "./ui/screens/NewGameWizard";
import { SettingsScreen } from "./ui/screens/SettingsScreen";
import { TitleScreen } from "./ui/screens/TitleScreen";
import { UnsupportedScreen } from "./ui/screens/UnsupportedScreen";
import "./style.css";

// Accept both the canonical `#app` and the older `[data-rpg-app]` marker so
// panel-file edits on the platform can't break boot (root index.html is the
// source that gets pasted into the Perchance HTML panel).
async function main() {
  // Accept both the canonical `#app` and the older `[data-rpg-app]` marker so
  // panel-file edits on the platform can't break boot (root index.html is the
  // source that gets pasted into the Perchance HTML panel).
  const mount = document.getElementById("app") ?? document.querySelector("[data-rpg-app]");
  if (!mount) {
    throw new Error('Missing mount point — the page must contain <div id="app">.');
  }

  // Support gate (tech-spec §5.5): no WebGL2 → static unsupported screen,
  // nothing else boots.
  if (!webgl2Available()) {
    render(<UnsupportedScreen />, mount);
    return;
  }

  const services = bootServices();
  installProgressLogger();
  await initI18n({ detection: true });

  // Dev context inspector gating (tech-spec §6.4): enabled by `?inspector=1`
  // in dev AND prod builds (so the Perchance agent can turn it on during
  // runtime tests on the deployed build). Off by default.
  enableInspectorFromUrl();

  // Start the RMBG-1.4 model download at boot (prod only) so sprite removal
  // never blocks the UI; remove() awaits it if a sprite is generated first
  // (wait-queue semantics — vn-rpg-spec §4.1). Dev keeps the mock cut-outs.
  if (services.mode === "prod") {
    void preloadBackgroundRemoval();
  }

  // The stage lives OUTSIDE the Preact mount: render() diffs the mount's
  // subtree, and the three.js canvas must never be reconciled by Preact.
  const stageContainer = document.createElement("div");
  stageContainer.id = "stage-container";
  stageContainer.className = "stage";
  mount.parentElement?.insertBefore(stageContainer, mount);

  // The removal chip lives OUTSIDE the App mount (owner decision, round 6):
  // it must be live during boot, the wizard sprite generation, and in-game
  // re-rolls. Its CSS is position:fixed, so the wrapper stays invisible.
  const chipMount = document.createElement("div");
  chipMount.id = "removal-chip-root";
  document.body.appendChild(chipMount);
  render(<RemovalChip />, chipMount);

  // Screen router (vn-rpg-spec §8.1-8.3): title → wizard/load/settings/
  // credits/help → game (GameScreen loads the session scene lazily).
  function Root() {
    const screen = screenSignal.value;
    switch (screen) {
      case "wizard":
        return <NewGameWizard services={services} onBack={() => navigate("title")} />;
      case "load":
        return <LoadScreen services={services} onBack={() => navigate("title")} />;
      case "settings":
        return <SettingsScreen onBack={() => navigate("title")} />;
      case "credits":
        return <CreditsScreen onBack={() => navigate("title")} />;
      case "help":
        return <HelpScreen onBack={() => navigate("title")} />;
      case "game":
        return <GameScreen services={services} />;
      case "title":
      default:
        return <TitleScreen services={services} />;
    }
  }

  render(<Root />, mount);
}

void main();
