import type { BootServices } from "../services/boot";

interface AppProps {
  services: BootServices;
}

export function App({ services }: AppProps) {
  return (
    <main className="app">
      <h1>VN-RPG</h1>
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
      <p className="muted">dev harness — services booted</p>
    </main>
  );
}
