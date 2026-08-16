import i18next from "i18next";

/**
 * i18n skeleton (narrative-spec §8.1-8.2, owner decisions this phase):
 * - the five most spoken languages are supported (en/zh/hi/es/ar),
 * - **English resources are authored now**; the rest fall back to English,
 * - detection is browser-language based with a manual override in Settings,
 * - the AI receives the detected/selected language via `currentLanguage` →
 *   `englishName` in the payload builder.
 */
export const SUPPORTED_LANGUAGES = ["en", "zh", "hi", "es", "ar"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  zh: "Chinese",
  hi: "Hindi",
  es: "Spanish",
  ar: "Arabic",
};

const en = {
  hud: {
    talkTo: "Talk to {{name}}",
    reRoll: "Re-roll sprite",
  },
  dialogue: {
    continue: "Continue",
    leave: "Leave",
    thinking: "{{name}} is thinking…",
    narrator: "Narrator",
  },
  title: {
    newGame: "New Game",
    loadGame: "Load Game",
    settings: "Settings",
    credits: "Credits",
    help: "Help",
    tagline: "VISUAL-NOVEL RPG",
  },
  wizard: {
    title: "New Game",
    stepName: "Your name",
    stepAppearance: "Appearance",
    stepBackground: "Background",
    stepReview: "Review",
    nameLabel: "What is your name?",
    namePlaceholder: "Type your name…",
    appearanceHint: "Choose an archetype — your sprite is generated from it.",
    generating: "Generating your sprite…",
    backgroundTemplate: "Choose a story",
    backgroundCustom: "Write your own",
    backgroundCustomPlaceholder: "Write your background story…",
    next: "Next",
    back: "Back",
    create: "Create",
    overwriteTitle: "Choose a slot to overwrite",
  },
  load: {
    title: "Load Game",
    empty: "No saves yet. Start a new game.",
    load: "Load",
    overwrite: "Overwrite",
    day: "Day {{day}}",
  },
  settings: {
    title: "Settings",
    language: "Language",
    accessibility: "Accessibility",
    display: "Display",
    audio: "Audio",
  },
  credits: {
    title: "Credits",
  },
  help: {
    title: "Help & Controls",
  },
  unsupported: {
    title: "Browser not supported",
    body: "Chronicles needs WebGL2, which your browser does not provide. Try an up-to-date version of Chrome, Edge, Firefox or Safari.",
  },
  common: {
    return: "Return",
  },
} as const;

type NestedKeys<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${NestedKeys<T[K]>}`
          : `${K}`
        : never;
    }[keyof T]
  : never;

export type TranslationKey = NestedKeys<typeof en>;

let initialized = false;

export interface I18nOptions {
  /** Explicit language (tests); otherwise the detector or fallback decides. */
  lng?: string;
  /** Use browser language detection (guarded for non-browser environments). */
  detection?: boolean;
}

/** Initializes i18next; safe to call multiple times (idempotent). */
export async function initI18n(options: I18nOptions = {}): Promise<void> {
  const detection = options.detection ?? typeof window !== "undefined";
  if (detection) {
    const { default: LanguageDetector } = await import("i18next-browser-languagedetector");
    i18next.use(LanguageDetector);
  }
  await i18next.init({
    lng: options.lng,
    fallbackLng: "en",
    supportedLngs: [...SUPPORTED_LANGUAGES, "cimode"],
    nonExplicitSupportedLngs: true,
    // Persist the manual Settings override in localStorage so the detected
    // browser language does not override the user's choice on reload.
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "chronicles.lang",
    },
    resources: { en: { translation: en } },
  });
  initialized = true;
}

/** Translation function over the initialized instance. */
export function t(key: string, opts?: Record<string, unknown>): string {
  return i18next.t(key, opts);
}

function normalizeLanguage(code: string | undefined): SupportedLanguage {
  const base = code?.toLowerCase().split("-")[0] ?? "";
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(base)) return base as SupportedLanguage;
  return "en";
}

/** The active language, normalized to the supported set (fallback en). */
export function currentLanguage(): SupportedLanguage {
  return normalizeLanguage(i18next.language);
}

export async function setLanguage(code: string): Promise<void> {
  const normalized = normalizeLanguage(code);
  await i18next.changeLanguage(normalized);
}

const KNOWN_ENGLISH_NAMES: Record<string, string> = {
  ...LANGUAGE_NAMES,
  pt: "Portuguese",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
  uk: "Ukrainian",
  sv: "Swedish",
};

/** English name of a language code, for the AI "Respond in {language}" directive. */
export function englishName(code: string): string {
  const base = code.toLowerCase().split("-")[0] ?? code;
  if (KNOWN_ENGLISH_NAMES[base]) return KNOWN_ENGLISH_NAMES[base]!;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(base) ?? code;
  } catch {
    return code;
  }
}

export { initialized };
