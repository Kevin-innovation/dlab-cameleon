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
  parts: Record<BodyPart, PartLayer>;
  fill: string;
  blobs: PaintBlob[];
  pose: Pose;
  paintSig: string;
};

function paintCanvas(ctx: CanvasRenderingContext2D, fill: string, blobs: PaintBlob[], part: BodyPart) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = fill || WHITE;
  ctx.fillRect(0, 0, w, h);
  for (const b of blobs) {
    if (b.part && b.part !== part) continue;
    if (!b.part && part !== "torso") continue;
    ctx.fillStyle = b.c;
    ctx.beginPath();
    ctx.arc(b.x * w, b.y * h, b.r * w, 0, Math.PI * 2);
    ctx.fill();
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

  const visor = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.32, 8),
    new THREE.MeshStandardMaterial({ color: "#e23b32", roughness: 0.4 }),
  );
  visor.position.y = 1.82;
  visor.visible = false;
  visor.userData.playerId = playerId;

  const nameSprite = makeNameSprite(name);
  body.add(visor);
  group.add(body, nameSprite);
  group.userData.playerId = playerId;

  return {
    group,
    body,
    visor,
    nameSprite,
    parts,
    fill: WHITE,
    blobs: [],
    pose: "stand",
    paintSig: "",
  };
}

export function applyPaint(rig: CharacterRig, fill: string, blobs: PaintBlob[]) {
  const last = blobs[blobs.length - 1];
  const sig = `${fill}|${blobs.length}|${last?.part ?? ""}|${last?.c ?? ""}|${last?.x ?? 0}`;
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
  }
}

export function setNameVisible(rig: CharacterRig, on: boolean) {
  rig.nameSprite.visible = on;
}

export function uvPaint(
  rig: CharacterRig,
  u: number,
  v: number,
  r: number,
  color: string,
  part: BodyPart,
): PaintBlob {
  const blob: PaintBlob = { x: u, y: 1 - v, r, c: color, part };
  applyPaint(rig, rig.fill, [...rig.blobs, blob]);
  return blob;
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
      ctx.fillStyle = b.c;
      ctx.beginPath();
      ctx.arc(box.x + b.x * box.w, box.y + b.y * box.h, b.r * box.w, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
