import { describe, expect, it } from "vitest";

import { computeSceneLayout } from "../../src/scene/layout";
import type { SceneManifest } from "../../src/scene/types";

const manifest: SceneManifest = {
  schemaVersion: 1,
  id: "scene.open.plains",
  type: "C",
  backdrop: { assetKey: "b", description: "d", depth: -10, height: 6.3, scale: 1 },
  floor: { assetKey: "f", depth: -2.2, scale: 0.7 },
  effects: [],
  actors: [{ characterId: "npc/elder", pose: "idle", position: { x: -2.2, z: -3.4 } }],
  camera: { mode: "fixed", fov: 52, height: 2, pitch: 2 },
};

describe("computeSceneLayout", () => {
  it("applies the approved POC defaults", () => {
    const layout = computeSceneLayout(manifest);

    expect(layout.camera.position).toEqual({ x: 0, y: 2, z: 9 });
    expect(layout.camera.lookAt).toEqual({ x: 0, y: 2, z: -6 });
    expect(layout.camera.fov).toBe(52);
    expect(layout.ground.position).toEqual({ x: 0, y: 0, z: -2.2 });
    expect(layout.ground.scale).toBe(0.7);
    expect(layout.backdrop.position).toEqual({ x: 0, y: 6.3, z: -10 });
  });

  it("derives actor y from scale (center of a 2.1-unit-tall sprite)", () => {
    const layout = computeSceneLayout(manifest);
    expect(layout.actors[0]?.position).toEqual({ x: -2.2, y: 1.05, z: -3.4 });
  });

  it("falls back to defaults when camera fields are absent", () => {
    const minimal: SceneManifest = {
      schemaVersion: 1,
      id: "s",
      type: "C",
      backdrop: { assetKey: "b", description: "d" },
      effects: [],
      actors: [],
      camera: { mode: "fixed" },
    };
    const layout = computeSceneLayout(minimal);

    expect(layout.camera.fov).toBe(52);
    expect(layout.camera.position.y).toBe(2);
    expect(layout.backdrop.position.z).toBe(-10);
  });

  it("scales actor y with scale", () => {
    const scaled: SceneManifest = {
      ...manifest,
      actors: [{ characterId: "a", pose: "idle", position: { x: 1, z: 1 }, scale: 2 }],
    };
    const layout = computeSceneLayout(scaled);
    expect(layout.actors[0]?.position.y).toBe(2.1);
  });
});
