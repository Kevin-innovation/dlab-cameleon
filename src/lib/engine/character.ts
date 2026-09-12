import * as THREE from "three";
import { WHITE } from "../config";
import type { PaintBlob, Pose } from "../types";

export type CharacterRig = {
  group: THREE.Group;
  body: THREE.Group;
  visor: THREE.Mesh;
  nameSprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  fill: string;
  blobs: PaintBlob[];
  pose: Pose;
  paintSig: string;
};

function paintCanvas(ctx: CanvasRenderingContext2D, fill: string, blobs: PaintBlob[]) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = fill || WHITE;
  ctx.fillRect(0, 0, w, h);
  for (const b of blobs) {
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

export function createCharacter(name: string, playerId: string): CharacterRig {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  paintCanvas(ctx, WHITE, []);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.72,
    metalness: 0.04,
  });

  const group = new THREE.Group();
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 6, 12), mat);
  torso.position.y = 1.0;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat);
  head.position.y = 1.52;
  head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), mat);
  legL.position.set(-0.11, 0.42, 0);
  const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), mat);
  legR.position.set(0.11, 0.42, 0);
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.38, 4, 8), mat);
  armL.position.set(-0.32, 1.12, 0);
  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.38, 4, 8), mat);
  armR.position.set(0.32, 1.12, 0);
  for (const m of [torso, head, legL, legR, armL, armR]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.playerId = playerId;
    body.add(m);
  }

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
    canvas,
    ctx,
    texture,
    fill: WHITE,
    blobs: [],
    pose: "stand",
    paintSig: "",
  };
}

export function applyPaint(rig: CharacterRig, fill: string, blobs: PaintBlob[]) {
  const sig = `${fill}|${blobs.length}|${blobs[blobs.length - 1]?.c ?? ""}|${blobs[blobs.length - 1]?.x ?? 0}`;
  if (rig.paintSig === sig && rig.fill === fill && rig.blobs.length === blobs.length) return;
  rig.fill = fill;
  rig.blobs = blobs;
  rig.paintSig = sig;
  paintCanvas(rig.ctx, fill, blobs);
  rig.texture.needsUpdate = true;
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

export function uvPaint(rig: CharacterRig, u: number, v: number, r: number, color: string): PaintBlob {
  const blob: PaintBlob = { x: u, y: 1 - v, r, c: color };
  const next = [...rig.blobs, blob];
  applyPaint(rig, rig.fill, next);
  return blob;
}
