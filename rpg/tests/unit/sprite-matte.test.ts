import { describe, expect, it } from "vitest";

import { applyMatteCleanup } from "../../src/scene/sprite-matte";

/** Build a small RGBA buffer from rows of [r,g,b,a] quadruples. */
function buffer(rows: number[][] | number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(rows.flat(2));
}

function alphaAt(data: Uint8ClampedArray, i: number): number {
  return data[i * 4 + 3] ?? 0;
}

describe("applyMatteCleanup", () => {
  it("trims barely-transparent fringe pixels to fully transparent", () => {
    // 2×2: fully transparent, bright semi-transparent (kept), dim
    // semi-transparent below the 0.35 fringe (trimmed), fully opaque (kept).
    const src = buffer([
      [0, 0, 0, 0, 200, 200, 200, 128],
      [10, 10, 10, 64, 255, 255, 255, 255],
    ]);
    const out = applyMatteCleanup(src, 2, 2);
    expect(alphaAt(out, 0)).toBe(0); // already transparent
    expect(alphaAt(out, 1)).toBe(128); // bright, above fringe → kept
    expect(alphaAt(out, 2)).toBe(0); // dim 64/255 < 0.35 → trimmed
    expect(alphaAt(out, 3)).toBe(255); // opaque → kept
  });

  it("removes dark edge pixels adjacent to transparency when spillLuma is enabled", () => {
    // 1×3: transparent | near-black opaque | white opaque. The black-spill
    // pass is DISABLED by default since round 9 (white bg + baked shadow) —
    // this test pins the option for any future dark-background asset.
    const src = buffer([[0, 0, 0, 0, 5, 5, 5, 255, 250, 250, 250, 255]]);
    const out = applyMatteCleanup(src, 3, 1, { spillLuma: 24 });
    expect(alphaAt(out, 1)).toBe(0); // dark + touches transparency → spill
    expect(alphaAt(out, 2)).toBe(255); // bright → untouched
  });

  it("keeps dark pixels adjacent to transparency by default (baked ground shadow survives, round 9)", () => {
    // The baked shadow (Task 3) is dark content touching transparency after
    // white-background removal — the default cleanup must NOT eat it.
    const src = buffer([[10, 10, 10, 255, 0, 0, 0, 0]]);
    const out = applyMatteCleanup(src, 2, 1);
    expect(alphaAt(out, 0)).toBe(255); // shadow pixel kept
  });

  it("keeps dark pixels not touching transparency (black clothing)", () => {
    // 3×3 with a near-black pixel in the CENTER, surrounded by white — the
    // dark pixel touches no transparency and is not on the image border, so
    // it must survive (opaque black clothing is never removed).
    const white = [255, 255, 255, 255];
    const dark = [8, 8, 8, 255];
    const src = buffer([
      ...white,
      ...white,
      ...white,
      ...white,
      ...dark,
      ...white,
      ...white,
      ...white,
      ...white,
    ]);
    const out = applyMatteCleanup(src, 3, 3);
    expect(alphaAt(out, 4)).toBe(255);
  });

  it("does not cascade spill removal into dark clothing bands (spillLuma enabled)", () => {
    // 4×3: row 1 is transparent | dark | dark | white, rows 0/2 all white.
    // Only the outermost dark pixel touches transparency; the inner one is
    // not on the border and not adjacent to transparency → must survive.
    const white = [255, 255, 255, 255];
    const dark = [6, 6, 6, 255];
    const transparent = [0, 0, 0, 0];
    const src = buffer([
      ...white,
      ...white,
      ...white,
      ...white,
      ...transparent,
      ...dark,
      ...dark,
      ...white,
      ...white,
      ...white,
      ...white,
      ...white,
    ]);
    const out = applyMatteCleanup(src, 4, 3, { spillLuma: 24 });
    expect(alphaAt(out, 5)).toBe(0); // outer dark band (touches transparency) → spill
    expect(alphaAt(out, 6)).toBe(255); // inner dark band → kept (no cascade)
  });

  it("returns an independent copy (input buffer untouched)", () => {
    const src = buffer([[0, 0, 0, 64]]);
    const out = applyMatteCleanup(src, 1, 1);
    expect(alphaAt(src, 0)).toBe(64);
    expect(alphaAt(out, 0)).toBe(0);
  });
});
