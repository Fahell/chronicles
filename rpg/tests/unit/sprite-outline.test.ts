import { describe, expect, it } from "vitest";

import { dilateAlpha, filterSmallComponents } from "../../src/scene/sprite-outline";

/** RGBA buffer of width×height from a compact spec: pixels are [r,g,b,a]. */
function buffer(pixels: number[][]): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}

function maskAt(mask: Uint8ClampedArray, x: number, y: number, width: number): number {
  return mask[y * width + x] ?? 0;
}

function solid(alpha: number, width: number, height: number): number[][] {
  return Array.from({ length: width * height }, () => [0, 0, 0, alpha]);
}

describe("dilateAlpha", () => {
  it("grows a single silhouette pixel by the radius in all directions", () => {
    // 5×5 with the center pixel opaque; radius 1 → a 3×3 block.
    const pixels = solid(0, 5, 5);
    pixels[2 * 5 + 2] = [0, 0, 0, 255];
    const mask = dilateAlpha(buffer(pixels), 5, 5, { radius: 1 });

    expect(maskAt(mask, 1, 1, 5)).toBe(1);
    expect(maskAt(mask, 2, 1, 5)).toBe(1);
    expect(maskAt(mask, 3, 1, 5)).toBe(1);
    expect(maskAt(mask, 0, 0, 5)).toBe(0); // corner stays outside the ring
    expect(maskAt(mask, 4, 4, 5)).toBe(0);
  });

  it("returns an empty mask for radius 0 (no outline)", () => {
    const pixels = solid(255, 3, 3);
    const mask = dilateAlpha(buffer(pixels), 3, 3, { radius: 0 });
    expect(Array.from(mask).every((v) => v === 0)).toBe(true);
  });

  it("returns an empty mask for a fully transparent sprite", () => {
    const pixels = solid(0, 3, 3);
    const mask = dilateAlpha(buffer(pixels), 3, 3);
    expect(Array.from(mask).every((v) => v === 0)).toBe(true);
  });

  it("ignores residual pixels below the alpha threshold", () => {
    // alpha 10 < default threshold 16 → not part of the silhouette.
    const pixels = solid(10, 3, 3);
    const mask = dilateAlpha(buffer(pixels), 3, 3);
    expect(Array.from(mask).every((v) => v === 0)).toBe(true);
  });

  it("drops detached specks before dilating (they must not become outline)", () => {
    // 7×7: a 2×2 blob on the left and a single speck 3 px away on the right.
    // With minComponentRatio 0.05 the speck is below the threshold and must
    // NOT produce any outline pixels (it is filtered before the dilation).
    const pixels = solid(0, 7, 7);
    pixels[1 * 7 + 1] = [0, 0, 0, 255];
    pixels[1 * 7 + 2] = [0, 0, 0, 255];
    pixels[2 * 7 + 1] = [0, 0, 0, 255];
    pixels[2 * 7 + 2] = [0, 0, 0, 255];
    pixels[4 * 7 + 5] = [0, 0, 0, 255]; // detached speck
    const mask = dilateAlpha(buffer(pixels), 7, 7, {
      radius: 1,
      minComponentRatio: 0.05, // minArea = max(1, 49*0.05) = 2 → speck (1px) dropped
    });

    // Blob outline exists around the 2×2 blob (grown by 1).
    expect(maskAt(mask, 0, 0, 7)).toBe(1);
    expect(maskAt(mask, 3, 3, 7)).toBe(1);
    // The speck region (x=4..6, y=3..5) must be entirely empty.
    for (let y = 3; y <= 5; ++y) {
      for (let x = 4; x <= 6; ++x) {
        expect(maskAt(mask, x, y, 7)).toBe(0);
      }
    }
  });

  it("filterSmallComponents drops detached components below minArea", () => {
    // 5×1: two opaque runs — [1,1,0,1,0] with minArea 2 → the single-pixel
    // run is dropped, the two-pixel run survives.
    const mask = new Uint8ClampedArray([1, 1, 0, 1, 0]);
    const filtered = filterSmallComponents(mask, 5, 1, 2);
    expect(Array.from(filtered)).toEqual([1, 1, 0, 0, 0]);
  });

  it("merges silhouettes that are within 2×radius of each other", () => {
    // Two opaque pixels 4 apart with radius 2 → their grown masks overlap.
    const pixels = solid(0, 9, 1);
    pixels[1] = [0, 0, 0, 255];
    pixels[6] = [0, 0, 0, 255];
    const mask = dilateAlpha(buffer(pixels), 9, 1, { radius: 2 });
    // Between the two pixels (x=3..4) the grown silhouettes connect.
    expect(maskAt(mask, 1, 0, 9)).toBe(1);
    expect(maskAt(mask, 3, 0, 9)).toBe(1);
    expect(maskAt(mask, 4, 0, 9)).toBe(1);
    expect(maskAt(mask, 6, 0, 9)).toBe(1);
  });
});
