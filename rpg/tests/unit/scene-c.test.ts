import { describe, expect, it } from "vitest";

import { parseSceneManifest } from "../../src/scene/loader";
import { openPlainsManifest } from "../../src/scene/manifest/openPlains";
import type { SceneManifest } from "../../src/scene/types";

const openPlains: SceneManifest = {
  schemaVersion: 1,
  id: "scene.open.plains",
  type: "C",
  backdrop: {
    assetKey: "backdrops/plains",
    prompt: "Wide frontal background plate for an open fantasy scene…",
    description: "A vast open valley beneath a twilight sky.",
    depth: -10,
    height: 6.3,
    scale: 1,
  },
  floor: {
    assetKey: "floors/plains",
    prompt: "Pixel-art ground texture for an open fantasy landscape…",
    depth: -2.2,
    scale: 0.7,
  },
  effects: [],
  actors: [
    { characterId: "npc/elder", pose: "idle", position: { x: -2.2, z: -3.4 } },
    { characterId: "player", pose: "idle", position: { x: 0.1, z: -0.3 }, scale: 1 },
  ],
  camera: { mode: "fixed", fov: 52, height: 2, pitch: 2 },
};

describe("type C manifest (schema v1 extended)", () => {
  it("parses a full type-C manifest with optional placement fields", () => {
    const manifest = parseSceneManifest(openPlains);

    expect(manifest.type).toBe("C");
    expect(manifest.backdrop.depth).toBe(-10);
    expect(manifest.camera.fov).toBe(52);
    expect(manifest.actors[0]?.position).toEqual({ x: -2.2, z: -3.4 });
  });

  it("still accepts the minimal v1 manifest (backward compatible)", () => {
    const minimal = parseSceneManifest({
      schemaVersion: 1,
      id: "scene.a",
      type: "A",
      backdrop: { assetKey: "b", description: "d" },
      effects: [],
      actors: [],
      camera: { mode: "fixed" },
    });

    expect(minimal.type).toBe("A");
  });

  it("rejects an actor position without z", () => {
    expect(() =>
      parseSceneManifest({
        ...openPlains,
        actors: [{ characterId: "x", pose: "idle", position: { x: 1 } }],
      }),
    ).toThrow(/Invalid scene manifest/);
  });

  it("openPlainsManifest parses as a valid type-C manifest", () => {
    const parsed = parseSceneManifest(openPlainsManifest);
    expect(parsed.type).toBe("C");
    expect(parsed.floor?.assetKey).toBe("scenes/open-plains/floor");
  });
});
