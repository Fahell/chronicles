import type { Mesh, MeshBasicMaterial } from "three";
import type { SceneTextures } from "../scene/assets";
import type { ActorPlacement, SceneLayout } from "../scene/layout";
import type { Stage } from "./stage";

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
 */
export async function createThreeStage(
  layout: SceneLayout,
  container: HTMLElement,
): Promise<Stage> {
  const THREE = await import("three");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1c2e");

  const camera = new THREE.PerspectiveCamera(layout.camera.fov, 1, 0.1, 100);
  camera.position.set(layout.camera.position.x, layout.camera.position.y, layout.camera.position.z);
  camera.lookAt(layout.camera.lookAt.x, layout.camera.lookAt.y, layout.camera.lookAt.z);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

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

  function applyTexture(mesh: Mesh, dataUrl: string) {
    loader.load(dataUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.LinearMipMapLinearFilter;
      (mesh.material as MeshBasicMaterial).map = texture;
      (mesh.material as MeshBasicMaterial).needsUpdate = true;
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
    },
    setActors(actors: ActorPlacement[]) {
      for (const actor of actorMeshes.values()) {
        scene.remove(actor.sprite, actor.shadow);
      }
      actorMeshes.clear();

      for (const actor of actors) {
        const label = actor.characterId.split("/").pop() ?? actor.characterId;
        const canvas = actorCanvas(label, "#8dd8d0");
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;

        const sprite = new THREE.Mesh(
          new THREE.PlaneGeometry(1.25 * actor.scale, 2.1 * actor.scale),
          new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
        );
        sprite.position.set(actor.position.x, actor.position.y, actor.position.z);

        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.48 * actor.scale, 24),
          new THREE.MeshBasicMaterial({ color: 0x071321, transparent: true, opacity: 0.35 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(actor.position.x, 0.025, actor.position.z);

        scene.add(sprite, shadow);
        actorMeshes.set(actor.characterId, { sprite, shadow });
      }
    },
    setActiveSpeaker(characterId: string | null) {
      for (const [id, { sprite }] of actorMeshes) {
        const active = id === characterId;
        (sprite.material as MeshBasicMaterial).opacity = active ? 1 : 0.55;
        (sprite.material as MeshBasicMaterial).transparent = true;
      }
    },
    resize(width: number, height: number) {
      size.width = width;
      size.height = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    tick() {
      // Actors face the camera (billboard) each frame.
      for (const { sprite } of actorMeshes.values()) {
        sprite.lookAt(camera.position.x, sprite.position.y, camera.position.z);
      }
      renderer.render(scene, camera);
    },
    destroy() {
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
