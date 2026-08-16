import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bootProgress,
  installProgressLogger,
  removalQueue,
  setBootStage,
  setRemovalQueue,
} from "../../src/services/progress";

describe("progress store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    bootProgress.value = { stage: "scene-assets", label: "Generating scene assets…" };
    removalQueue.value = { done: 0, total: 0 };
  });

  it("starts on the scene-assets stage with an empty queue", () => {
    expect(bootProgress.value.stage).toBe("scene-assets");
    expect(removalQueue.value).toEqual({ done: 0, total: 0 });
  });

  it("setBootStage replaces the whole snapshot", () => {
    setBootStage("removal", "Removing background…");
    expect(bootProgress.value).toEqual({ stage: "removal", label: "Removing background…" });
  });

  it("setRemovalQueue tracks done/total", () => {
    setRemovalQueue(1, 2);
    expect(removalQueue.value).toEqual({ done: 1, total: 2 });
  });

  it("installProgressLogger emits structured [rpg] lines on transitions", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    installProgressLogger();

    setBootStage("removal", "Removing background…");
    expect(spy).toHaveBeenCalledWith("[rpg] boot: removing background…");

    setRemovalQueue(0, 2);
    setRemovalQueue(1, 2);
    setRemovalQueue(2, 2);
    expect(spy.mock.calls.some((c) => c[0] === "[rpg] bg-removal: queue 0/2")).toBe(true);
    expect(spy.mock.calls.some((c) => c[0] === "[rpg] bg-removal: queue drained (2 sprites)")).toBe(
      true,
    );
  });
});
