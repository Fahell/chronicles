import { t } from "../../services/i18n";

/** Shown when WebGL2 is unavailable (tech-spec §5.5) — no game logic. */
export function UnsupportedScreen() {
  return (
    <main className="unsupported" role="alert">
      <h1>{t("unsupported.title")}</h1>
      <p>{t("unsupported.body")}</p>
    </main>
  );
}
