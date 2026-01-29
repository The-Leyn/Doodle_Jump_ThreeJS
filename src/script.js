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
gui.close(); // On ferme le GUI sur mobile pour gagner un peu de perf UI
gui.hide();
const canvas = document.querySelector("canvas.webgl");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#87ceeb");

// Ajout de brouillard pour masquer le "pop" des plateformes au loin et optimiser le rendu lointain
scene.fog = new THREE.Fog("#87ceeb", 10, 40);

/**
 * ======================
 * DÉTECTION MOBILE
 * ======================
 */
const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

console.log("Mode Mobile détecté : " + isMobile);

// On définit une configuration graphique en fonction du résultat
const graphicsConfig = {
  // Mobile : Pas d'antialiasing (gros gain perf), PC : Oui
  antialias: !isMobile,

  // Mobile : On limite la densité de pixels à 1.5 ou 2 max pour éviter la surchauffe
  // PC : On autorise jusqu'à 2
  pixelRatio: isMobile
    ? Math.min(window.devicePixelRatio, 1.5)
    : Math.min(window.devicePixelRatio, 2),

  // Mobile : Ombres plus petites (1024), PC : Ombres HD (2048)
  shadowMapSize: isMobile ? 1024 : 2048,

  // Mobile : Ombres simplifiées (Basic) ou PCFSoft selon la puissance voulue.
  // Ici on garde PCFSoft pour que ce soit joli, mais avec une petite mapSize.
  shadowType: THREE.PCFSoftShadowMap,
};

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

  const mesh = new THREE.Mesh(platformGeometry, platformMaterial);
  mesh.position.set(x, y, z);

  // OPTIMISATION MASSIVE :
  // Les plateformes NE PROJETTENT PLUS d'ombre, elles ne font que les recevoir.
  // Cela divise par 2 le travail de la lumière.
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  scene.add(mesh);

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
 * LIGHTS (DYNAMIQUE)
 * ======================
 */
scene.add(new THREE.AmbientLight("#ffffff", 1.5));
const directionalLight = new THREE.DirectionalLight("#ffffff", 3);

// Utilisation de la config dynamique
directionalLight.shadow.mapSize.width = graphicsConfig.shadowMapSize;
directionalLight.shadow.mapSize.height = graphicsConfig.shadowMapSize;

directionalLight.shadow.camera.top = 15;
directionalLight.shadow.camera.right = 15;
directionalLight.shadow.camera.bottom = -15;
directionalLight.shadow.camera.left = -15;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 40;
directionalLight.shadow.bias = -0.005;

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
 * RENDERER (DYNAMIQUE)
 * ======================
 */
const renderer = new THREE.WebGLRenderer({
  canvas,
  // On active/désactive l'antialias selon le device
  antialias: graphicsConfig.antialias,
  powerPreference: "high-performance",
});

renderer.setSize(sizes.width, sizes.height);

// On applique le ratio calculé plus haut
renderer.setPixelRatio(graphicsConfig.pixelRatio);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = graphicsConfig.shadowType;

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
  // On garde la logique du ratio dynamique
  renderer.setPixelRatio(graphicsConfig.pixelRatio);
});

/**
 * ======================
 * ANIMATE (OPTIMISÉ - ZÉRO GC)
 * ======================
 */
const timer = new Timer();
let canJump = false;
let lastJumpTime = 0;
const jumpCooldown = 0.5;
let score = 0;
const h1 = document.querySelector("#score");
const h2 = document.querySelector("#curent-position");

// --- VARIABLES RÉUTILISABLES (Pour éviter le Garbage Collection) ---
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDirection = new THREE.Vector3();
const _camDirection = new THREE.Vector3();
// -------------------------------------------------------------------

const tick = () => {
  timer.update();
  const elapsedTime = timer.getElapsed();

  // --- 1. Mouvement ---
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
    // Réutilisation des vecteurs globaux
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    _forward.normalize();

    _right.crossVectors(_forward, camera.up);

    _moveDirection.set(0, 0, 0); // Reset
    _moveDirection.addScaledVector(_forward, inputForward);
    _moveDirection.addScaledVector(_right, inputRight);
    _moveDirection.normalize();

    moveX = _moveDirection.x * speed;
    moveZ = _moveDirection.z * speed;
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

  // Note : On crée toujours des Rays ici, c'est difficile à éviter avec Rapier JS sans pool complexe,
  // mais c'est moins grave que les Vector3.
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

    // Réutilisation vecteur camera
    camera.getWorldDirection(_camDirection);
    playerMesh.rotation.y =
      Math.atan2(_camDirection.x, _camDirection.z) + -Math.PI * 0.5;

    directionalLight.position.set(pos.x + 5, pos.y + 10, pos.z + 5);
    directionalLight.target.position.copy(playerMesh.position);
    directionalLight.target.updateMatrixWorld();
  }

  // UI : Mise à jour moins fréquente (optionnel, mais bon pour le DOM)
  if (score < Math.round(pos.y)) {
    score = Math.round(pos.y);
    if (h1) h1.textContent = `Score: ${score}`;
  }
  if (h2) h2.textContent = `Pos: ${Math.round(pos.y)}`;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
};

tick();
