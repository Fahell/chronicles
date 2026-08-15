import { describe, expect, it, vi } from "vitest";

import { createMockHarness } from "../../src/services/mock";
import { defaultTextScript } from "../../src/services/mock/script";

describe("mock harness", () => {
  it("returns a deterministic placeholder for the same prompt", async () => {
    const { root } = createMockHarness();

    const a = await root.generateImage?.({ prompt: "same prompt" });
    const b = await root.generateImage?.({ prompt: "same prompt" });

    expect(a).toEqual(b);
    expect(typeof a).toBe("object");
    expect((a as { dataUrl?: string }).dataUrl).toMatch(/^data:image\//);
  });

  it("returns different placeholders for different prompts", async () => {
    const { root } = createMockHarness();

    const a = await root.generateImage?.({ prompt: "prompt one" });
    const b = await root.generateImage?.({ prompt: "prompt two" });

    expect(a).not.toEqual(b);
  });

  it("serves scripted text and the default reply", async () => {
    const { root } = createMockHarness();

    const greeted = await root.generateText?.({ instruction: "Say hello to the innkeeper" });
    const other = await root.generateText?.({ instruction: "describe the sky" });

    expect(greeted).toMatchObject({
      generatedText: "Welcome, traveler. Not many come this way anymore.",
    });
    expect(other).toMatchObject({
      generatedText: "The wind carries the distant sound of the river.",
    });
  });

  it("emits a choice-format payload when the instruction asks for options", async () => {
    const { root } = createMockHarness();

    const result = await root.generateText?.({
      instruction: "give me choices for this dialogue",
    });

    const text = (result as { generatedText?: string }).generatedText ?? "";
    expect(text).toContain("[choices]");
    expect(text).toMatch(/1\. /);
  });

  it("records every call with sizes in the control log", async () => {
    const { root, control } = createMockHarness();

    await root.generateImage?.({ prompt: "a scene" });
    await root.generateText?.({ instruction: "a line of dialogue" });

    expect(control.calls).toHaveLength(2);
    expect(control.calls[0]).toMatchObject({ kind: "image", input: "a scene", chars: 7 });
    expect(control.calls[1]).toMatchObject({ kind: "text", chars: 18 });
    expect(control.calls[1]?.resultChars).toBeGreaterThan(0);
  });

  it("injects one-shot image and text failures", async () => {
    const { root, control } = createMockHarness();
    control.failNextImage();
    control.failNextText();

    await expect(root.generateImage?.({ prompt: "p" })).rejects.toThrow(/injected failure/);
    await expect(root.generateText?.({ instruction: "i" })).rejects.toThrow(/injected failure/);

    // One-shot: the next calls succeed.
    await expect(root.generateImage?.({ prompt: "p" })).resolves.toBeTruthy();
    await expect(root.generateText?.({ instruction: "i" })).resolves.toBeTruthy();
  });

  it("honors configurable latency", async () => {
    vi.useFakeTimers();
    try {
      const { root, control } = createMockHarness({ latencyMs: 100 });
      control.clearCalls();

      const pending = root.generateText?.({ instruction: "i" });
      await vi.advanceTimersByTimeAsync(50);
      expect(control.calls).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(60);
      expect(control.calls).toHaveLength(1);
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports overriding the script at runtime", async () => {
    const { root, control } = createMockHarness();
    control.setScript({
      ...defaultTextScript,
      defaultReply: "custom default",
    });

    const result = await root.generateText?.({ instruction: "anything at all" });

    expect(result).toMatchObject({ generatedText: "custom default" });
  });
});
