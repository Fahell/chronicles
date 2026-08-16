import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bootProgress,
  installProgressLogger,
  modelDownload,
  removalQueue,
  setBootStage,
  setModelDownload,
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

describe("model download signal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    modelDownload.value = { status: "idle" };
  });

  it("starts idle", () => {
    expect(modelDownload.value).toEqual({ status: "idle" });
  });

  it("setModelDownload replaces the snapshot (status + pct + file)", () => {
    setModelDownload({ status: "downloading", pct: 42, file: "model_q8.onnx" });
    expect(modelDownload.value).toEqual({
      status: "downloading",
      pct: 42,
      file: "model_q8.onnx",
    });
  });

  it("logs transition-only [rpg] lines (no per-progress spam)", () => {
    setModelDownload({ status: "idle" }); // reset the logger's internal state
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    installProgressLogger();

    setModelDownload({ status: "downloading", pct: 10 });
    setModelDownload({ status: "downloading", pct: 60 });
    setModelDownload({ status: "downloading", pct: 99 });
    setModelDownload({ status: "ready" });

    const lines = spy.mock.calls.map((c) => String(c[0]));
    // Transition lines fire at least once (effects from earlier tests in this
    // file may also observe the signal — installProgressLogger is boot-once).
    expect(lines.filter((l) => l.includes("model downloading")).length).toBeGreaterThanOrEqual(1);
    expect(
      lines.filter((l) => l.includes("model download complete")).length,
    ).toBeGreaterThanOrEqual(1);
    // The percentage is UI-only — never spammed into the console.
    expect(lines.filter((l) => l.includes("42%")).length).toBe(0);
  });
});
