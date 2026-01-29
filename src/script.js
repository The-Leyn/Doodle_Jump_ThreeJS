import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Timer } from "three/addons/misc/Timer.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import GUI from "lil-gui";
import RAPIER from "@dimforge/rapier3d-compat";

/**
 * ======================
 * INIT RAPIER
 * ======================
 */
await RAPIER.init();

/**
 * Base
 */
const gui = new GUI();
const canvas = document.querySelector("canvas.webgl");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#87ceeb");

/**
 * ======================
 * LOADERS & MODEL
 * ======================
 */
const gltfLoader = new GLTFLoader();

// Variable pour stocker le modèle du joueur
let playerMesh = null;

gltfLoader.load("/models/doodle_jump/scene.gltf", (gltf) => {
  playerMesh = gltf.scene;
  playerMesh.rotation.y = Math.PI; // Rotation 180°
  playerMesh.scale.set(0.4, 0.4, 0.4);

  playerMesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(playerMesh);
});

/**
 * ======================
 * PHYSICS WORLD
 * ======================
 */
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

/**
 * ======================
 * FLOOR (Physics)
 * ======================
 */
const floorBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
);

// Sol de 15x15 (donc 7.5 de demi-largeur)
world.createCollider(RAPIER.ColliderDesc.cuboid(7.5, 0.1, 7.5), floorBody);

/**
 * ======================
 * PLAYER (Physics)
 * ======================
 */
const playerBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0).lockRotations(),
);

world.createCollider(
  RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setFriction(1).setRestitution(0),
  playerBody,
);

/**
 * ======================
 * GÉNÉRATION PROCÉDURALE
 * ======================
 */
const platforms = [];
let lastPlatformY = 0;

const createPlatform = (y) => {
  const x = (Math.random() - 0.5) * 10;
  const z = (Math.random() - 0.5) * 10;

  // 1. Mesh
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.3, 2),
    new THREE.MeshStandardMaterial({ color: "#4caf50" }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // 2. Physics
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.15, 1), body);

  // 3. Stockage
  platforms.push({ mesh, body });

  lastPlatformY = y;
};

// Initialisation des 10 premières plateformes
for (let i = 0; i < 10; i++) {
  createPlatform(i * 2 + 2);
}

/**
 * ======================
 * OBJECTS (Three.js)
 * ======================
 */
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(15, 15),
  new THREE.MeshStandardMaterial({ color: "white" }),
);
floor.rotation.x = -Math.PI * 0.5;
floor.receiveShadow = true;
scene.add(floor);

/**
 * ======================
 * INPUT
 * ======================
 */
const keyboard = {
  up: false,
  down: false,
  left: false,
  right: false,
  jump: false,
};

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW" || e.code === "ArrowUp") keyboard.up = true;
  if (e.code === "KeyS" || e.code === "ArrowDown") keyboard.down = true;
  if (e.code === "KeyA" || e.code === "ArrowLeft") keyboard.left = true;
  if (e.code === "KeyD" || e.code === "ArrowRight") keyboard.right = true;
  if (e.code === "Space") keyboard.jump = true;
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW" || e.code === "ArrowUp") keyboard.up = false;
  if (e.code === "KeyS" || e.code === "ArrowDown") keyboard.down = false;
  if (e.code === "KeyA" || e.code === "ArrowLeft") keyboard.left = false;
  if (e.code === "KeyD" || e.code === "ArrowRight") keyboard.right = false;
  if (e.code === "Space") keyboard.jump = false;
});

/**
 * ======================
 * LIGHTS
 * ======================
 */
scene.add(new THREE.AmbientLight("#ffffff", 1.5));
const directionalLight = new THREE.DirectionalLight("#ffffff", 3);

directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.bottom = -20;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 80;

directionalLight.position.set(3, 5, -5);
directionalLight.castShadow = true;
scene.add(directionalLight);

/**
 * ======================
 * CAMERA
 * ======================
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  100,
);
camera.position.set(0, 6, 12);
scene.add(camera);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * ======================
 * RENDERER
 * ======================
 */
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

/**
 * ======================
 * RESIZE
 * ======================
 */
window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * ======================
 * ANIMATE
 * ======================
 */
const timer = new Timer();
let canJump = false;
let lastJumpTime = 0;
const jumpCooldown = 0.5;

let score = 0;
const h1 = document.querySelector("#score");
const h2 = document.querySelector("#curent-position");

const tick = () => {
  timer.update();
  const delta = timer.getDelta();
  const elapsedTime = timer.getElapsed();

  // --- 1. Mouvement ---
  const speed = 5;
  let inputForward = 0;
  let inputRight = 0;

  if (keyboard.up) inputForward += 1;
  if (keyboard.down) inputForward -= 1;
  if (keyboard.right) inputRight += 1;
  if (keyboard.left) inputRight -= 1;

  let moveX = 0;
  let moveZ = 0;

  if (inputForward !== 0 || inputRight !== 0) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up);

    const moveDirection = new THREE.Vector3();
    moveDirection.addScaledVector(forward, inputForward);
    moveDirection.addScaledVector(right, inputRight);
    moveDirection.normalize();

    moveX = moveDirection.x * speed;
    moveZ = moveDirection.z * speed;
  }

  const currentLinVel = playerBody.linvel();
  playerBody.setLinvel({ x: moveX, y: currentLinVel.y, z: moveZ }, true);

  // --- 2. Logique de Saut ---
  const currentPos = playerBody.translation();

  const offsets = [
    { x: 0, z: 0 },
    { x: 0.49, z: 0.49 },
    { x: -0.49, z: 0.49 },
    { x: 0.49, z: -0.49 },
    { x: -0.49, z: -0.49 },
  ];

  let isGrounded = false;

  for (const offset of offsets) {
    const rayOrigin = {
      x: currentPos.x + offset.x,
      y: currentPos.y,
      z: currentPos.z + offset.z,
    };
    const ray = new RAPIER.Ray(rayOrigin, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(
      ray,
      1.2,
      true,
      undefined,
      undefined,
      undefined,
      playerBody,
    );

    if (hit !== null) {
      isGrounded = true;
      break;
    }
  }

  if (isGrounded && !keyboard.jump) canJump = true;

  if (keyboard.jump && canJump && isGrounded) {
    if (elapsedTime - lastJumpTime > jumpCooldown) {
      playerBody.applyImpulse({ x: 0, y: 15, z: 0 }, true);
      canJump = false;
      lastJumpTime = elapsedTime;
    }
  }

  // --- 3. GÉNÉRATION INFINIE ---
  const playerPosition = playerBody.translation();
  if (playerPosition.y > lastPlatformY - 20) {
    createPlatform(lastPlatformY + 2);
  }

  // --- 4. NETTOYAGE ---
  if (platforms.length > 0) {
    const oldestPlatform = platforms[0];
    if (
      platforms.length > 20 &&
      oldestPlatform.mesh.position.y < playerPosition.y - 50
    ) {
      scene.remove(oldestPlatform.mesh);
      oldestPlatform.mesh.geometry.dispose();
      oldestPlatform.mesh.material.dispose();
      world.removeRigidBody(oldestPlatform.body);
      platforms.shift();
    }
  }

  world.step();

  // ============================================
  // --- 5. LOGIQUE DE "WRAPPING" (BORDS) ---
  // ============================================
  const mapLimit = 7.5; // Limite du monde (moitié du sol de 15)
  let currentTeleportPos = playerBody.translation();
  let teleportNeeded = false;

  // Gestion Axe X (Gauche / Droite)
  if (currentTeleportPos.x > mapLimit) {
    currentTeleportPos.x = -mapLimit;
    teleportNeeded = true;
  } else if (currentTeleportPos.x < -mapLimit) {
    currentTeleportPos.x = mapLimit;
    teleportNeeded = true;
  }

  // Gestion Axe Z (Nord / Sud)
  if (currentTeleportPos.z > mapLimit) {
    currentTeleportPos.z = -mapLimit;
    teleportNeeded = true;
  } else if (currentTeleportPos.z < -mapLimit) {
    currentTeleportPos.z = mapLimit;
    teleportNeeded = true;
  }

  // Si on a dépassé un bord, on téléporte
  if (teleportNeeded) {
    playerBody.setTranslation(currentTeleportPos, true);
  }

  // ============================================

  // --- 6. SYNCHRONISATION MODÈLE ET ORIENTATION ---
  const pos = playerBody.translation();

  if (playerMesh) {
    playerMesh.position.set(pos.x, pos.y - 0.5, pos.z);

    const camDirection = new THREE.Vector3();
    camera.getWorldDirection(camDirection);
    const camAngle = Math.atan2(camDirection.x, camDirection.z);
    playerMesh.rotation.y = camAngle + -Math.PI * 0.5;

    // Lumière
    directionalLight.position.x = pos.x + 5;
    directionalLight.position.z = pos.z + 5;
    directionalLight.position.y = pos.y + 10;
    directionalLight.target.position.copy(playerMesh.position);
    directionalLight.target.updateMatrixWorld();
  }

  // UI
  if (score < Math.round(pos.y)) {
    score = Math.round(pos.y);
    if (h1) h1.textContent = `Score: ${score}`;
  }
  if (h2) h2.textContent = `Current Position: ${Math.round(pos.y)}`;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
};

tick();
