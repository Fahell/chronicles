import { describe, expect, it } from "vitest";

import { contain, sceneFrameViewport } from "../../src/render/viewport";

describe("viewport contain", () => {
  it("letterboxes a wide stage into a narrow viewport", () => {
    const result = contain(800, 600, 1600, 900);

    expect(result.scale).toBe(0.5);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(75);
  });

  it("pillarboxes a tall stage into a wide viewport", () => {
    const result = contain(800, 600, 900, 1600);

    expect(result.scale).toBeCloseTo(0.375);
    expect(result.offsetX).toBeCloseTo(231.25);
    expect(result.offsetY).toBe(0);
  });

  it("fills exactly when aspect ratios match", () => {
    const result = contain(800, 600, 800, 600);

    expect(result.scale).toBe(1);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
  });

  it("rejects non-positive content sizes", () => {
    expect(() => contain(800, 600, 0, 600)).toThrow(/positive/);
  });
});

describe("scene frame (3:2 letterbox)", () => {
  it("pillarboxes a 16:9 viewport into the 3:2 scene frame, centered", () => {
    const frame = sceneFrameViewport(1920, 1080);

    // 1080px tall frame → scale 1080/512; width = 768 * 2.109375 = 1620.
    expect(frame.width).toBeCloseTo(1620);
    expect(frame.height).toBeCloseTo(1080);
    expect(frame.offsetX).toBeCloseTo(150);
    expect(frame.offsetY).toBe(0);
  });

  it("letterboxes a portrait viewport, centered vertically", () => {
    const frame = sceneFrameViewport(600, 1080);

    expect(frame.width).toBe(600);
    expect(frame.height).toBe(400);
    expect(frame.offsetX).toBe(0);
    expect(frame.offsetY).toBeCloseTo(340);
  });

  it("fills exactly a 3:2 viewport with zero offsets", () => {
    const frame = sceneFrameViewport(768, 512);

    expect(frame.width).toBe(768);
    expect(frame.height).toBe(512);
    expect(frame.offsetX).toBe(0);
    expect(frame.offsetY).toBe(0);
  });
});
