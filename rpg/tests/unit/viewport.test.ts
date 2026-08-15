import { describe, expect, it } from "vitest";

import { contain } from "../../src/render/viewport";

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
