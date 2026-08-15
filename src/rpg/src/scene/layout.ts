import type { SceneManifest } from "./types";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlanePlacement {
  width: number;
  height: number;
  position: Vec3;
  scale: number;
}

export interface ActorPlacement {
  characterId: string;
  pose: string;
  position: Vec3;
  scale: number;
}

export interface SceneLayout {
  camera: { position: Vec3; lookAt: Vec3; fov: number };
  ground: PlanePlacement;
  backdrop: PlanePlacement;
  actors: ActorPlacement[];
}

/** Approved POC preferred configuration (templates/open-scene-poc README). */
export const DEFAULT_SCENE_CONFIG = {
  cameraHeight: 2,
  cameraPitch: 2,
  cameraZ: 9,
  lookAtY: 2,
  lookAtZ: -6,
  fov: 52,
  groundWidth: 24,
  groundHeight: 22,
  groundDepth: -2.2,
  groundScale: 0.7,
  backdropWidth: 30,
  backdropHeight: 20,
  backdropDepth: -10,
  backdropHeightY: 6.3,
  backdropScale: 1,
  /** Sprite plane height in world units at scale 1 (POC). */
  actorHeight: 2.1,
} as const;

/** Pure scene layout derived from the manifest — no three.js involved. */
export function computeSceneLayout(manifest: SceneManifest): SceneLayout {
  const c = DEFAULT_SCENE_CONFIG;
  const fov = manifest.camera.fov ?? c.fov;
  const camY = manifest.camera.height ?? c.cameraHeight;
  const pitch = manifest.camera.pitch ?? c.cameraPitch;

  const backdropScale = manifest.backdrop.scale ?? c.backdropScale;
  const groundScale = manifest.floor?.scale ?? c.groundScale;
  const groundDepth = manifest.floor?.depth ?? c.groundDepth;

  const actors: ActorPlacement[] = manifest.actors.map((a) => {
    const scale = a.scale ?? 1;
    return {
      characterId: a.characterId,
      pose: a.pose,
      position: { x: a.position.x, y: (c.actorHeight * scale) / 2, z: a.position.z },
      scale,
    };
  });

  return {
    camera: {
      position: { x: 0, y: camY, z: c.cameraZ },
      lookAt: { x: 0, y: pitch, z: c.lookAtZ },
      fov,
    },
    ground: {
      width: c.groundWidth,
      height: c.groundHeight,
      position: { x: 0, y: 0, z: groundDepth },
      scale: groundScale,
    },
    backdrop: {
      width: c.backdropWidth,
      height: c.backdropHeight,
      position: {
        x: 0,
        y: manifest.backdrop.height ?? c.backdropHeightY,
        z: manifest.backdrop.depth ?? c.backdropDepth,
      },
      scale: backdropScale,
    },
    actors,
  };
}
