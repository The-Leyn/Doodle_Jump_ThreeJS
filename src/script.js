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
let playerMesh = null;

gltfLoader.load("./models/doodle_jump/scene.gltf", (gltf) => {
  playerMesh = gltf.scene;
  playerMesh.rotation.y = Math.PI;
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
 * OPTIMISATION : GÉOMÉTRIE & MATÉRIEL PARTAGÉS
 * ======================
 * On crée la forme et la couleur UNE SEULE FOIS ici.
 * On les réutilisera pour toutes les plateformes.
 */
const platformGeometry = new THREE.BoxGeometry(2, 0.3, 2);
const platformMaterial = new THREE.MeshStandardMaterial({ color: "#4caf50" });

const floorBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
);
world.createCollider(RAPIER.ColliderDesc.cuboid(7.5, 0.1, 7.5), floorBody);

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

  // 1. Mesh : On utilise la géométrie partagée ! (Énorme gain de perf)
  const mesh = new THREE.Mesh(platformGeometry, platformMaterial);

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // 2. Physics
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.15, 1), body);

  platforms.push({ mesh, body });
  lastPlatformY = y;
};

// Initialisation
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
 * INPUT & MOBILE
 * ======================
 */
const keyboard = {
  up: false,
  down: false,
  left: false,
  right: false,
  jump: false,
};

// ... (Gardez vos EventListeners Clavier ici) ...
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

// ... (Gardez votre setupMobileControls ici) ...
const setupMobileControls = () => {
  const jumpBtn = document.getElementById("jump-btn");
  const joystickZone = document.getElementById("joystick-zone");
  const joystickKnob = document.getElementById("joystick-knob");
  if (!jumpBtn || !joystickZone) return;

  jumpBtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      keyboard.jump = true;
    },
    { passive: false },
  );
  jumpBtn.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      keyboard.jump = false;
    },
    { passive: false },
  );

  let startX = 0,
    startY = 0;
  joystickZone.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = joystickZone.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
      updateJoystick(touch.clientX, touch.clientY);
    },
    { passive: false },
  );

  joystickZone.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: false },
  );
  joystickZone.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      resetJoystick();
    },
    { passive: false },
  );

  function updateJoystick(clientX, clientY) {
    let deltaX = clientX - startX;
    let deltaY = clientY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDist = 35;
    if (distance > maxDist) {
      const angle = Math.atan2(deltaY, deltaX);
      deltaX = Math.cos(angle) * maxDist;
      deltaY = Math.sin(angle) * maxDist;
    }
    joystickKnob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
    const threshold = 10;
    keyboard.right = deltaX > threshold;
    keyboard.left = deltaX < -threshold;
    keyboard.down = deltaY > threshold;
    keyboard.up = deltaY < -threshold;
  }
  function resetJoystick() {
    joystickKnob.style.transform = `translate(-50%, -50%)`;
    keyboard.up = false;
    keyboard.down = false;
    keyboard.left = false;
    keyboard.right = false;
  }
};
setupMobileControls();

/**
 * ======================
 * LIGHTS (OPTIMISÉ)
 * ======================
 */
scene.add(new THREE.AmbientLight("#ffffff", 1.5));
const directionalLight = new THREE.DirectionalLight("#ffffff", 3);

// OPTIMISATION : Taille de la texture d'ombre réduite pour mobile
// 1024 est un bon compromis. Si ça rame encore, tentez 512.
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;

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
const sizes = { width: window.innerWidth, height: window.innerHeight };
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
 * RENDERER (OPTIMISÉ)
 * ======================
 */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // OPTIMISATION : Désactiver l'antialiasing sur mobile
  powerPreference: "high-performance", // Demande le GPU puissant
});
renderer.setSize(sizes.width, sizes.height);

// OPTIMISATION : Limiter le PixelRatio à 2 maximum (certains téléphones sont à 3 ou 4)
// Sur un vieux téléphone, on pourrait même descendre à 1.5
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.shadowMap.enabled = true;
// renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optionnel : Ombres plus douces mais un peu plus coûteuses

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
  // ... (votre logique de mouvement reste identique) ...
  const speed = 5;
  let inputForward = 0,
    inputRight = 0;
  if (keyboard.up) inputForward += 1;
  if (keyboard.down) inputForward -= 1;
  if (keyboard.right) inputRight += 1;
  if (keyboard.left) inputRight -= 1;

  let moveX = 0,
    moveZ = 0;
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

  // ... (votre logique de saut reste identique) ...
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
  const elapsedTime = timer.getElapsed();
  if (keyboard.jump && canJump && isGrounded) {
    if (elapsedTime - lastJumpTime > jumpCooldown) {
      playerBody.applyImpulse({ x: 0, y: 15, z: 0 }, true);
      canJump = false;
      lastJumpTime = elapsedTime;
    }
  }

  // Génération & Nettoyage
  const playerPosition = playerBody.translation();
  if (playerPosition.y > lastPlatformY - 20) createPlatform(lastPlatformY + 2);
  if (platforms.length > 0) {
    const oldestPlatform = platforms[0];
    if (
      platforms.length > 20 &&
      oldestPlatform.mesh.position.y < playerPosition.y - 50
    ) {
      scene.remove(oldestPlatform.mesh);
      // Pas besoin de dispose Geometry/Material ici car ils sont PARTAGÉS (const) !
      // On ne supprime que le body physique.
      world.removeRigidBody(oldestPlatform.body);
      platforms.shift();
    }
  }

  world.step();

  // Wrapping
  const mapLimit = 7.5;
  let currentTeleportPos = playerBody.translation();
  let teleportNeeded = false;
  if (currentTeleportPos.x > mapLimit) {
    currentTeleportPos.x = -mapLimit;
    teleportNeeded = true;
  } else if (currentTeleportPos.x < -mapLimit) {
    currentTeleportPos.x = mapLimit;
    teleportNeeded = true;
  }
  if (currentTeleportPos.z > mapLimit) {
    currentTeleportPos.z = -mapLimit;
    teleportNeeded = true;
  } else if (currentTeleportPos.z < -mapLimit) {
    currentTeleportPos.z = mapLimit;
    teleportNeeded = true;
  }
  if (teleportNeeded) playerBody.setTranslation(currentTeleportPos, true);

  // Sync Visuel
  const pos = playerBody.translation();
  if (playerMesh) {
    playerMesh.position.set(pos.x, pos.y - 0.5, pos.z);
    const camDirection = new THREE.Vector3();
    camera.getWorldDirection(camDirection);
    playerMesh.rotation.y =
      Math.atan2(camDirection.x, camDirection.z) + -Math.PI * 0.5;
    directionalLight.position.set(pos.x + 5, pos.y + 10, pos.z + 5);
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
