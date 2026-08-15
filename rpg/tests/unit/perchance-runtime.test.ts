import { describe, expect, it, vi } from "vitest";

import { createPlatformRuntime, type PerchanceRoot } from "../../src/services/perchance-runtime";

function rootWith(overrides: Partial<PerchanceRoot> = {}): PerchanceRoot {
  return {
    generateImage: vi.fn(async () => ({ dataUrl: "data:image/png;base64,abc" })),
    generateText: vi.fn(async () => ({ generatedText: "hello" })),
    ...overrides,
  };
}

describe("createPlatformRuntime", () => {
  it("normalizes image result.dataUrl", async () => {
    const root = rootWith();
    const runtime = createPlatformRuntime(root, "dev");

    const result = await runtime.image.generate({ prompt: "p", seed: "s" });

    expect(result.dataUrl).toBe("data:image/png;base64,abc");
  });

  it("accepts an image result that is the data URL itself", async () => {
    const root = rootWith({
      generateImage: vi.fn(async () => "data:image/png;base64,xyz"),
    });
    const runtime = createPlatformRuntime(root, "dev");

    const result = await runtime.image.generate({ prompt: "p", seed: "s" });

    expect(result.dataUrl).toBe("data:image/png;base64,xyz");
  });

  it("throws when the image result has no dataUrl", async () => {
    const root = rootWith({
      generateImage: vi.fn(async () => ({}) as never),
    });
    const runtime = createPlatformRuntime(root, "dev");

    await expect(runtime.image.generate({ prompt: "p", seed: "s" })).rejects.toThrow(/no dataUrl/);
  });

  it("normalizes text across generatedText / text / string", async () => {
    const cases: Array<[Awaited<ReturnType<NonNullable<PerchanceRoot["generateText"]>>>, string]> =
      [
        [{ generatedText: "via generatedText" }, "via generatedText"],
        [{ text: "via text" }, "via text"],
        ["bare string", "bare string"],
      ];

    for (const [result, expected] of cases) {
      const root = rootWith({ generateText: vi.fn(async () => result) });
      const runtime = createPlatformRuntime(root, "dev");
      const { text } = await runtime.text.generate({ instruction: "instr" });
      expect(text).toBe(expected);
    }
  });

  it("throws when the text result is empty", async () => {
    const root = rootWith({ generateText: vi.fn(async () => ({}) as never) });
    const runtime = createPlatformRuntime(root, "dev");

    await expect(runtime.text.generate({ instruction: "instr" })).rejects.toThrow(/no text/);
  });

  it("passes removeBackground=false in dev mode", async () => {
    const generateImage = vi.fn(async () => ({ dataUrl: "data:image/png;base64,abc" }));
    const runtime = createPlatformRuntime(rootWith({ generateImage }), "dev");

    await runtime.image.generate({ prompt: "p", seed: "s" });

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ removeBackground: false }),
    );
  });

  it("passes removeBackground=true in prod mode", async () => {
    const generateImage = vi.fn(async () => ({ dataUrl: "data:image/png;base64,abc" }));
    const runtime = createPlatformRuntime(rootWith({ generateImage }), "prod");

    await runtime.image.generate({ prompt: "p", seed: "s" });

    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ removeBackground: true }));
  });

  it("throws when root.generateImage is missing", () => {
    const runtime = createPlatformRuntime({}, "prod");

    expect(runtime.image.generate({ prompt: "p", seed: "s" })).rejects.toThrow(
      /generateImage is not defined/,
    );
  });
});
