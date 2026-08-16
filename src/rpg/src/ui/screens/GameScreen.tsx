import { useEffect, useState } from "preact/hooks";

import { runNarratorOpening } from "../../game/narrator";
import { sessionSignal } from "../../game/session";
import { navigate } from "../../game/state/screens";
import type { Stage } from "../../render/stage";
import type { BootServices } from "../../services/boot";
import { App } from "../App";
import { LoadingScreen } from "../LoadingScreen";

interface GameScreenProps {
  services: BootServices;
}

/**
 * The in-game screen (entered from the wizard or the load screen with a
 * session active): loads the session's scene (LoadingScreen while it runs),
 * owns the rAF loop, then fires the narrator opening and renders the game UI.
 */
export function GameScreen({ services }: GameScreenProps) {
  const session = sessionSignal.value;
  const [stage, setStage] = useState<Stage | null>(null);

  useEffect(() => {
    if (!session) {
      navigate("title");
      return;
    }
    const container = document.getElementById("stage-container");
    if (!container) {
      navigate("title");
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        const next = await services.loadScene(session.buildManifest(), container, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
        if (disposed) {
          next.destroy();
          return;
        }
        setStage(next);
      } catch (error) {
        console.error("[rpg] scene load failed", error);
        if (!disposed) navigate("title");
      }
    })();
    return () => {
      disposed = true;
    };
  }, [services, session]);

  // rAF loop + resize once the stage exists (the app owns the render loop).
  useEffect(() => {
    if (!stage) return;
    let raf = 0;
    let prev = performance.now();
    const frame = (now: number) => {
      stage.tick((now - prev) / 1000);
      prev = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onResize = () => stage.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      stage.destroy();
    };
  }, [stage]);

  // Narrator opening once the stage is up (session is stable here).
  useEffect(() => {
    if (!stage || !session) return;
    void runNarratorOpening(services, session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  if (!stage) return <LoadingScreen />;
  return <App services={services} stage={stage} />;
}
