import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js';

(() => {
  const canvas = document.querySelector('#scene-canvas');
  const status = document.querySelector('#scene-status');
  const unsupported = document.querySelector('#unsupported');

  if (!canvas || !status) {
    unsupported.hidden = false;
    return;
  }

  const textureLoader = new THREE.TextureLoader();
  const groundUrl = '../pixel_art_Pixel-art_ground_tex.jpeg';
  const backgroundUrl = '../pixel_art_Wide_frontal_backgro.jpeg';
  const initialState = {
    cameraHeight: 2,
    cameraPitch: 2,
    backgroundDepth: -10,
    backgroundHeight: 6.3,
    backgroundScale: 1,
    groundDepth: -2.2,
    floorScale: 0.7,
    fieldOfView: 52
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1c2e');

  const camera = new THREE.PerspectiveCamera(initialState.fieldOfView, 1, 0.1, 100);
  camera.position.set(0, initialState.cameraHeight, 9);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffe3a0, 0.35);
  directionalLight.position.set(-4, 8, 4);
  scene.add(directionalLight);

  const groundGroup = new THREE.Group();
  const backdropGroup = new THREE.Group();
  const actorGroup = new THREE.Group();
  const debugGroup = new THREE.Group();
  scene.add(groundGroup, backdropGroup, actorGroup, debugGroup);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 22),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, initialState.groundDepth);
  groundGroup.add(ground);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  backdrop.position.set(0, initialState.backgroundHeight, initialState.backgroundDepth);
  backdropGroup.add(backdrop);

  const floorGrid = new THREE.GridHelper(24, 24, 0xf3ce76, 0x9ed8cf);
  floorGrid.position.set(0, 0.018, initialState.groundDepth);
  floorGrid.material.transparent = true;
  floorGrid.material.opacity = 0.2;
  debugGroup.add(floorGrid);

  const horizonLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-14, 0, 0),
      new THREE.Vector3(14, 0, 0)
    ]),
    new THREE.LineBasicMaterial({ color: 0xf3ce76, transparent: true, opacity: 0.75 })
  );
  horizonLine.position.set(0, 0.04, initialState.groundDepth - 10.6 * initialState.floorScale);
  debugGroup.add(horizonLine);

  const backdropFrame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(30, 20)),
    new THREE.LineBasicMaterial({ color: 0x8dd8d0, transparent: true, opacity: 0.8 })
  );
  backdropFrame.position.copy(backdrop.position);
  backdropFrame.scale.setScalar(initialState.backgroundScale);
  debugGroup.add(backdropFrame);

  const player = createActor('PLAYER', 0xf3ce76, 0.1, -0.3);
  const guideNpc = createActor('NPC', 0x8dd8d0, -2.2, -3.4);
  const guideObject = createActor('OBJECT', 0xd59bba, 2.2, -5.6, 0.72);
  actorGroup.add(player.group, guideNpc.group, guideObject.group);

  let texturesReady = 0;
  let actorsVisible = true;
  let debugVisible = false;

  loadTexture(groundUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    ground.material.map = texture;
    ground.material.needsUpdate = true;
    markTextureReady();
  });

  loadTexture(backgroundUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    backdrop.material.map = texture;
    backdrop.material.needsUpdate = true;
    markTextureReady();
  });

  function loadTexture(url, onLoad) {
    textureLoader.load(
      url,
      onLoad,
      undefined,
      () => {
        status.textContent = `Could not load scene asset: ${url}`;
        status.dataset.state = 'error';
      }
    );
  }

  function markTextureReady() {
    texturesReady += 1;
    if (texturesReady === 2) {
      status.textContent = 'Both generated assets loaded — move PLAYER to inspect scale.';
      status.dataset.state = 'ready';
    }
  }

  function createActor(label, color, x, z, scale = 1) {
    const texture = new THREE.CanvasTexture(createActorCanvas(label, color));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25 * scale, 2.1 * scale), material);
    mesh.position.set(x, 1.05 * scale, z);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.48 * scale, 24),
      new THREE.MeshBasicMaterial({ color: 0x071321, transparent: true, opacity: 0.35 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, 0.025, z);

    return { group: new THREE.Group(), mesh, shadow, x, z };
  }

  function createActorCanvas(label, color) {
    const actorCanvas = document.createElement('canvas');
    actorCanvas.width = 180;
    actorCanvas.height = 300;
    const context = actorCanvas.getContext('2d');
    context.imageSmoothingEnabled = false;

    context.fillStyle = 'rgba(7, 19, 33, 0.3)';
    context.fillRect(15, 15, 150, 270);
    context.fillStyle = '#f4dfbd';
    context.fillRect(68, 42, 44, 44);
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.fillRect(52, 92, 76, 104);
    context.fillStyle = '#1b2636';
    context.fillRect(56, 196, 27, 62);
    context.fillRect(97, 196, 27, 62);
    context.fillStyle = '#f3ce76';
    context.fillRect(50, 266, 34, 10);
    context.fillRect(96, 266, 34, 10);
    context.font = 'bold 16px monospace';
    context.textAlign = 'center';
    context.fillStyle = '#ffffff';
    context.fillText(label, 90, 22);

    return actorCanvas;
  }

  function addActorParts(actor) {
    actor.group.add(actor.mesh, actor.shadow);
  }

  addActorParts(player);
  addActorParts(guideNpc);
  addActorParts(guideObject);

  function updateCamera() {
    camera.position.y = Number(document.querySelector('#camera-height').value);
    const pitch = Number(document.querySelector('#camera-pitch').value);
    camera.lookAt(0, pitch, -6);
  }

  function updateOutput(inputId, outputId, formatter = (value) => value) {
    const input = document.querySelector(`#${inputId}`);
    const output = document.querySelector(`#${outputId}`);
    output.value = formatter(input.value);
    output.textContent = formatter(input.value);
  }

  function bindRange(inputId, outputId, onChange, formatter) {
    const input = document.querySelector(`#${inputId}`);
    input.addEventListener('input', () => {
      updateOutput(inputId, outputId, formatter);
      onChange(Number(input.value));
    });
    updateOutput(inputId, outputId, formatter);
  }

  bindRange('camera-height', 'camera-height-value', updateCamera, (value) => Number(value).toFixed(1));
  bindRange('camera-pitch', 'camera-pitch-value', updateCamera, (value) => Number(value).toFixed(1));
  bindRange('background-depth', 'background-depth-value', (value) => {
    backdrop.position.z = value;
    backdropFrame.position.z = value;
  }, (value) => Number(value).toFixed(1));
  bindRange('background-height', 'background-height-value', (value) => {
    backdrop.position.y = value;
    backdropFrame.position.y = value;
  }, (value) => Number(value).toFixed(1));
  bindRange('background-scale', 'background-scale-value', (value) => {
    backdrop.scale.setScalar(value);
    backdropFrame.scale.setScalar(value);
  }, (value) => Number(value).toFixed(2));
  bindRange('ground-depth', 'ground-depth-value', (value) => {
    ground.position.z = value;
    floorGrid.position.z = value;
    updateHorizonGuide();
  }, (value) => Number(value).toFixed(1));
  bindRange('floor-scale', 'floor-scale-value', (value) => {
    ground.scale.set(value, value, value);
    floorGrid.scale.set(value, value, value);
    updateHorizonGuide();
  }, (value) => Number(value).toFixed(2));
  bindRange('field-of-view', 'field-of-view-value', (value) => {
    camera.fov = value;
    camera.updateProjectionMatrix();
  }, (value) => Number(value).toFixed(0));

  document.querySelector('#reset-button').addEventListener('click', () => {
    document.querySelector('#camera-height').value = initialState.cameraHeight;
    document.querySelector('#camera-pitch').value = initialState.cameraPitch;
    document.querySelector('#background-depth').value = initialState.backgroundDepth;
    document.querySelector('#background-height').value = initialState.backgroundHeight;
    document.querySelector('#background-scale').value = initialState.backgroundScale;
    document.querySelector('#ground-depth').value = initialState.groundDepth;
    document.querySelector('#floor-scale').value = initialState.floorScale;
    document.querySelector('#field-of-view').value = initialState.fieldOfView;
    backdrop.position.set(0, initialState.backgroundHeight, initialState.backgroundDepth);
    backdropFrame.position.copy(backdrop.position);
    backdrop.scale.setScalar(initialState.backgroundScale);
    backdropFrame.scale.setScalar(initialState.backgroundScale);
    ground.position.z = initialState.groundDepth;
    floorGrid.position.z = initialState.groundDepth;
    ground.scale.setScalar(initialState.floorScale);
    floorGrid.scale.setScalar(initialState.floorScale);
    updateHorizonGuide();
    camera.fov = initialState.fieldOfView;
    player.x = 0.1;
    player.z = -0.3;
    syncActor(player);
    updateCamera();
    updateAllOutputs();
  });

  const controlPanel = document.querySelector('.control-panel');
  const hud = document.querySelector('.hud');
  const diagnosticsToggle = document.querySelector('#diagnostics-toggle');

  diagnosticsToggle.addEventListener('click', () => {
    const isCollapsed = controlPanel.classList.toggle('is-collapsed');
    hud.classList.toggle('diagnostics-collapsed', isCollapsed);
    diagnosticsToggle.setAttribute('aria-expanded', String(!isCollapsed));
    diagnosticsToggle.textContent = isCollapsed ? 'Show' : 'Minimize';
  });

  document.querySelector('#debug-button').addEventListener('click', (event) => {
    debugVisible = !debugVisible;
    debugGroup.visible = debugVisible;
    event.currentTarget.setAttribute('aria-pressed', String(debugVisible));
    event.currentTarget.textContent = debugVisible ? 'Hide guides' : 'Debug guides';
  });

  document.querySelector('#characters-button').addEventListener('click', (event) => {
    actorsVisible = !actorsVisible;
    actorGroup.visible = actorsVisible;
    event.currentTarget.setAttribute('aria-pressed', String(actorsVisible));
    event.currentTarget.textContent = actorsVisible ? 'Hide actors' : 'Show actors';
  });

  const movement = new Set();
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) return;
    event.preventDefault();
    movement.add(key);
  });
  window.addEventListener('keyup', (event) => movement.delete(event.key.toLowerCase()));

  function updatePlayer() {
    const speed = 0.08;
    if (movement.has('w') || movement.has('arrowup')) player.z -= speed;
    if (movement.has('s') || movement.has('arrowdown')) player.z += speed;
    if (movement.has('a') || movement.has('arrowleft')) player.x -= speed;
    if (movement.has('d') || movement.has('arrowright')) player.x += speed;
    player.x = THREE.MathUtils.clamp(player.x, -8.5, 8.5);
    player.z = THREE.MathUtils.clamp(player.z, -11.5, 7);
    syncActor(player);
  }

  function syncActor(actor) {
    actor.mesh.position.x = actor.x;
    actor.mesh.position.z = actor.z;
    actor.shadow.position.x = actor.x;
    actor.shadow.position.z = actor.z;
  }

  function updateHorizonGuide() {
    const groundDepth = Number(document.querySelector('#ground-depth').value);
    const floorScale = Number(document.querySelector('#floor-scale').value);
    horizonLine.position.z = groundDepth - 10.6 * floorScale;
  }

  function updateAllOutputs() {
    updateOutput('camera-height', 'camera-height-value', (value) => Number(value).toFixed(1));
    updateOutput('camera-pitch', 'camera-pitch-value', (value) => Number(value).toFixed(1));
    updateOutput('background-depth', 'background-depth-value', (value) => Number(value).toFixed(1));
    updateOutput('background-height', 'background-height-value', (value) => Number(value).toFixed(1));
    updateOutput('background-scale', 'background-scale-value', (value) => Number(value).toFixed(2));
    updateOutput('ground-depth', 'ground-depth-value', (value) => Number(value).toFixed(1));
    updateOutput('floor-scale', 'floor-scale-value', (value) => Number(value).toFixed(2));
    updateOutput('field-of-view', 'field-of-view-value', (value) => Number(value).toFixed(0));
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render() {
    updatePlayer();
    [player, guideNpc, guideObject].forEach((actor) => {
      actor.mesh.lookAt(camera.position.x, actor.mesh.position.y, camera.position.z);
    });
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  window.addEventListener('resize', resize);
  debugGroup.visible = false;
  updateCamera();
  resize();
  render();
})();
