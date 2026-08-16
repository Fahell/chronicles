import { describe, expect, it } from "vitest";
import { webgl2Available } from "../../src/services/webgl";

describe("webgl2 gate", () => {
  it("returns false in node (no canvas)", () => {
    expect(webgl2Available()).toBe(false);
  });

  it("is tolerant of a throwing canvas context probe", () => {
    const original = globalThis.document;
    // Simulate a broken document where getContext throws (some embeds).
    (globalThis as Record<string, unknown>).document = {
      createElement: () => ({
        getContext: () => {
          throw new Error("webgl unavailable");
        },
      }),
    };
    try {
      expect(webgl2Available()).toBe(false);
    } finally {
      (globalThis as Record<string, unknown>).document = original;
    }
  });
});
