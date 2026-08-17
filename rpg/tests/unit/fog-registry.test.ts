import { describe, expect, it, vi } from "vitest";
import { createEffects } from "../../src/effects";
import { attachEffectCanvas, fogGeometry, fogParams } from "../../src/effects/fog";

describe("fog effect", () => {
  it("coerces fog params with defaults", () => {
    expect(fogParams({ params: { opacity: 0.3 } })).toEqual({
      color: 0x9fb4c8,
      opacity: 0.3,
      layers: 3,
      speed: 0.5,
    });
    expect(fogParams({ params: {} })).toMatchObject({
      color: 0x9fb4c8,
      opacity: 0.4,
      layers: 3,
      speed: 0.5,
    });
  });

  it("clamps extreme values", () => {
    expect(fogParams({ params: { opacity: 5, layers: 99, speed: -2 } })).toMatchObject({
      opacity: 1,
      layers: 6,
      speed: 0,
    });
    expect(fogParams({ params: { opacity: -1, layers: 0 } })).toMatchObject({
      opacity: 0,
      layers: 1,
    });
  });

  it("fogGeometry lays a contained low-lying fog: ground band + subtle horizon veil (round-10)", () => {
    const frame = { width: 768, height: 512 };
    const { band, veil } = fogGeometry(frame, fogParams({ params: {} }));
    // Band: anchored to the frame bottom, tall enough to reach the feet zone
    // (~65-70% down the frame), with contained alpha (~0.3 — visible, not a
    // full-frame whiteout).
    expect(band.height).toBeCloseTo(frame.height * 0.35);
    expect(band.alpha).toBeGreaterThan(0.2);
    expect(band.alpha).toBeLessThanOrEqual(0.4);
    // Veil: a thin line at the vertical center (the horizon — level camera),
    // far fainter than the band.
    expect(veil.centerY).toBe(0.5);
    expect(veil.height).toBeCloseTo(frame.height * 0.06);
    expect(veil.alpha).toBeLessThan(band.alpha);
    expect(veil.alpha).toBeGreaterThan(0);
  });

  it("fogGeometry scales the band/veil with opacity and clamps", () => {
    const frame = { width: 768, height: 512 };
    const subtle = fogGeometry(frame, fogParams({ params: { opacity: 0.1 } }));
    const heavy = fogGeometry(frame, fogParams({ params: { opacity: 1 } }));
    expect(subtle.band.alpha).toBeLessThan(heavy.band.alpha);
    expect(subtle.veil.alpha).toBeLessThan(heavy.veil.alpha);
    expect(heavy.band.alpha).toBeLessThanOrEqual(1);
  });

  it("unknown effect kinds are skipped, not fatal", async () => {
    // createEffects with unknown kinds never touches pixi — returns [] in node.
    const container = { appendChild: () => {} } as unknown as HTMLElement;
    const effects = await createEffects([{ kind: "nope", params: {} }], container, {
      width: 800,
      height: 600,
    });
    expect(effects).toEqual([]);
  });

  it("attachEffectCanvas appends the canvas to the container (round-9: fog rendered off-DOM)", () => {
    // Round-8 finding #12: createFogEffect styled app.canvas but never
    // appended it (pixi v8 does not auto-append) — the fog rendered to a
    // detached canvas. The append is the fix.
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const canvas = {} as HTMLCanvasElement;
    attachEffectCanvas(container, canvas);
    expect(container.appendChild).toHaveBeenCalledWith(canvas);
  });
});
