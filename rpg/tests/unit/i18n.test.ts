import { describe, expect, it } from "vitest";
import { currentLanguage, englishName, initI18n, setLanguage, t } from "../../src/services/i18n";

describe("i18n", () => {
  it("initializes with English resources and interpolates", async () => {
    await initI18n({ lng: "en", detection: false });
    expect(t("hud.talkTo", { name: "Serran" })).toBe("Talk to Serran");
    expect(t("dialogue.continue")).toBe("Continue");
    expect(t("dialogue.thinking", { name: "Serran" })).toBe("Serran is thinking…");
  });

  it("missing keys fall back to the key itself", async () => {
    await initI18n({ lng: "en", detection: false });
    expect(t("missing.key")).toBe("missing.key");
  });

  it("currentLanguage normalizes unknown codes to en and known regional codes to the base", async () => {
    await initI18n({ lng: "pt-BR", detection: false });
    expect(currentLanguage()).toBe("en");
    await initI18n({ lng: "zh-CN", detection: false });
    expect(currentLanguage()).toBe("zh");
  });

  it("englishName maps language codes to English names for the AI directive", () => {
    expect(englishName("pt-BR")).toBe("Portuguese");
    expect(englishName("zh-CN")).toBe("Chinese");
    expect(englishName("es")).toBe("Spanish");
  });

  it("setLanguage switches the active language", async () => {
    await initI18n({ lng: "en", detection: false });
    await setLanguage("es");
    expect(currentLanguage()).toBe("es");
    await setLanguage("en");
  });
});
