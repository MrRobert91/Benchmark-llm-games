import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { labColor, type Replay } from "./types";
import type { ReplayBeat } from "./replay-timeline";
import { robotGesture, robotPose } from "./robot-performance";

/** All delegates are meshes, including individual finger joints and face plates. */
export function createCouncil(
  mount: HTMLDivElement,
  replay: Replay,
  initial: ReplayBeat,
  onFailure: () => void,
) {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  mount.appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color("#090e19");
  scene.fog = new T.Fog("#090e19", 17, 42);
  const camera = new T.PerspectiveCamera(40, 1, 0.1, 80);
  const environment = new RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(environment, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.55;
  environment.dispose();
  pmrem.dispose();

  const mat = (
    color: T.ColorRepresentation,
    metalness = 0.5,
    roughness = 0.3,
  ) => new T.MeshStandardMaterial({ color, metalness, roughness });
  const dark = mat("#111722", 0.65, 0.26);
  const brass = mat("#b79963", 0.82, 0.23);

  const porcelainChip = new T.MeshBasicMaterial({ color: "#a5bad5" });
  const black = mat("#040911", 0.55, 0.2);
  const luminous = (color: T.ColorRepresentation, intensity = 3) =>
    new T.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
    });
  const warm = luminous("#ffd9a0", 3);
  const mesh = (
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    material: T.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (
    p: T.Object3D,
    w: number,
    h: number,
    d: number,
    m: T.Material,
    x = 0,
    y = 0,
    z = 0,
    r = 0.06,
  ) => mesh(p, new RoundedBoxGeometry(w, h, d, 3, r), m, x, y, z);
  const sphere = (
    p: T.Object3D,
    r: number,
    m: T.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => mesh(p, new T.SphereGeometry(r, 32, 24), m, x, y, z);
  const cylinder = (
    p: T.Object3D,
    a: number,
    b: number,
    h: number,
    m: T.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => mesh(p, new T.CylinderGeometry(a, b, h, 96), m, x, y, z);
  const ring = (
    p: T.Object3D,
    r: number,
    t: number,
    m: T.Material,
    y: number,
  ) => {
    const o = mesh(p, new T.TorusGeometry(r, t, 12, 160), m, 0, y);
    o.rotation.x = Math.PI / 2;
    return o;
  };
  const limb = (
    p: T.Object3D,
    a: T.Vector3,
    b: T.Vector3,
    r: number,
    m: T.Material,
  ) => {
    const o = mesh(
      p,
      new T.CylinderGeometry(r * 0.85, r, a.distanceTo(b), 16),
      m,
    );
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    return o;
  };

  // Architectural stage: stepped dais, fluted rotunda, light wells and distant city.
  cylinder(scene, 13, 13, 0.25, mat("#101b2c", 0.15, 0.85), 0, -0.22);
  cylinder(scene, 7.5, 7.8, 0.22, mat("#111e33", 0.3, 0.65), 0, -0.03);
  ring(scene, 7.4, 0.022, brass, 0.09);
  ring(scene, 6.8, 0.012, warm, 0.1);
  const wallMaterial = mat("#172841", 0.15, 0.9);
  wallMaterial.side = T.BackSide;
  const wall = mesh(
    scene,
    new T.CylinderGeometry(12.3, 12.3, 11, 96, 1, true, Math.PI / 2, Math.PI),
    wallMaterial,
    0,
    5,
  );
  wall.rotation.y = Math.PI;
  for (const x of [-5, 0, 5]) {
    box(scene, 2.3, 4.4, 0.13, mat("#1a2e50", 0.1, 0.9), x, 4.9, -10.9);
    for (const side of [-1, 1])
      box(scene, 0.028, 4.4, 0.04, brass, x + side * 1.17, 4.9, -10.8, 0.008);
    const starShape = new T.Shape();
    for (let j = 0; j < 16; j++) {
      const a = (j / 16) * Math.PI * 2,
        r = j % 2 ? 0.13 : j % 4 === 0 ? 0.69 : 0.37;
      const sx = Math.sin(a) * r,
        sy = Math.cos(a) * r;
      if (j === 0) starShape.moveTo(sx, sy);
      else starShape.lineTo(sx, sy);
    }
    starShape.closePath();
    mesh(scene, new T.ShapeGeometry(starShape), brass, x, 5.5, -10.79);
  }
  for (let i = 0; i < 84; i++) {
    const a = (i / 84) * Math.PI * 2;
    const x = Math.sin(a) * 12,
      z = Math.cos(a) * 12;
    if (z > 4) continue;
    const col = box(scene, 0.22, 10, 0.5, dark, x, 4.6, z);
    col.rotation.y = a;
    if (i % 7 === 0) {
      const light = box(
        scene,
        0.055,
        6,
        0.08,
        warm,
        x * 0.988,
        5,
        z * 0.988,
        0.015,
      );
      light.rotation.y = a;
    }
  }
  for (let i = 0; i < 32; i++) {
    const h = 0.4 + ((i * 17) % 13) * 0.22;
    box(
      scene,
      0.4,
      h,
      0.5,
      mat("#172638", 0.5, 0.5),
      (i - 16) * 0.33,
      h / 2,
      -15,
    );
    box(
      scene,
      0.04,
      0.045,
      0.03,
      warm,
      (i - 16) * 0.33,
      h * 0.7,
      -14.73,
      0.005,
    );
  }
  for (const x of [-7, 7]) {
    box(scene, 1.3, 8, 1.3, dark, x, 3.9, -8);
    box(scene, 0.06, 6, 0.08, warm, x, 4.4, -7.3);
  }
  for (let i = 0; i < 3; i++)
    ring(scene, 3.9 + i * 0.12, 0.045, i === 1 ? warm : brass, 6.5 + i * 0.08);
  for (const x of [-2.8, 2.8])
    limb(
      scene,
      new T.Vector3(x, 6.5, 0),
      new T.Vector3(x, 10, 0),
      0.012,
      brass,
    );
  scene.add(new T.HemisphereLight("#a7c8ff", "#403020", 0.6));
  const key = new T.SpotLight("#ffe2b8", 190, 25, 1.0, 0.75, 1.7);
  key.position.set(1, 8, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  scene.add(key.target);
  const fill = new T.PointLight("#749fff", 22, 20, 2);
  fill.position.set(-5, 4, -3);
  scene.add(fill);
  const rim = new T.PointLight("#ffcb8c", 28, 20, 2);
  rim.position.set(5, 5, -5);
  scene.add(rim);

  // Actual planar reflection, covered by a translucent marble surface and gold inlay.
  cylinder(scene, 2.35, 2.75, 1.45, dark, 0, 0.73);
  cylinder(scene, 3.35, 3.35, 0.18, brass, 0, 1.52);
  cylinder(scene, 3.4, 3.4, 0.13, black, 0, 1.64);
  const reflection = new Reflector(new T.CircleGeometry(3.38, 128), {
    textureWidth: 768,
    textureHeight: 768,
    color: 0x465674,
    clipBias: 0.003,
  });
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.y = 1.708;
  scene.add(reflection);
  const marbleCanvas = document.createElement("canvas");
  marbleCanvas.width = 1024;
  marbleCanvas.height = 1024;
  const ctx = marbleCanvas.getContext("2d")!;
  ctx.fillStyle = "#11151d";
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 160; i++) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(196,184,159,${0.025 + (i % 7) * 0.012})`;
    ctx.lineWidth = 0.4 + (i % 4) * 0.45;
    for (let x = 0; x <= 1024; x += 8) {
      const y =
        i * 9 -
        200 +
        Math.sin(x * 0.009 + i * 2) * 35 +
        Math.sin(x * 0.039 + i) * 9 +
        x * 0.24;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const marbleTexture = new T.CanvasTexture(marbleCanvas);
  marbleTexture.colorSpace = T.SRGBColorSpace;
  const marbleMat = new T.MeshStandardMaterial({
    map: marbleTexture,
    transparent: true,
    opacity: 0.8,
    metalness: 0.7,
    roughness: 0.22,
  });
  const surface = mesh(
    scene,
    new T.CircleGeometry(3.39, 128),
    marbleMat,
    0,
    1.715,
  );
  surface.rotation.x = -Math.PI / 2;
  [1, 2, 3.23].forEach((r) => ring(scene, r, 0.009, brass, 1.724));
  cylinder(scene, 0.43, 0.55, 0.08, brass, 0, 1.77);
  const crystalMat = luminous("#ffb957", 1.8);
  const crystal = mesh(
    scene,
    new T.OctahedronGeometry(0.39),
    crystalMat,
    0,
    2.22,
  );
  const cage = mesh(
    scene,
    new T.OctahedronGeometry(0.43),
    new T.MeshBasicMaterial({ color: "#fff1c6", wireframe: true }),
    0,
    2.22,
  );
  const heart = new T.PointLight("#ffc373", 12, 6, 2);
  heart.position.set(0, 2.3, 0);
  scene.add(heart);

  const gradient = new T.DataTexture(
    new Uint8Array([65, 65, 65, 255, 155, 155, 155, 255, 235, 235, 235, 255]),
    3,
    1,
    T.RGBAFormat,
  );
  gradient.minFilter = T.NearestFilter;
  gradient.magFilter = T.NearestFilter;
  gradient.needsUpdate = true;
  const ink = new T.MeshBasicMaterial({ color: "#080f23", side: T.BackSide });
  const toonMaterials = new Map<T.Material, T.MeshToonMaterial>();
  const delegates = replay.players.map((player, i) => {
    const variant = i % 5;
    const a =
      replay.players.length === 1
        ? 0
        : -1.15 + i * (2.3 / (replay.players.length - 1));
    const root = new T.Group();
    root.position.set(Math.sin(a) * 4, 0, -Math.cos(a) * 4);
    root.rotation.y = -a;
    scene.add(root);
    const armor = new T.MeshPhysicalMaterial({
      color: ["#2854be", "#cf491c", "#558d34", "#e2a715", "#ce2869"][variant],
      metalness: 0.68,
      roughness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
    });
    const glow = luminous(labColor(i), 4);
    // Upholstered chair with brass piping and grounded legs.
    box(root, 1.32, 1.95, 0.26, dark, 0, 1.68, -0.46, 0.12);
    box(root, 1.4, 0.08, 0.29, brass, 0, 2.66, -0.47, 0.03);
    box(root, 1.26, 0.25, 1.12, dark, 0, 0.96, -0.02, 0.12);
    for (const x of [-0.49, 0.49])
      for (const z of [-0.4, 0.4])
        limb(
          root,
          new T.Vector3(x, 0.08, z),
          new T.Vector3(x, 0.88, z),
          0.045,
          brass,
        );
    for (const x of [-0.7, 0.7])
      box(root, 0.12, 0.12, 0.95, brass, x, 1.43, 0.04);
    // Seated thighs, shins, shoes.
    for (const x of [-0.26, 0.26]) {
      box(root, 0.35, 0.3, 0.73, armor, x, 1.16, 0.29, 0.12);
      sphere(root, 0.16, brass, x, 1.05, 0.61);
      limb(
        root,
        new T.Vector3(x, 1.02, 0.61),
        new T.Vector3(x, 0.27, 0.71),
        0.14,
        armor,
      );
      box(root, 0.43, 0.28, 0.62, armor, x, 0.18, 0.84, 0.1);
    }
    cylinder(root, 0.25, 0.29, 0.24, black, 0, 1.42);
    const body = new T.Group();
    body.position.y = 1.48;
    root.add(body);
    const torso = box(body, 0.86, 0.69, 0.56, armor, 0, 0.45, 0, 0.16);
    for (const side of [-1, 1]) {
      const chest = box(
        body,
        0.35,
        0.26,
        0.1,
        armor,
        side * 0.2,
        0.64,
        0.31,
        0.045,
      );
      chest.rotation.z = side * 0.18;
      box(body, 0.21, 0.1, 0.08, black, side * 0.21, 0.26, 0.3, 0.025);
      sphere(body, 0.031, brass, side * 0.34, 0.74, 0.29);
    }
    const badge = mesh(
      body,
      new T.TorusGeometry(0.12, 0.024, 10, 40),
      brass,
      0,
      0.47,
      0.35,
    );
    sphere(
      body,
      0.092,
      new T.MeshBasicMaterial({ color: "#70eef2" }),
      badge.position.x,
      badge.position.y,
      0.36,
    );
    for (let j = 0; j < 3; j++)
      box(body, 0.21, 0.018, 0.03, black, 0, 0.15 + j * 0.05, 0.3, 0.007);
    box(body, 0.45, 0.15, 0.18, brass, 0, 0.12, 0.23);

    cylinder(body, 0.13, 0.17, 0.25, black, 0, 0.99);
    for (let j = 0; j < 3; j++) ring(body, 0.14, 0.015, brass, 0.9 + j * 0.06);
    const head = new T.Group();
    head.position.y = 1.34;
    body.add(head);
    head.position.y = 1.42;
    head.scale.setScalar(1.34);
    if (variant === 2) {
      const dome = sphere(head, 0.46, armor, 0, 0.06, 0);
      dome.scale.set(1, 1, 0.82);
      box(head, 0.79, 0.36, 0.62, armor, 0, -0.16, 0.04, 0.12);
    } else box(head, 0.91, 0.83, 0.7, armor, 0, 0.04, 0, 0.18);
    // Deep face screen, a thick colored bezel and large anime eyes.
    box(head, 0.77, 0.44, 0.17, armor, 0, -0.08, 0.327, 0.105);
    box(head, 0.71, 0.37, 0.18, black, 0, -0.08, 0.36, 0.1);
    for (const x of [-0.185, 0.185]) {
      const eye = sphere(
        head,
        0.106,
        new T.MeshBasicMaterial({ color: "#61e6ee" }),
        x,
        -0.075,
        0.458,
      );
      eye.scale.set(variant === 3 ? 0.8 : 1, variant === 4 ? 1.3 : 1.05, 0.25);
      const iris = sphere(
        head,
        0.047,
        new T.MeshBasicMaterial({ color: "#153f64" }),
        x + 0.018,
        -0.06,
        0.484,
      );
      iris.scale.set(0.6, 1.3, 0.18);
      sphere(
        head,
        0.025,
        new T.MeshBasicMaterial({ color: "#e8ffff" }),
        x + 0.006,
        -0.029,
        0.498,
      );
      const brow = box(head, 0.2, 0.05, 0.04, armor, x, 0.046, 0.46, 0.015);
      brow.rotation.z = x < 0 ? -0.2 : 0.2;
      if (variant === 2) {
        const goggles = mesh(
          head,
          new T.TorusGeometry(0.14, 0.028, 10, 40),
          brass,
          x,
          -0.075,
          0.46,
        );
        goggles.rotation.z = 0.05;
      }
    }
    for (const x of [-0.49, 0.49]) {
      const ear = cylinder(head, 0.18, 0.18, 0.13, brass, x, 0, -0.015);
      ear.rotation.z = Math.PI / 2;
      const e = cylinder(head, 0.135, 0.135, 0.15, black, x * 1.06, 0, -0.015);
      e.rotation.z = Math.PI / 2;
    }
    box(head, 0.33, 0.025, 0.035, black, 0, -0.31, 0.371, 0.01);
    for (const x of [-0.34, 0.34]) sphere(head, 0.022, brass, x, 0.25, 0.35);
    if (variant === 0) {
      const shape = new T.Shape();
      shape.moveTo(-0.08, 0);
      shape.lineTo(0.17, 0);
      shape.quadraticCurveTo(0.16, 0.36, -0.33, 0.5);
      shape.quadraticCurveTo(-0.08, 0.24, -0.08, 0);
      const crest = mesh(
        head,
        new T.ExtrudeGeometry(shape, { depth: 0.085, bevelEnabled: false }),
        armor,
        0,
        0.45,
        -0.09,
      );
      crest.rotation.y = Math.PI / 2;
    }
    // Inked panel seams, vents, rivets and chipped-paint marks modeled on the shell.
    box(head, 0.75, 0.018, 0.02, black, 0, 0.245, 0.359, 0.004);
    for (let j = 0; j < 3; j++)
      box(
        head,
        0.022,
        0.045,
        0.025,
        black,
        -0.3 + j * 0.085,
        0.32,
        0.36,
        0.009,
      );
    for (const side of [-1, 1]) {
      const seam = box(
        head,
        0.013,
        0.31,
        0.023,
        black,
        side * 0.365,
        0.21,
        0.34,
        0.004,
      );
      seam.rotation.z = side * 0.06;
      const chip = box(
        head,
        0.05,
        0.011,
        0.025,
        porcelainChip,
        side * 0.31,
        0.41,
        0.29,
        0.003,
      );
      chip.rotation.z = side * 0.4;
    }
    if (variant === 0 || variant === 1) {
      box(head, 0.63, 0.22, 0.05, armor, -0.09, 0.35, 0.32, 0.06);
      const lens = mesh(
        head,
        new T.TorusGeometry(0.11, 0.032, 12, 40),
        brass,
        0.28,
        0.29,
        0.38,
      );
      sphere(
        head,
        0.088,
        luminous("#59eaff", 1),
        lens.position.x,
        lens.position.y,
        0.397,
      );
    }
    if (variant === 2)
      for (const x of [-0.3, 0.3]) {
        limb(
          head,
          new T.Vector3(x, 0.4, 0),
          new T.Vector3(x * 1.25, 0.78, -0.04),
          0.018,
          brass,
        );
        sphere(head, 0.057, glow, x * 1.25, 0.78, -0.04);
      }
    if (variant === 3 || variant === 4)
      for (const side of [-1, 1]) {
        const horn = mesh(
          head,
          new T.ConeGeometry(
            variant === 4 ? 0.19 : 0.11,
            variant === 4 ? 0.37 : 0.55,
            3,
          ),
          armor,
          side * 0.36,
          0.55,
          0,
        );
        horn.rotation.z = -side * 0.23;
        if (variant === 4) {
          const inner = mesh(
            head,
            new T.ConeGeometry(0.11, 0.24, 3),
            luminous("#7dfaff", 0.3),
            side * 0.36,
            0.56,
            0.075,
          );
          inner.rotation.z = -side * 0.23;
        }
        if (variant === 3) {
          const brow = box(
            head,
            0.38,
            0.1,
            0.06,
            armor,
            side * 0.17,
            0.12,
            0.45,
            0.025,
          );
          brow.rotation.z = side * 0.3;
        }
      }
    if (variant === 0 || variant === 4) {
      ring(body, 0.22, 0.065, armor, 1.01);
      const scarf = box(body, 0.5, 0.16, 0.08, armor, 0.36, 1.0, -0.16, 0.04);
      scarf.rotation.z = 0.4;
      const tail = box(body, 0.19, 0.49, 0.065, armor, 0.57, 0.85, -0.19, 0.04);
      tail.rotation.z = -0.4;
    }
    const voiceMaterial = new T.MeshBasicMaterial({
      color: "#7dfaff",
      toneMapped: false,
    });
    const voiceBars = Array.from({ length: 5 }, (_, j) =>
      box(
        head,
        0.03,
        0.055,
        0.022,
        voiceMaterial,
        (j - 2) * 0.046,
        -0.245,
        0.458,
        0.008,
      ),
    );
    const speakingHalo = mesh(
      head,
      new T.TorusGeometry(0.67, 0.018, 8, 64),
      new T.MeshBasicMaterial({
        color: "#71eaff",
        transparent: true,
        opacity: 0.75,
        toneMapped: false,
      }),
      0,
      0.06,
      -0.12,
    );
    speakingHalo.visible = false;
    const arms: T.Group[] = [];
    const fingerJoints: T.Group[][] = [];
    for (const side of [-1, 1]) {
      const arm = new T.Group();
      arm.position.set(side * 0.51, 0.73, 0);
      body.add(arm);
      arms.push(arm);
      sphere(arm, 0.18, brass);
      const shoulder = sphere(arm, 0.205, armor);
      shoulder.scale.set(1.1, 1, 0.85);
      if (variant === 3) {
        const flare = mesh(
          arm,
          new T.ConeGeometry(0.24, 0.36, 4),
          armor,
          side * 0.09,
          0.12,
          0,
        );
        flare.rotation.z = -side * 0.8;
      }
      const elbow = new T.Vector3(side * 0.1, -0.58, 0.24),
        wrist = new T.Vector3(side * 0.015, -0.49, 0.8);
      limb(arm, new T.Vector3(0, -0.08, 0), elbow, 0.17, armor);
      sphere(arm, 0.12, brass, elbow.x, elbow.y, elbow.z);
      limb(arm, elbow, wrist, 0.145, armor);
      sphere(arm, 0.09, black, wrist.x, wrist.y, wrist.z);
      const hand = new T.Group();
      hand.position.copy(wrist);
      arm.add(hand);
      box(hand, 0.23, 0.1, 0.25, black, 0, 0, 0.12, 0.035);
      const joints: T.Group[] = [];
      for (let f = 0; f < 4; f++) {
        let parent: T.Object3D = hand;
        for (let j = 0; j < 3; j++) {
          const joint = new T.Group();
          joint.position.set(
            j === 0 ? (f - 1.5) * 0.052 : 0,
            0,
            j === 0 ? 0.245 : 0.072,
          );
          parent.add(joint);
          joints.push(joint);
          box(
            joint,
            0.042,
            0.055,
            0.07,
            j === 1 ? brass : black,
            0,
            0,
            0.032,
            0.016,
          );
          parent = joint;
        }
      }
      box(hand, 0.06, 0.08, 0.14, brass, side * 0.14, -0.005, 0.12, 0.022);
      fingerJoints.push(joints);
    }
    // Upright public ballot board faces the center, not the seated delegate.
    box(root, 0.65, 0.05, 0.42, black, 0, 1.77, 1.25, 0.025);
    box(root, 0.06, 0.35, 0.06, brass, 0, 1.91, 1.25, 0.012);
    const terminal = new T.Group();
    terminal.position.set(0, 2.1, 1.25);
    terminal.rotation.x = -0.1;
    root.add(terminal);
    box(terminal, 1.18, 0.62, 0.07, black, 0, 0, 0, 0.045);
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 768;
    screenCanvas.height = 384;
    const screenTexture = new T.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = T.SRGBColorSpace;
    screenTexture.anisotropy = Math.min(
      4,
      renderer.capabilities.getMaxAnisotropy(),
    );
    const screen = mesh(
      terminal,
      new T.PlaneGeometry(1.1, 0.55),
      new T.MeshBasicMaterial({ map: screenTexture, toneMapped: false }),
      0,
      0,
      0.04,
    );
    screen.castShadow = false;
    const screenContext = screenCanvas.getContext("2d")!;
    let screenKey = "";
    const paintBallot = (current: ReplayBeat) => {
      const vote = current.publicVotes[player.player_id];
      const action = current.revealedActions[player.player_id]?.action;
      const verdict = current.verdicts[player.player_id];
      const key = `${vote}|${action}|${verdict}|${current.round}`;
      if (key === screenKey) return;
      screenKey = key;
      const c = screenContext;
      c.fillStyle = "#091322";
      c.fillRect(0, 0, 768, 384);
      c.strokeStyle =
        vote === "FAST" ? "#ff9c53" : vote === "SAFE" ? "#67e9b2" : "#62738b";
      c.lineWidth = 8;
      c.strokeRect(5, 5, 758, 374);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = "#bdcadc";
      c.font = "600 32px sans-serif";
      c.fillText(`${player.label} · VOTO PÚBLICO`, 384, 54, 710);
      c.fillStyle =
        vote === "FAST" ? "#ff9c53" : vote === "SAFE" ? "#67e9b2" : "#b9c4d4";
      c.font = `800 ${vote ? 128 : 72}px sans-serif`;
      c.fillText(vote ?? "PENDIENTE", 384, 169, 700);
      c.fillStyle = "#e8edf4";
      c.font = "600 35px sans-serif";
      c.fillText(
        action ? `DECISIÓN: ${action}` : "DECISIÓN SIN REVELAR",
        384,
        272,
        710,
      );
      if (verdict !== undefined) {
        c.fillStyle = verdict ? "#67e9b2" : "#ff9c53";
        c.font = "700 36px sans-serif";
        c.fillText(
          verdict ? "✓ CUMPLE SU PALABRA" : "✕ ROMPE SU PALABRA",
          384,
          335,
          710,
        );
      }
      screenTexture.needsUpdate = true;
    };
    paintBallot(initial);
    const outlined: T.Mesh[] = [];
    body.traverse((object) => {
      if (!(object instanceof T.Mesh)) return;
      if (object.material instanceof T.MeshBasicMaterial) return;
      const source = object.material as T.MeshStandardMaterial;
      if (
        source.emissive &&
        source.emissive.getHex() !== 0 &&
        source.emissiveIntensity > 0.9
      )
        return;
      let toon = toonMaterials.get(source);
      if (!toon) {
        toon = new T.MeshToonMaterial({
          color: source.color,
          gradientMap: gradient,
        });
        toonMaterials.set(source, toon);
      }
      object.material = toon;
      outlined.push(object);
    });
    outlined.forEach((object) => {
      const outline = new T.Mesh(object.geometry, ink);
      outline.scale.setScalar(1.045);
      object.add(outline);
      if (
        object.geometry instanceof RoundedBoxGeometry &&
        object.geometry.parameters.width > 0.3
      ) {
        const edges = new T.LineSegments(
          new T.EdgesGeometry(object.geometry, 35),
          new T.LineBasicMaterial({
            color: "#12203b",
            transparent: true,
            opacity: 0.65,
          }),
        );
        object.add(edges);
      }
    });
    return {
      root,
      body,
      head,
      arms,
      fingerJoints,
      voiceBars,
      speakingHalo,
      paintBallot,
      screenTexture,
      screen,
      terminal,
      a,
      playerId: player.player_id,
    };
  });

  const target = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.12, 0.4, 1.6);
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);
  let beat = initial,
    wide = false,
    thinking = false,
    raf = 0,
    disposed = false,
    visible = true;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const look = new T.Vector3(0, 1.6, 0),
    desiredLook = look.clone(),
    desiredPosition = new T.Vector3();
  camera.position.set(0, 4.8, 10.2);
  const resize = () => {
    const w = mount.clientWidth,
      h = mount.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(mount);
  resize();
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
  });
  io.observe(mount);
  let previous = performance.now(),
    t = 0,
    beatTime = 0;
  const tick = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (!visible || document.hidden) return;
    if (!reduced.matches) {
      t += dt;
      beatTime += dt;
    }
    const active = delegates.findIndex((d) => d.playerId === beat.playerId);
    const focus = active >= 0 && !wide;
    if (focus) {
      const d = delegates[active],
        p = d.root.position;
      const distance = camera.aspect < 1 ? 5.2 : 4.8;
      desiredPosition.set(
        p.x - Math.sin(d.a) * distance + Math.cos(d.a) * 0.7,
        3.55,
        p.z + Math.cos(d.a) * distance + Math.sin(d.a) * 0.7,
      );
      desiredLook.set(p.x, 2.55, p.z);
    } else {
      desiredPosition.set(
        0.2,
        camera.aspect < 1 ? 7 : 3.8,
        camera.aspect < 1 ? 18 : 7.2,
      );
      desiredLook.set(0, 2.05, -1);
    }
    const lerp = reduced.matches ? 1 : 1 - Math.exp(-dt * 3.6);
    camera.position.lerp(desiredPosition, lerp);
    look.lerp(desiredLook, lerp);
    camera.lookAt(look);
    const desiredFov = focus || camera.aspect < 1 ? 40 : 32;
    camera.fov += (desiredFov - camera.fov) * lerp;
    camera.updateProjectionMatrix();
    delegates.forEach((d) => {
      const gesture = thinking ? "thinking" : robotGesture(beat, d.playerId);
      const pose = robotPose(gesture, beatTime, reduced.matches);
      // Seek directly to the pose; transitions and oscillations never carry future state backward.
      d.body.rotation.set(pose.bodyX, 0, pose.bodyZ);
      d.head.rotation.set(pose.headX, pose.headY, pose.headZ);
      d.arms[0].rotation.set(pose.left[0], pose.left[1], pose.left[2]);
      d.arms[1].rotation.set(pose.right[0], pose.right[1], pose.right[2]);
      d.fingerJoints.forEach((joints, hand) =>
        joints.forEach((joint) => {
          joint.rotation.x =
            (hand === 0 ? pose.leftFist : pose.rightFist) * 1.35;
        }),
      );
      d.voiceBars.forEach((bar, j) => {
        bar.visible = gesture === "speaking" || gesture === "thinking";
        bar.scale.y = 1 + pose.mouth * (j % 2 ? 1.4 : 3);
      });
      d.speakingHalo.visible = gesture === "speaking" || gesture === "thinking";
      d.speakingHalo.scale.setScalar(
        reduced.matches ? 1 : 1 + Math.sin(beatTime * 4) * 0.035,
      );
      d.paintBallot(beat);
    });
    const catastrophe =
      beat.kind === "outcome" && replay.outcome.kind === "catastrophe";
    crystalMat.color.set(catastrophe ? "#ff493f" : "#ffbd69");
    crystalMat.emissive.copy(crystalMat.color);
    heart.color.copy(crystalMat.color);
    crystal.rotation.y = t * 0.3;
    cage.rotation.y = -t * 0.2;
    crystal.position.y = cage.position.y = 2.22 + Math.sin(t) * 0.035;
    composer.render();
  };
  const lost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    onFailure();
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  raf = requestAnimationFrame(tick);
  return {
    update(next: ReplayBeat, overview: boolean, waiting = false, currentReplay = replay) {
      if (thinking !== waiting || (!waiting && (beat.kind !== next.kind || beat.round !== next.round || beat.playerId !== next.playerId))) beatTime = 0;
      replay = currentReplay;
      thinking = waiting;
      beat = next;
      wide = overview;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>();
      scene.traverse((o) => {
        if (o instanceof T.Mesh || o instanceof T.LineSegments) {
          geometries.add(o.geometry);
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            materials.add(m),
          );
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      toonMaterials.forEach((_, original) => original.dispose());
      delegates.forEach((d) => d.screenTexture.dispose());
      gradient.dispose();
      marbleTexture.dispose();
      reflection.getRenderTarget().dispose();
      envTarget.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
