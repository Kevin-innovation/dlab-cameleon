import * as THREE from "three";
import { WHITE } from "../config";
import { BODY_PARTS, type BodyPart, type PaintBlob, type Pose } from "../types";

export type PartLayer = {
  id: BodyPart;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
};

export type CharacterRig = {
  group: THREE.Group;
  body: THREE.Group;
  visor: THREE.Mesh;
  nameSprite: THREE.Sprite;
  ghostBadge: THREE.Sprite;
  parts: Record<BodyPart, PartLayer>;
  fill: string;
  blobs: PaintBlob[];
  pose: Pose;
  paintSig: string;
  ghost: boolean;
  walkT: number;
  gun: THREE.Group;
  muzzle: THREE.Mesh;
  shootUntil: number;
  shootSeq: number;
  catching: boolean;
};

function stampBlob(ctx: CanvasRenderingContext2D, b: PaintBlob, w: number, h: number) {
  const x0 = b.x * w;
  const y0 = b.y * h;
  const x1 = (b.tx ?? b.x) * w;
  const y1 = (b.ty ?? b.y) * h;
  const rad = Math.max(1.2, b.r * w);
  ctx.strokeStyle = b.c;
  ctx.fillStyle = b.c;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = rad * 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x0, y0, rad, 0, Math.PI * 2);
  ctx.fill();
  if (x0 !== x1 || y0 !== y1) {
    ctx.beginPath();
    ctx.arc(x1, y1, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCanvas(ctx: CanvasRenderingContext2D, fill: string, blobs: PaintBlob[], part: BodyPart) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = fill || WHITE;
  ctx.fillRect(0, 0, w, h);
  for (const b of blobs) {
    if (b.part && b.part !== part) continue;
    if (!b.part && part !== "torso") continue;
    stampBlob(ctx, b, w, h);
  }
}

function makeNameSprite(text: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 64);
  g.font = "700 28px sans-serif";
  g.textAlign = "center";
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,0.65)";
  g.fillStyle = "#fff6e8";
  g.strokeText(text, 128, 40);
  g.fillText(text, 128, 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.4, 0.35, 1);
  spr.position.y = 2.05;
  return spr;
}

function createGun() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: "#1c1e22", metalness: 0.82, roughness: 0.25 });
  const dull = new THREE.MeshStandardMaterial({ color: "#2b2f36", metalness: 0.4, roughness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: "#c0392b", metalness: 0.35, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.32), metal);
  body.position.set(0, 0.02, -0.08);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.38, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.32);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.08), dull);
  grip.position.set(0, -0.1, 0.04);
  grip.rotation.x = 0.28;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.07), accent);
  mag.position.set(0, -0.13, -0.02);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.06), accent);
  sight.position.set(0, 0.08, -0.02);
  const muzzle = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.16, 8),
    new THREE.MeshBasicMaterial({ color: "#ffe9a0", transparent: true, opacity: 0, depthWrite: false }),
  );
  muzzle.rotation.x = -Math.PI / 2;
  muzzle.position.set(0, 0.03, -0.54);
  g.add(body, barrel, grip, mag, sight, muzzle);
  g.visible = false;
  return { gun: g, muzzle };
}

export function createViewGun() {
  const { gun, muzzle } = createGun();
  gun.visible = true;
  gun.scale.setScalar(1.12);
  gun.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.renderOrder = 1000;
    mesh.castShadow = false;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[];
    for (const m of mats) {
      m.depthTest = false;
      m.depthWrite = false;
    }
  });
  return { gun, muzzle };
}

function makePart(id: BodyPart, geo: THREE.BufferGeometry, playerId: string): PartLayer {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  paintCanvas(ctx, WHITE, [], id);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.72,
    metalness: 0.04,
    transparent: true,
    opacity: 1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.playerId = playerId;
  mesh.userData.part = id;
  return { id, canvas, ctx, texture, mesh };
}

export function createCharacter(name: string, playerId: string): CharacterRig {
  const group = new THREE.Group();
  const body = new THREE.Group();

  const torso = makePart("torso", new THREE.CapsuleGeometry(0.22, 0.55, 6, 12), playerId);
  torso.mesh.position.y = 1.0;
  const head = makePart("head", new THREE.SphereGeometry(0.2, 16, 12), playerId);
  head.mesh.position.y = 1.52;
  const legL = makePart("legL", new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), playerId);
  legL.mesh.position.set(-0.11, 0.42, 0);
  const legR = makePart("legR", new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), playerId);
  legR.mesh.position.set(0.11, 0.42, 0);
  const armL = makePart("armL", new THREE.CapsuleGeometry(0.07, 0.38, 4, 8), playerId);
  armL.mesh.position.set(-0.32, 1.12, 0);
  const armR = makePart("armR", new THREE.CapsuleGeometry(0.07, 0.38, 4, 8), playerId);
  armR.mesh.position.set(0.32, 1.12, 0);

  const parts = { head, torso, armL, armR, legL, legR };
  for (const p of Object.values(parts)) body.add(p.mesh);
  const { gun, muzzle } = createGun();
  gun.position.set(0.03, -0.28, 0.02);
  gun.rotation.set(-Math.PI / 2, 0, 0);
  armR.mesh.add(gun);

  const visor = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.32, 8),
    new THREE.MeshStandardMaterial({ color: "#e23b32", roughness: 0.4 }),
  );
  visor.position.y = 1.82;
  visor.visible = false;
  visor.userData.playerId = playerId;

  const nameSprite = makeNameSprite(name);
  const ghostBadge = makeNameSprite("유령");
  ghostBadge.position.y = 2.42;
  ghostBadge.scale.set(1.1, 0.3, 1);
  ghostBadge.visible = false;
  (ghostBadge.material as THREE.SpriteMaterial).color.set("#9ce8ff");
  body.add(visor);
  group.add(body, nameSprite, ghostBadge);
  group.userData.playerId = playerId;

  return {
    group,
    body,
    visor,
    nameSprite,
    ghostBadge,
    parts,
    fill: WHITE,
    blobs: [],
    pose: "stand",
    paintSig: "",
    ghost: false,
    walkT: 0,
    gun,
    muzzle,
    shootUntil: 0,
    shootSeq: 0,
    catching: false,
  };
}

export function applyPaint(rig: CharacterRig, fill: string, blobs: PaintBlob[]) {
  const last = blobs[blobs.length - 1];
  const sig = `${fill}|${blobs.length}|${last?.part ?? ""}|${last?.c ?? ""}|${last?.x ?? 0}|${last?.tx ?? ""}|${last?.ty ?? ""}`;
  if (rig.paintSig === sig) return;
  rig.fill = fill;
  rig.blobs = blobs;
  rig.paintSig = sig;
  for (const id of BODY_PARTS) {
    const layer = rig.parts[id];
    paintCanvas(layer.ctx, fill, blobs, id);
    layer.texture.needsUpdate = true;
  }
}

export function applyPose(rig: CharacterRig, pose: Pose) {
  rig.pose = pose;
  const b = rig.body;
  b.rotation.set(0, 0, 0);
  b.scale.set(1, 1, 1);
  b.position.set(0, 0, 0);
  if (pose === "crouch") {
    b.scale.set(1.05, 0.62, 1.15);
  } else if (pose === "sit") {
    b.scale.set(1.2, 0.52, 1.15);
    b.position.y = -0.15;
  } else if (pose === "lie") {
    b.rotation.x = -Math.PI / 2;
    b.scale.set(1, 0.45, 1.35);
    b.position.y = 0.28;
  } else if (pose === "stretch") {
    b.scale.set(0.62, 1.38, 0.62);
  } else if (pose === "ball") {
    b.scale.set(1.25, 0.7, 1.25);
    b.position.y = 0.1;
  } else if (pose === "stick") {
    b.scale.set(1.28, 1.06, 0.08);
    b.position.z = 0;
  }
}

export function setNameVisible(rig: CharacterRig, on: boolean) {
  rig.nameSprite.visible = on;
  if (!on) rig.ghostBadge.visible = false;
}

export function setGhostLook(rig: CharacterRig, ghost: boolean) {
  if (rig.ghost === ghost) {
    rig.ghostBadge.visible = ghost && rig.nameSprite.visible;
    return;
  }
  rig.ghost = ghost;
  for (const part of Object.values(rig.parts)) {
    const mat = part.mesh.material as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mat.opacity = ghost ? 0.28 : 1;
    mat.depthWrite = !ghost;
    mat.emissive.set(ghost ? "#7ecbff" : "#000000");
    mat.emissiveIntensity = ghost ? 0.45 : 0;
    part.mesh.castShadow = !ghost;
  }
  const vm = rig.visor.material as THREE.MeshStandardMaterial;
  vm.transparent = true;
  vm.opacity = ghost ? 0.25 : 1;
  rig.ghostBadge.visible = ghost && rig.nameSprite.visible;
}

export function animateCharacter(
  rig: CharacterRig,
  opts: {
    moving: boolean;
    ghost: boolean;
    caughtT: number;
    dt: number;
    hunter: boolean;
    airborne?: boolean;
    reducedMotion?: boolean;
  },
) {
  const reducedMotion = !!opts.reducedMotion;
  const remain = Math.max(0, Math.min(1, opts.caughtT));
  if (remain > 0) {
    rig.catching = true;
    const elapsed = 1 - remain;
    const impact = Math.max(0, 1 - elapsed / 0.14);
    const fall = Math.min(1, elapsed / 0.2);
    rig.body.rotation.x = -1.62 * fall;
    rig.body.rotation.y = 0.55 * fall;
    rig.body.rotation.z = 0.72 * fall + (reducedMotion ? 0 : Math.sin(elapsed * 48) * 0.55 * impact);
    rig.body.position.y = reducedMotion ? 0 : 0.42 * impact;
    rig.body.position.z = reducedMotion ? 0 : -0.85 * fall;
    const punch = 1 + 0.22 * impact;
    rig.body.scale.set(punch, punch, punch);
    rig.gun.visible = false;
    for (const part of Object.values(rig.parts)) {
      const mat = part.mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.set(impact > 0.2 ? "#ffe8a8" : "#ff2a2a");
      mat.emissiveIntensity = 1.15 * Math.max(impact, 0.35 * (1 - elapsed));
    }
    return;
  }
  if (rig.catching) {
    rig.catching = false;
    applyPose(rig, rig.pose);
    if (opts.ghost) {
      for (const part of Object.values(rig.parts)) {
        const mat = part.mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.set("#7ecbff");
        mat.emissiveIntensity = 0.45;
      }
    }
  }
  if (!opts.ghost) {
    for (const part of Object.values(rig.parts)) {
      const mat = part.mesh.material as THREE.MeshStandardMaterial;
      if (mat.emissiveIntensity > 0 && mat.emissive.getHexString() === "ff2a2a") {
        mat.emissive.set("#000000");
        mat.emissiveIntensity = 0;
      }
    }
  }
  rig.body.rotation.x = rig.pose === "lie" ? rig.body.rotation.x : 0;
  rig.body.rotation.z = 0;

  const airborne = !!opts.airborne;
  const walkOn =
    opts.moving &&
    !airborne &&
    rig.pose !== "lie" &&
    rig.pose !== "sit" &&
    rig.pose !== "ball" &&
    rig.pose !== "stick";
  if (walkOn && !reducedMotion) rig.walkT += opts.dt * (opts.ghost ? 6.5 : 10);
  const swing = walkOn && !reducedMotion ? Math.sin(rig.walkT) * 0.7 : 0;
  const bob = walkOn && !reducedMotion ? Math.abs(Math.sin(rig.walkT)) * 0.05 : 0;
  if (airborne) {
    rig.parts.legL.mesh.rotation.x = 0.42;
    rig.parts.legR.mesh.rotation.x = -0.18;
    rig.parts.armL.mesh.rotation.x = -0.95;
  } else {
    rig.parts.legL.mesh.rotation.x = swing;
    rig.parts.legR.mesh.rotation.x = -swing;
    rig.parts.armL.mesh.rotation.x = -swing * 0.85;
  }
  const shooting = Date.now() < rig.shootUntil;
  const kick = shooting ? Math.min(1, (rig.shootUntil - Date.now()) / 180) : 0;
  if (opts.hunter) {
    rig.gun.visible = true;
    rig.parts.armR.mesh.rotation.x = 1.52 + kick * 0.28;
    rig.parts.armR.mesh.rotation.z = 0.1;
    rig.gun.rotation.set(-Math.PI / 2 - kick * 0.12, 0, 0);
    const flash = rig.muzzle.material as THREE.MeshBasicMaterial;
    flash.opacity = kick * 0.95;
    rig.muzzle.scale.setScalar(0.7 + kick * 1.8);
  } else {
    rig.gun.visible = false;
    rig.parts.armR.mesh.rotation.x = airborne ? -0.95 : swing * 0.85;
    rig.parts.armR.mesh.rotation.z = 0;
    const flash = rig.muzzle.material as THREE.MeshBasicMaterial;
    flash.opacity = 0;
  }
  rig.body.position.y = (opts.ghost && !reducedMotion ? 0.22 + Math.sin(performance.now() * 0.003) * 0.08 : 0) + bob;
  if (airborne) rig.body.position.y += 0.05;
  if (rig.pose === "stick") {
    rig.body.position.z = 0;
    rig.body.scale.set(1.28, 1.06, 0.08);
  }
}

export function uvPaint(
  rig: CharacterRig,
  u: number,
  v: number,
  r: number,
  color: string,
  part: BodyPart,
): PaintBlob {
  const blob: PaintBlob = { x: u, y: 1 - v, r, c: color, part, tx: u, ty: 1 - v };
  applyPaint(rig, rig.fill, [...rig.blobs, blob]);
  return blob;
}

export function extendPaint(
  rig: CharacterRig,
  blobs: PaintBlob[],
  u: number,
  v: number,
  r: number,
  color: string,
  part: BodyPart,
  dragging: boolean,
): PaintBlob[] {
  const x = u;
  const y = 1 - v;
  const next = blobs.slice();
  const last = next[next.length - 1];
  const endX = last?.tx ?? last?.x ?? 0;
  const endY = last?.ty ?? last?.y ?? 0;
  if (
    dragging &&
    last &&
    last.part === part &&
    last.c === color &&
    Math.hypot(endX - x, endY - y) < 0.45
  ) {
    next[next.length - 1] = { ...last, tx: x, ty: y };
  } else {
    next.push({ x, y, r, c: color, part, tx: x, ty: y });
  }
  applyPaint(rig, rig.fill, next);
  return next;
}

export function drawBodyPreview(
  ctx: CanvasRenderingContext2D,
  fill: string,
  blobs: PaintBlob[],
) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  const boxes: Record<BodyPart, { x: number; y: number; w: number; h: number }> = {
    head: { x: W * 0.38, y: H * 0.04, w: W * 0.24, h: H * 0.18 },
    torso: { x: W * 0.32, y: H * 0.24, w: W * 0.36, h: H * 0.34 },
    armL: { x: W * 0.08, y: H * 0.25, w: W * 0.2, h: H * 0.32 },
    armR: { x: W * 0.72, y: H * 0.25, w: W * 0.2, h: H * 0.32 },
    legL: { x: W * 0.32, y: H * 0.6, w: W * 0.16, h: H * 0.34 },
    legR: { x: W * 0.52, y: H * 0.6, w: W * 0.16, h: H * 0.34 },
  };
  for (const id of BODY_PARTS) {
    const box = boxes[id];
    ctx.fillStyle = fill || WHITE;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    for (const b of blobs) {
      if ((b.part || "torso") !== id) continue;
      stampBlob(
        ctx,
        {
          ...b,
          x: box.x / W + (b.x * box.w) / W,
          y: box.y / H + (b.y * box.h) / H,
          tx: box.x / W + ((b.tx ?? b.x) * box.w) / W,
          ty: box.y / H + ((b.ty ?? b.y) * box.h) / H,
          r: (b.r * box.w) / W,
        },
        W,
        H,
      );
    }
  }
}
