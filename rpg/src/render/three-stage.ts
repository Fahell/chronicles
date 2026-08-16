import type { Mesh, MeshBasicMaterial } from "three";
import type { SceneTextures } from "../scene/assets";
import type { ActorPlacement, SceneLayout } from "../scene/layout";
import type { Stage } from "./stage";
import { SCENE_FRAME, sceneFrameViewport } from "./viewport";

/**
 * Sprite plane aspect must match the generated portrait texture (512×768 =
 * 2:3, guide §7 valid resolutions). Height `actorHeight` world units at
 * scale 1; width derived so the 2:3 texture maps 1:1 (no stretching).
 */
const SPRITE_ASPECT = 2 / 3;
const SPRITE_HEIGHT = 2.1;

function actorCanvas(label: string, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 300;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgba(7, 19, 33, 0.3)";
  ctx.fillRect(15, 15, 150, 270);
  ctx.fillStyle = "#f4dfbd";
  ctx.fillRect(68, 42, 44, 44);
  ctx.fillStyle = color;
  ctx.fillRect(52, 92, 76, 104);
  ctx.fillStyle = "#1b2636";
  ctx.fillRect(56, 196, 27, 62);
  ctx.fillRect(97, 196, 27, 62);
  ctx.fillStyle = "#f3ce76";
  ctx.fillRect(50, 266, 34, 10);
  ctx.fillRect(96, 266, 34, 10);
  ctx.font = "bold 16px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, 90, 22);
  return canvas;
}

/**
 * three.js implementation of the Stage for type-C scenes (tech-spec §2.1).
 * Loads three.js lazily via dynamic import — the initial bundle never pays
 * for the 3D renderer. The app drives the loop by calling tick(dt).
 *
 * The stage renders into a centered 3:2 scene frame (letterbox/pillarbox)
 * sized by `sceneFrameViewport` — the generated art maps 1:1 without
 * stretching; the area outside the frame shows the container background.
 */
export async function createThreeStage(
  layout: SceneLayout,
  container: HTMLElement,
): Promise<Stage> {
  const THREE = await import("three");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1c2e");

  const camera = new THREE.PerspectiveCamera(
    layout.camera.fov,
    SCENE_FRAME.width / SCENE_FRAME.height,
    0.1,
    100,
  );
  camera.position.set(layout.camera.position.x, layout.camera.position.y, layout.camera.position.z);
  camera.lookAt(layout.camera.lookAt.x, layout.camera.lookAt.y, layout.camera.lookAt.z);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.position = "absolute";
  container.appendChild(canvas);

  const ambient = new THREE.AmbientLight(0xffffff, 1);
  const directional = new THREE.DirectionalLight(0xffe3a0, 0.35);
  directional.position.set(-4, 8, 4);
  scene.add(ambient, directional);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.ground.width, layout.ground.height),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.scale.setScalar(layout.ground.scale);
  ground.position.set(layout.ground.position.x, layout.ground.position.y, layout.ground.position.z);
  scene.add(ground);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.backdrop.width, layout.backdrop.height),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  backdrop.scale.setScalar(layout.backdrop.scale);
  backdrop.position.set(
    layout.backdrop.position.x,
    layout.backdrop.position.y,
    layout.backdrop.position.z,
  );
  scene.add(backdrop);

  const actorMeshes = new Map<string, { sprite: Mesh; shadow: Mesh }>();

  const loader = new THREE.TextureLoader();
  const size = { width: 0, height: 0 };

  /**
   * On-demand rendering (owner: CPU burn in the harness). The scene is static
   * in this slice — the renderer must NOT re-rasterize every rAF frame.
   * `dirty` is set by every mutating call (texture applied, actors set,
   * speaker changed, resize); tick() renders only when something changed and
   * then clears the flag. Idle scene → ~0% CPU instead of 60fps re-render.
   */
  let dirty = true;
  const markDirty = () => {
    dirty = true;
  };

  function applyTexture(mesh: Mesh, dataUrl: string) {
    loader.load(dataUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.LinearMipMapLinearFilter;
      (mesh.material as MeshBasicMaterial).map = texture;
      (mesh.material as MeshBasicMaterial).needsUpdate = true;
      markDirty();
    });
  }

  return {
    get width() {
      return size.width;
    },
    get height() {
      return size.height;
    },
    mount: () => {},
    setTextures(textures: SceneTextures) {
      applyTexture(backdrop, textures.backdrop);
      applyTexture(ground, textures.floor);
      markDirty();
    },
    setActors(actors: ActorPlacement[], textures?: Record<string, string>) {
      for (const actor of actorMeshes.values()) {
        scene.remove(actor.sprite, actor.shadow);
      }
      actorMeshes.clear();

      for (const actor of actors) {
        const spriteWidth = SPRITE_HEIGHT * SPRITE_ASPECT * actor.scale;
        const spriteHeight = SPRITE_HEIGHT * actor.scale;

        // Placeholder until a real generated texture resolves (or in dev).
        const fallback = actorCanvas(
          actor.characterId.split("/").pop() ?? actor.characterId,
          "#8dd8d0",
        );
        const texture = new THREE.CanvasTexture(fallback);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        // alphaTest discards residual semi-transparent fringe (background
        // removal remnants) instead of blending them dark against the scene;
        // depthWrite off is the standard billboard setting (no self-occlusion).
        const sprite = new THREE.Mesh(
          new THREE.PlaneGeometry(spriteWidth, spriteHeight),
          new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            alphaTest: 0.35,
            depthWrite: false,
          }),
        );
        sprite.position.set(actor.position.x, actor.position.y, actor.position.z);

        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.42 * actor.scale, 24),
          new THREE.MeshBasicMaterial({ color: 0x071321, transparent: true, opacity: 0.28 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(actor.position.x, 0.03, actor.position.z);

        scene.add(sprite, shadow);
        actorMeshes.set(actor.characterId, { sprite, shadow });

        // Real generated portrait (512×768) replaces the placeholder when it
        // arrives — async, so the scene mounts instantly and swaps in.
        const dataUrl = textures?.[actor.characterId];
        if (dataUrl) {
          applyTexture(sprite, dataUrl);
        }
      }
      markDirty();
    },
    setActiveSpeaker(characterId: string | null) {
      for (const [id, { sprite }] of actorMeshes) {
        const active = id === characterId;
        (sprite.material as MeshBasicMaterial).opacity = active ? 1 : 0.55;
        (sprite.material as MeshBasicMaterial).transparent = true;
      }
      markDirty();
    },
    resize(width: number, height: number) {
      size.width = width;
      size.height = height;
      const frame = sceneFrameViewport(width, height);
      renderer.setSize(frame.width, frame.height, false);
      canvas.style.left = `${frame.offsetX}px`;
      canvas.style.top = `${frame.offsetY}px`;
      // Camera aspect matches the 3:2 frame — never the full viewport.
      camera.aspect = SCENE_FRAME.width / SCENE_FRAME.height;
      camera.updateProjectionMatrix();
      markDirty();
    },
    tick() {
      if (!dirty) return;
      dirty = false;
      // Actors face the camera (billboard).
      for (const { sprite } of actorMeshes.values()) {
        sprite.lookAt(camera.position.x, sprite.position.y, camera.position.z);
      }
      renderer.render(scene, camera);
    },
    destroy() {
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    },
  };
}
