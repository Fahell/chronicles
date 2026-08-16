import { useState } from "preact/hooks";

import { ARCHETYPES, archetypeById } from "../../content/archetypes";
import { backgroundTemplateById, USER_BACKGROUND_TEMPLATES } from "../../content/backgrounds";
import { pickNpc } from "../../content/npcPool";
import { SPRITE_NEGATIVE_PROMPT } from "../../content/sprite";
import { buildIdentity, type Identity } from "../../game/identity";
import { ensurePortrait, PLAYER_PORTRAIT_KEY } from "../../game/portraits";
import type { SaveGame } from "../../game/save/types";
import { startSession } from "../../game/session";
import { navigate } from "../../game/state/screens";
import { resolveCharacterSprite } from "../../scene/assets";
import type { BootServices } from "../../services/boot";
import { t } from "../../services/i18n";

interface NewGameWizardProps {
  services: BootServices;
  onBack: () => void;
}

/** The identity wizard (vn-rpg-spec §8.1): name → appearance → background → review. */
export function NewGameWizard({ services, onBack }: NewGameWizardProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [archetypeId, setArchetypeId] = useState<string | null>(null);
  // Stable per-wizard seed — the scene actor reuses it for a cache hit.
  const [appearanceSeed] = useState(() => `wiz-${Math.random().toString(36).slice(2, 10)}`);
  const [spriteCutout, setSpriteCutout] = useState<string | null>(null);
  const [generatingSprite, setGeneratingSprite] = useState(false);
  const [bgKind, setBgKind] = useState<"template" | "custom">("template");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [overwriteChoices, setOverwriteChoices] = useState<SaveGame[] | null>(null);

  const archetype = archetypeId ? archetypeById(archetypeId) : undefined;

  async function selectArchetype(id: string) {
    setArchetypeId(id);
    const next = archetypeById(id);
    if (!next) return;
    setGeneratingSprite(true);
    try {
      const { sprite } = await resolveCharacterSprite(services.assets, {
        entity: "player",
        pose: "idle",
        prompt: next.spritePrompt,
        seed: `identity:${appearanceSeed}`,
        negativePrompt: SPRITE_NEGATIVE_PROMPT,
      });
      setSpriteCutout(sprite);
      // Bust portrait (round 10): async fire-and-forget — never blocks the
      // sprite wait; resolves into the portraits signal when ready.
      void ensurePortrait(services.assets, {
        entity: PLAYER_PORTRAIT_KEY,
        seed: `identity:${appearanceSeed}`,
        prompt: next.portraitPrompt,
      });
    } catch (error) {
      console.warn("[rpg] identity sprite generation failed", error);
      setSpriteCutout(null);
    } finally {
      setGeneratingSprite(false);
    }
  }

  function canContinue(): boolean {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return archetypeId !== null;
    if (step === 3) {
      return bgKind === "template" ? templateId !== null : customText.trim().length > 0;
    }
    return true;
  }

  function buildFinalIdentity(): Identity {
    const background =
      bgKind === "template"
        ? { kind: "template" as const, templateId: templateId ?? USER_BACKGROUND_TEMPLATES[0]!.id }
        : { kind: "custom" as const, text: customText };
    return {
      ...buildIdentity({ name, archetypeId: archetypeId!, appearanceSeed, background }),
      spriteCutout,
    };
  }

  async function finish(slotId: string, identity: Identity) {
    const npc = pickNpc();
    const save: SaveGame = {
      slotId,
      identity,
      scene: { sceneId: "scene.open.plains", npcId: npc.id, day: 1, period: "dusk" },
      progress: { talkedTo: [] },
      flags: {},
      updatedAt: Date.now(),
    };
    await services.saves.put(save);
    startSession(save);
    navigate("game");
  }

  async function createGame() {
    if (!archetypeId) return;
    const identity = buildFinalIdentity();
    const freeSlot = await services.saves.nextFreeSlot();
    if (!freeSlot) {
      // All manual slots full — the player picks which to overwrite.
      setOverwriteChoices(await services.saves.list());
      return;
    }
    await finish(freeSlot, identity);
  }

  async function overwrite(slotId: string) {
    const identity = buildFinalIdentity();
    await finish(slotId, identity);
  }

  const previewBackground =
    bgKind === "template"
      ? ((templateId ? backgroundTemplateById(templateId)?.ui : "") ?? "")
      : customText.trim();

  if (overwriteChoices) {
    return (
      <section className="wizard">
        <h2>{t("wizard.overwriteTitle")}</h2>
        <ul className="slot-grid">
          {overwriteChoices.map((save) => (
            <li key={save.slotId}>
              <button
                type="button"
                className="slot-card"
                onClick={() => void overwrite(save.slotId)}
              >
                <span className="slot-name">{save.identity.name}</span>
                <span className="slot-meta">
                  {t("load.day", { day: save.scene.day })} · {save.scene.period}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="wizard-back" onClick={() => setOverwriteChoices(null)}>
          {t("common.return")}
        </button>
      </section>
    );
  }

  return (
    <section className="wizard">
      <div className="wizard-head">
        <button
          type="button"
          className="wizard-back"
          onClick={step === 1 ? onBack : () => setStep(step - 1)}
        >
          {t("wizard.back")}
        </button>
        <h2>
          {t("wizard.title")} — {step}/4
        </h2>
      </div>

      {step === 1 && (
        <div className="wizard-step">
          <label className="wizard-label" htmlFor="wizard-name">
            {t("wizard.nameLabel")}
          </label>
          <input
            id="wizard-name"
            className="wizard-input"
            value={name}
            placeholder={t("wizard.namePlaceholder")}
            maxLength={24}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </div>
      )}

      {step === 2 && (
        <div className="wizard-step">
          <p className="wizard-hint">{t("wizard.appearanceHint")}</p>
          <div className="archetype-grid">
            {ARCHETYPES.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`archetype-card ${archetypeId === a.id ? "is-selected" : ""}`}
                onClick={() => void selectArchetype(a.id)}
              >
                <span className="archetype-label">{a.label}</span>
              </button>
            ))}
          </div>
          <div className="sprite-preview" aria-live="polite">
            {generatingSprite && <p>{t("wizard.generating")}</p>}
            {!generatingSprite && spriteCutout && (
              <img src={spriteCutout} alt={`${archetype?.label ?? ""} preview`} />
            )}
            {!generatingSprite && !spriteCutout && archetypeId && (
              <p className="muted">{t("wizard.generating")}</p>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-step">
          <p className="wizard-hint">{t("wizard.backgroundTemplate")}</p>
          <div className="template-list">
            {USER_BACKGROUND_TEMPLATES.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`template-card ${templateId === b.id && bgKind === "template" ? "is-selected" : ""}`}
                onClick={() => {
                  setBgKind("template");
                  setTemplateId(b.id);
                }}
              >
                <span className="template-label">{b.label}</span>
                <span className="template-preview">{b.ui.slice(0, 140)}…</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`custom-toggle ${bgKind === "custom" ? "is-selected" : ""}`}
            onClick={() => setBgKind("custom")}
          >
            {t("wizard.backgroundCustom")}
          </button>
          {bgKind === "custom" && (
            <textarea
              className="wizard-input wizard-textarea"
              value={customText}
              placeholder={t("wizard.backgroundCustomPlaceholder")}
              maxLength={1200}
              onInput={(e) => setCustomText((e.target as HTMLTextAreaElement).value)}
            />
          )}
        </div>
      )}

      {step === 4 && (
        <div className="wizard-step wizard-review">
          <p className="review-name">{name}</p>
          {spriteCutout && <img className="review-sprite" src={spriteCutout} alt={name} />}
          <p className="review-background">{previewBackground}</p>
        </div>
      )}

      <div className="wizard-nav">
        {step < 4 ? (
          <button
            type="button"
            className="wizard-next"
            disabled={!canContinue()}
            onClick={() => setStep(step + 1)}
          >
            {t("wizard.next")}
          </button>
        ) : (
          <button type="button" className="wizard-create" onClick={() => void createGame()}>
            {t("wizard.create")}
          </button>
        )}
      </div>
    </section>
  );
}
