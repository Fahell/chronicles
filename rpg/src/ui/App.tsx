import type { Stage } from "../render/stage";
import type { BootServices } from "../services/boot";

interface AppProps {
  services: BootServices;
  stage: Stage;
}

export function App({ services, stage }: AppProps) {
  return (
    <main className="app">
      <h1>VN-RPG</h1>
      <p className="muted">
        stage {stage.width}×{stage.height} — type C scene
      </p>
      <dl className="status">
        <div>
          <dt>mode</dt>
          <dd>{services.mode}</dd>
        </div>
        <div>
          <dt>runtime</dt>
          <dd>{services.mocked ? "mock (local)" : "platform plugins"}</dd>
        </div>
        <div>
          <dt>cache db</dt>
          <dd>{services.mode === "dev" ? "rpg_dev" : "rpg"}</dd>
        </div>
      </dl>
    </main>
  );
}
