import { useEffect, useRef, useState } from "preact/hooks";

import { navigate } from "../../game/state/screens";
import type { BootServices } from "../../services/boot";
import { t } from "../../services/i18n";

interface TitleScreenProps {
  services: BootServices;
}

interface MenuEntry {
  key: "newGame" | "loadGame" | "settings" | "credits" | "help";
  label: string;
  action: () => void;
}

const HAND_URL =
  "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/svgs/solid/hand-point-right.svg";

/** The title screen (vn-rpg-spec §8.1, look per the owner's reference POC). */
export function TitleScreen({ services }: TitleScreenProps) {
  const [hasSaves, setHasSaves] = useState(false);
  const [active, setActive] = useState(0);
  const itemsRef = useRef<HTMLButtonElement[]>([]);

  useEffect(() => {
    void services.saves.list().then((saves) => setHasSaves(saves.length > 0));
  }, [services]);

  const items: MenuEntry[] = [
    { key: "newGame", label: t("title.newGame"), action: () => navigate("wizard") },
    { key: "loadGame", label: t("title.loadGame"), action: () => navigate("load") },
    { key: "settings", label: t("title.settings"), action: () => navigate("settings") },
    { key: "credits", label: t("title.credits"), action: () => navigate("credits") },
    { key: "help", label: t("title.help"), action: () => navigate("help") },
  ];
  // Load is disabled when no save exists (vn-rpg-spec §8.1).
  const disabledAt = hasSaves ? -1 : 1;

  function move(delta: number) {
    setActive((prev) => {
      let next = prev;
      for (let step = 0; step < items.length; step++) {
        next = (next + delta + items.length) % items.length;
        if (next !== disabledAt) return next;
      }
      return prev;
    });
  }

  function activate(index: number) {
    const item = items[index];
    if (!item) return;
    if (index === disabledAt) return;
    item.action();
  }

  // Focus management: on mount and on selection change, focus the active item.
  useEffect(() => {
    itemsRef.current[active]?.focus();
  }, [active]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate(active);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hasSaves]);

  return (
    <main className="title-screen" aria-labelledby="game-title">
      <div className="atmosphere atmosphere-left" aria-hidden="true" />
      <div className="atmosphere atmosphere-bottom" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <section className="brand" aria-label="Game title">
        <h1 id="game-title">CHRONICLES</h1>
        <div className="brand-rule" aria-hidden="true" />
      </section>

      <nav className="main-menu" aria-label="Main menu">
        {items.map((item, index) => {
          const disabled = index === disabledAt;
          return (
            <button
              key={item.key}
              type="button"
              ref={(el) => {
                if (el) itemsRef.current[index] = el;
              }}
              className={`menu-item ${index === active ? "is-active" : ""} ${disabled ? "is-disabled" : ""}`}
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              onClick={() => activate(index)}
              onMouseEnter={() => !disabled && setActive(index)}
              onFocus={() => !disabled && setActive(index)}
            >
              <img className="menu-hand" src={HAND_URL} alt="" referrerPolicy="no-referrer" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <footer className="credits">
        <p>CHRONICLES — VISUAL NOVEL RPG</p>
        <p>Interface concept · Font Awesome hand pointer (CC BY 4.0)</p>
      </footer>
    </main>
  );
}
