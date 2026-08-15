import { describe, expect, it } from "vitest";

import { parseSceneManifest } from "../../src/scene/loader";
import type { SceneManifest } from "../../src/scene/types";

const validManifest = {
  schemaVersion: 1,
  id: "scene.open.plains",
  type: "C",
  backdrop: {
    assetKey: "backdrops/plains",
    description: "An open plain under a wide sky.",
  },
  effects: [],
  actors: [],
  camera: { mode: "fixed" },
} satisfies SceneManifest;

describe("parseSceneManifest", () => {
  it("parses a valid v1 manifest", () => {
    const manifest = parseSceneManifest(validManifest);

    expect(manifest.id).toBe("scene.open.plains");
    expect(manifest.type).toBe("C");
    expect(manifest.camera.mode).toBe("fixed");
  });

  it("rejects an unsupported schema version", () => {
    expect(() => parseSceneManifest({ ...validManifest, schemaVersion: 2 })).toThrow(
      /Invalid scene manifest/,
    );
  });

  it("rejects an unknown scene type", () => {
    expect(() => parseSceneManifest({ ...validManifest, type: "D" })).toThrow(
      /Invalid scene manifest/,
    );
  });

  it("rejects a missing backdrop description", () => {
    const { description: _description, ...withoutDescription } = validManifest.backdrop;

    expect(() =>
      parseSceneManifest({
        ...validManifest,
        backdrop: withoutDescription,
      }),
    ).toThrow(/backdrop\.description/);
  });
});
