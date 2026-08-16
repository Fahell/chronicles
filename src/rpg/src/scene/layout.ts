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
  // Seam-free ground↔backdrop junction (Perchance round 3 finding): in
  // perspective the rectangular floor becomes a trapezoid whose far edge is
  // narrower than the backdrop — exposing the backdrop's below-horizon band
  // as holes at the upper sides. Two invariants fix it:
  //   1. far edge reaches the backdrop plane:  depth + height*scale/2 == backdropDepth
  //      (here -2.35 + 22*0.7/2 = -10.05 — 0.05 behind the backdrop, so the
  //      backdrop occludes the overlap and no z-fighting occurs at the seam);
  //   2. far edge spans the backdrop's width: width*scale/2 >= backdropWidth/2
  //      (here 44*0.7/2 = 15.4 >= 15) — the below-horizon band is fully hidden.
  groundWidth: 44,
  groundHeight: 22,
  groundDepth: -2.35,
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
