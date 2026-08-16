import { describe, expect, it } from "vitest";
import { buildIdentity, compactPayload, PAYLOAD_BACKGROUND_LIMIT, summarizeAppearance } from "../../src/game/identity";

describe("identity", () => {
  it("builds an identity with a compact payload version of a custom background", () => {
    const long = "A long backstory with lots of fluff that goes on and on about the village and the river and the war. ";
    const id = buildIdentity({
      name: "Arin",
      archetypeId: "traveler",
      background: { kind: "custom", text: long.repeat(40) },
    });
    expect(id.name).toBe("Arin");
    expect(id.appearanceSeed).toBeTruthy();
    expect(id.backgroundPayload.length).toBeLessThanOrEqual(PAYLOAD_BACKGROUND_LIMIT);
    expect(id.backgroundUi).toContain("village");
    expect(id.backgroundUi.length).toBeGreaterThan(id.backgroundPayload.length);
  });

  it("uses the template payload/UI versions when a template is selected", () => {
    const id = buildIdentity({ name: "Lia", archetypeId: "mage", background: { kind: "template", templateId: "bt1" } });
    expect(id.backgroundPayload).toBeTruthy();
    expect(id.backgroundUi).toBeTruthy();
    expect(id.background.kind).toBe("template");
    expect(id.backgroundPayload.length).toBeLessThanOrEqual(PAYLOAD_BACKGROUND_LIMIT);
  });

  it("rejects an unknown template id", () => {
    expect(() => buildIdentity({ name: "X", archetypeId: "knight", background: { kind: "template", templateId: "nope" } })).toThrow();
  });

  it("compactPayload normalizes whitespace and hard-truncates over the limit", () => {
    expect(compactPayload("  hello   world  ")).toBe("hello world");
    const long = "x".repeat(PAYLOAD_BACKGROUND_LIMIT + 50);
    expect(compactPayload(long).length).toBeLessThanOrEqual(PAYLOAD_BACKGROUND_LIMIT);
  });

  it("summarizeAppearance falls back for unknown archetypes", () => {
    const id = buildIdentity({ name: "Z", archetypeId: "knight", background: { kind: "template", templateId: "bt1" } });
    expect(summarizeAppearance(id)).toContain("knight");
    const unknown = buildIdentity({ name: "Z", archetypeId: "ghost", background: { kind: "template", templateId: "bt1" } });
    expect(summarizeAppearance(unknown)).toBe("a traveler");
  });
});
