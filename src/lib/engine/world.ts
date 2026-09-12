import * as THREE from "three";
import { GRAVITY, JUMP_SPEED, LOOK_SENS, PAINT_SPEED, PLAYER_SPEED, RUN_SPEED, SNEAK_SPEED, WHITE } from "../config";
import { BOX_COLLIDE_OUTSET, doorColliders, getMap, mapColliders } from "../maps";
import type { BodyPart, Collider, DoorDef, GameMap, PaintBlob, PlayerSnap, Pose, RoomState } from "../types";
import { hiderAlive, isHunter } from "../round";
import {
  blocked,
  edgeMargin,
  headHit,
  landOn,
  moveWithSlide,
  nearestSurface,
  poseHeight,
  poseRadius,
  resolveStuck,
} from "./collision";
import {
  animateCharacter,
  applyPaint,
  applyPose,
  createCharacter,
  createViewGun,
  extendPaint,
  setGhostLook,
  setNameVisible,
  uvPaint,
  type CharacterRig,
} from "./character";
import { makePatternCanvas, rgbToHex } from "./textures";

export type WorldInput = {
  keys: Set<string>;
  paintOpen: boolean;
  tool: "brush" | "dropper" | "fill";
  color: string;
  brush: number;
};

export class GameWorld {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  mapGroup = new THREE.Group();
  players = new Map<string, CharacterRig>();
  colliders: Collider[] = [];
  private baseColliders: Collider[] = [];
  private doorRigs: { def: DoorDef; pivot: THREE.Group; leaf: THREE.Mesh }[] = [];
  private doorPass = new Map<string, Map<string, { side: number; crossed: boolean }>>();
  map!: GameMap;
  yaw = 0;
  pitch = 0;
  localX = 4;
  localY = 0;
  localZ = 4;
  vy = 0;
  cling: {
    axis: "x" | "z";
    sign: number;
    plane: number;
    minA: number;
    maxA: number;
    maxY: number;
  } | null = null;
  grounded = true;
  crouching = false;
  hunterTps = false;
  watch = false;
  bodyYaw = 0;
  specX = 0;
  specY = 1.6;
  specZ = 0;
  specYaw = 0;
  specPitch = 0;
  sampleCanvases: { mesh: THREE.Mesh; canvas: HTMLCanvasElement }[] = [];
  camBlockers: THREE.Object3D[] = [];
  private euler = new THREE.Euler(0, 0, 0, "YXZ");
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private wish = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camEye = new THREE.Vector3();
  private camDir = new THREE.Vector3();
  private camRay = new THREE.Raycaster();
  private muzzleWorld = new THREE.Vector3();
  private tracerEnd = new THREE.Vector3();
  private tracers: { line: THREE.Line; until: number }[] = [];
  private killFx: { group: THREE.Group; start: number; until: number }[] = [];
  private seenTagAt = 0;
  private fpGun: THREE.Group;
  private fpMuzzle: THREE.Mesh;
  private fpKick = 0;
  private viewBob = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.08, 700);
    this.camera.rotation.order = "YXZ";
    const view = createViewGun();
    this.fpGun = view.gun;
    this.fpMuzzle = view.muzzle;
    this.fpGun.visible = false;
    this.camera.add(this.fpGun);
    this.scene.add(this.camera);
    this.scene.add(this.mapGroup);
    this.resize();
  }

  resize() {
    const canvas = this.renderer.domElement;
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  loadMap(id: string) {
    const map = getMap(id);
    this.map = map;
    this.sampleCanvases = [];
    this.camBlockers = [];
    while (this.mapGroup.children.length) {
      const ch = this.mapGroup.children[0];
      this.mapGroup.remove(ch);
      disposeObject(ch);
    }

    this.scene.background = new THREE.Color(map.fog);
    this.scene.fog = new THREE.FogExp2(map.fog, 0.0072);
    this.cling = null;
    this.grounded = true;
    this.doorPass.clear();

    const hemi = new THREE.HemisphereLight("#f2efe6", "#3d2a1c", 1.05);
    const sun = new THREE.DirectionalLight("#fff4e0", 1.35);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    this.mapGroup.add(hemi, sun);

    const floorTex = canvasTexture(makePatternCanvas("wood", map.floor, [map.floor, "#b08950"], 11, 512));
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(map.w / 4, map.d / 4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(map.w, map.d),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(map.w / 2, 0, map.d / 2);
    floor.receiveShadow = true;
    floor.userData.color = map.floor;
    this.mapGroup.add(floor);
    this.camBlockers.push(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(map.w, map.d),
      new THREE.MeshStandardMaterial({ color: "#d9cbb8", roughness: 1, side: THREE.DoubleSide }),
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(map.w / 2, map.ceiling, map.d / 2);
    this.mapGroup.add(ceil);
    this.camBlockers.push(ceil);

    for (const b of map.boxes) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      let mat: THREE.MeshStandardMaterial;
      if (b.texture) {
        const tex = new THREE.TextureLoader().load(b.texture);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(Math.max(1, b.w / 3), Math.max(1, b.h / 3));
        mat = new THREE.MeshStandardMaterial({ map: tex, color: b.color, roughness: 0.84 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x, b.y, b.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.color = b.color;
        mesh.userData.texture = b.texture;
        this.mapGroup.add(mesh);
        if (b.collide || b.h >= 0.28) this.camBlockers.push(mesh);
      } else if (b.pattern && b.pattern !== "solid") {
        const cnv = makePatternCanvas(
          b.pattern,
          b.color,
          b.colors,
          (b.x * 100 + b.z * 17) | 0,
        );
        const tex = canvasTexture(cnv);
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x, b.y, b.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.color = b.color;
        mesh.userData.canvas = cnv;
        this.sampleCanvases.push({ mesh, canvas: cnv });
        this.mapGroup.add(mesh);
        if (b.collide || b.h >= 0.28) this.camBlockers.push(mesh);
      } else {
        mat = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.78 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x, b.y, b.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.color = b.color;
        this.mapGroup.add(mesh);
        if (b.collide || b.h >= 0.28) this.camBlockers.push(mesh);
      }
    }

    this.doorRigs = [];
    for (const def of map.doors ?? []) {
      const rig = makeDoor(def);
      this.mapGroup.add(rig.pivot);
      this.camBlockers.push(rig.leaf);
      this.doorRigs.push({ def, pivot: rig.pivot, leaf: rig.leaf });
    }
    this.baseColliders = mapColliders(map);
    this.syncDoors({});
  }

  syncDoors(open: Record<string, boolean>) {
    for (const d of this.doorRigs) {
      d.pivot.rotation.y = open[d.def.id] ? 1.84 : 0;
    }
    this.colliders = [
      ...this.baseColliders,
      ...this.doorRigs.flatMap((d) => doorColliders(d.def, !!open[d.def.id])),
    ];
    if (this.map && !this.cling) {
      const r = 0.3;
      const freed = resolveStuck(
        this.localX,
        this.localZ,
        r,
        this.colliders,
        { w: this.map.w, d: this.map.d },
        this.localY,
        this.localY + 1.7,
      );
      this.localX = freed.x;
      this.localZ = freed.z;
    }
  }

  nearDoor() {
    let best: { id: string; dist: number } | null = null;
    for (const d of this.doorRigs) {
      const dist = Math.hypot(this.localX - d.def.x, this.localZ - d.def.z);
      if (dist < 2.6 && (!best || dist < best.dist)) best = { id: d.def.id, dist };
    }
    return best?.id ?? null;
  }

  doorsToClose(open: Record<string, boolean>, people: { id: string; x: number; z: number }[]) {
    const close: string[] = [];
    for (const d of this.doorRigs) {
      const id = d.def.id;
      let rec = this.doorPass.get(id);
      if (!rec) {
        rec = new Map();
        this.doorPass.set(id, rec);
      }
      if (!open[id]) {
        rec.clear();
        continue;
      }
      for (const p of people) {
        const along = d.def.along === "x" ? p.x - d.def.x : p.z - d.def.z;
        const thru = d.def.along === "x" ? p.z - d.def.z : p.x - d.def.x;
        const inLane = Math.abs(along) <= d.def.w / 2 + 1.15;
        if (Math.hypot(p.x - d.def.x, p.z - d.def.z) > 4.2) continue;
        const side = Math.abs(thru) < 0.08 ? 0 : thru > 0 ? 1 : -1;
        let st = rec.get(p.id);
        if (!st) {
          st = { side, crossed: false };
          rec.set(p.id, st);
        }
        if (inLane && st.side !== 0 && side !== 0 && side !== st.side) st.crossed = true;
        if (side !== 0) st.side = side;
        if (st.crossed && Math.abs(thru) > 0.68) close.push(id);
      }
    }
    return [...new Set(close)];
  }

  lookDelta(dx: number, dy: number) {
    const lim = Math.PI / 2 - 0.04;
    if (this.watch) {
      this.specYaw -= dx * LOOK_SENS;
      this.specPitch = Math.max(-lim, Math.min(lim, this.specPitch - dy * LOOK_SENS));
      return;
    }
    if (!this.cling) this.yaw -= dx * LOOK_SENS;
    const pitchLim = this.cling ? Math.PI / 5 : lim;
    this.pitch = Math.max(-pitchLim, Math.min(pitchLim, this.pitch - dy * LOOK_SENS));
  }

  toggleWatch() {
    if (this.watch) {
      this.watch = false;
      this.yaw = this.bodyYaw;
      this.camera.up.set(0, 1, 0);
      return false;
    }
    this.watch = true;
    this.camera.up.set(0, 1, 0);
    this.pitch = 0;
    const nx = this.cling ? (this.cling.axis === "x" ? this.cling.sign : 0) : Math.sin(this.yaw);
    const nz = this.cling ? (this.cling.axis === "z" ? this.cling.sign : 0) : Math.cos(this.yaw);
    this.bodyYaw = this.cling ? Math.atan2(nx, nz) : this.yaw;
    this.specYaw = this.cling ? Math.atan2(nx, nz) : this.yaw;
    this.specPitch = 0;
    this.specX = this.localX + nx * 3.1;
    this.specZ = this.localZ + nz * 3.1;
    this.specY = Math.max(1.2, Math.min(this.map.ceiling - 0.55, this.localY + 1.5));
    this.specX = Math.max(1.2, Math.min(this.map.w - 1.2, this.specX));
    this.specZ = Math.max(1.2, Math.min(this.map.d - 1.2, this.specZ));
    return true;
  }

  private clingFeetMax(boxMaxY: number) {
    return Math.max(0, Math.min(boxMaxY - 0.4, this.map.ceiling - 2.15));
  }

  exitWatch() {
    if (!this.watch) return;
    this.watch = false;
    this.yaw = this.bodyYaw;
  }

  clinging() {
    return this.cling !== null;
  }

  toggleHunterView() {
    this.hunterTps = !this.hunterTps;
    return this.hunterTps;
  }

  exitCling() {
    this.cling = null;
  }

  tryCling(pose: Pose) {
    if (this.cling) {
      this.cling = null;
      return false;
    }
    if (pose === "lie" || pose === "ball") return false;
    // The map boundary keeps normal movement a little inside the room, so its
    // rendered wall can be more than the body radius away from the player.
    // C should still reach that wall and snap the player onto its surface.
    const hit = nearestSurface(this.localX, this.localZ, this.colliders, 0.9);
    if (!hit || hit.dist < 0.04 || hit.dist > 0.55) return false;
    const box = hit.box;
    const pad = clingPad();
    if (Math.abs(hit.nx) >= Math.abs(hit.nz)) {
      const sign = hit.nx >= 0 ? 1 : -1;
      this.cling = {
        axis: "x",
        sign,
        plane: clingVisualFace(box, "x", sign),
        minA: box.minZ + 0.04,
        maxA: box.maxZ - 0.04,
        maxY: box.maxY,
      };
      this.localX = this.cling.plane + sign * pad;
      this.localZ = Math.max(this.cling.minA, Math.min(this.cling.maxA, this.localZ));
    } else {
      const sign = hit.nz >= 0 ? 1 : -1;
      this.cling = {
        axis: "z",
        sign,
        plane: clingVisualFace(box, "z", sign),
        minA: box.minX + 0.04,
        maxA: box.maxX - 0.04,
        maxY: box.maxY,
      };
      this.localZ = this.cling.plane + sign * pad;
      this.localX = Math.max(this.cling.minA, Math.min(this.cling.maxA, this.localX));
    }
    this.yaw = Math.atan2(this.cling.axis === "x" ? this.cling.sign : 0, this.cling.axis === "z" ? this.cling.sign : 0);
    this.vy = 0;
    this.pitch = Math.max(-0.6, Math.min(0.45, this.pitch));
    this.localY = Math.max(0, Math.min(this.localY, this.clingFeetMax(this.cling.maxY)));
    return true;
  }

  stepSpectate(dt: number, keys: Set<string>) {
    this.euler.set(this.specPitch, this.specYaw, 0, "YXZ");
    this.forward.set(0, 0, -1).applyEuler(this.euler);
    this.right.set(1, 0, 0).applyEuler(this.euler);
    this.wish.set(0, 0, 0);
    if (keys.has("w") || keys.has("arrowup")) this.wish.add(this.forward);
    if (keys.has("s") || keys.has("arrowdown")) this.wish.sub(this.forward);
    if (keys.has("d") || keys.has("arrowright")) this.wish.add(this.right);
    if (keys.has("a") || keys.has("arrowleft")) this.wish.sub(this.right);
    const up = (keys.has("e") || keys.has(" ") ? 1 : 0) - (keys.has("q") || keys.has("control") ? 1 : 0);
    if (this.wish.lengthSq() > 0) this.wish.normalize();
    const speed = (keys.has("shift") ? 22 : 14) * dt;
    this.specX += this.wish.x * speed;
    this.specY += this.wish.y * speed + up * speed;
    this.specZ += this.wish.z * speed;
    this.specX = Math.max(1, Math.min(this.map.w - 1, this.specX));
    this.specZ = Math.max(1, Math.min(this.map.d - 1, this.specZ));
    this.specY = Math.max(0.6, Math.min(this.map.ceiling - 0.4, this.specY));
  }

  stepLocal(
    dt: number,
    input: WorldInput,
    canMove: boolean,
    pose: Pose,
    ghost = false,
  ) {
    const boxes = ghost ? [] : this.colliders;
    const bounds = { w: this.map.w, d: this.map.d };
    if (ghost && this.cling) this.cling = null;
    const k0 = input.keys;
    this.crouching = k0.has("control") && !this.cling && !input.paintOpen;
    const r = poseRadius(this.cling ? "stick" : this.crouching ? "crouch" : pose);
    const h = poseHeight(this.cling ? "stick" : this.crouching ? "crouch" : pose);
    const feet = this.localY;
    const head = this.localY + h;
    if (!this.cling) {
      const freed = resolveStuck(this.localX, this.localZ, r, boxes, bounds, feet, head);
      this.localX = freed.x;
      this.localZ = freed.z;
    }
    if (!canMove) return { x: this.localX, z: this.localZ, yaw: this.yaw };

    const k = input.keys;
    if (this.cling) {
      this.stepCling(dt, k, r);
      return { x: this.localX, z: this.localZ, yaw: this.yaw };
    }

    this.euler.set(0, this.yaw, 0, "YXZ");
    this.forward.set(0, 0, -1).applyEuler(this.euler);
    this.right.set(1, 0, 0).applyEuler(this.euler);
    this.forward.y = 0;
    this.right.y = 0;
    this.forward.normalize();
    this.right.normalize();

    this.wish.set(0, 0, 0);
    if (k.has("w") || k.has("arrowup")) this.wish.add(this.forward);
    if (k.has("s") || k.has("arrowdown")) this.wish.sub(this.forward);
    if (k.has("d") || k.has("arrowright")) this.wish.add(this.right);
    if (k.has("a") || k.has("arrowleft")) this.wish.sub(this.right);

    if (this.wish.lengthSq() > 0) {
      this.wish.normalize();
      let speed = PLAYER_SPEED;
      if (k.has("shift")) speed = RUN_SPEED;
      if (this.crouching) speed = SNEAK_SPEED;
      if (input.paintOpen) speed = PAINT_SPEED;
      if (pose === "lie") speed *= 0.45;
      if (pose === "crouch" || pose === "sit") speed *= 0.72;
      if (ghost) speed *= 1.15;
      const dx = this.wish.x * speed * dt;
      const dz = this.wish.z * speed * dt;
      const moved = moveWithSlide(this.localX, this.localZ, dx, dz, r, boxes, bounds, feet, head);
      if (
        this.grounded &&
        Math.hypot(moved.x - this.localX, moved.z - this.localZ) < 0.0001 &&
        (Math.abs(dx) > 0.0001 || Math.abs(dz) > 0.0001)
      ) {
        const step = 0.42;
        if (!blocked(this.localX + dx, this.localZ + dz, r, boxes, bounds, feet + step, head + step)) {
          const up = moveWithSlide(this.localX, this.localZ, dx, dz, r, boxes, bounds, feet + step, head + step);
          this.localX = up.x;
          this.localZ = up.z;
          const landed = landOn(up.x, up.z, r, feet + step + 0.05, feet, boxes);
          if (landed !== null) this.localY = landed;
        }
      } else {
        this.localX = moved.x;
        this.localZ = moved.z;
      }
    }

    if (this.grounded && (k.has(" ") || k.has("space")) && !input.paintOpen) {
      const wall = nearestSurface(this.localX, this.localZ, boxes, 0.52);
      if (wall && wall.dist < 0.48 && this.tryCling(pose)) {
        this.stepCling(dt, k, poseRadius("stick"));
        return { x: this.localX, z: this.localZ, yaw: this.yaw };
      }
      this.vy = JUMP_SPEED;
      this.grounded = false;
    }
    this.vy -= GRAVITY * dt;
    const prevY = this.localY;
    this.localY += this.vy * dt;
    this.grounded = false;
    if (this.localY <= 0) {
      this.localY = 0;
      if (this.vy < 0) this.vy = 0;
      this.grounded = true;
    }
    if (this.vy <= 0.05) {
      const landed = landOn(this.localX, this.localZ, r, prevY, this.localY, boxes);
      if (landed !== null) {
        this.localY = landed;
        this.vy = 0;
        this.grounded = true;
      }
    } else {
      const bump = headHit(this.localX, this.localZ, r, prevY + h, this.localY + h, boxes);
      if (bump !== null) {
        this.localY = Math.max(0, bump - h - 0.02);
        this.vy = 0;
      }
    }
    const m = edgeMargin(r);
    this.localX = Math.max(m, Math.min(this.map.w - m, this.localX));
    this.localZ = Math.max(m, Math.min(this.map.d - m, this.localZ));
    return { x: this.localX, z: this.localZ, yaw: this.yaw };
  }

  setLocal(x: number, z: number, yaw?: number) {
    this.localX = x;
    this.localZ = z;
    this.localY = 0;
    this.vy = 0;
    this.cling = null;
    this.grounded = true;
    this.hunterTps = false;
    this.crouching = false;
    if (yaw !== undefined) this.yaw = yaw;
  }

  private stepCling(dt: number, keys: Set<string>, r: number) {
    const cling = this.cling;
    if (!cling) return;
    const nx = cling.axis === "x" ? cling.sign : 0;
    const nz = cling.axis === "z" ? cling.sign : 0;
    const pad = clingPad();
    if (keys.has("shift")) {
      this.localX += nx * 0.32;
      this.localZ += nz * 0.32;
      this.cling = null;
      this.grounded = this.localY <= 0.04;
      return;
    }
    let along = 0;
    if (keys.has("d") || keys.has("arrowright")) along += 1;
    if (keys.has("a") || keys.has("arrowleft")) along -= 1;
    let climb = 0;
    if (keys.has(" ") || keys.has("space") || keys.has("w") || keys.has("arrowup")) climb += 1;
    if (keys.has("control") || keys.has("s") || keys.has("arrowdown")) climb -= 1;
    if (climb < 0 && this.localY <= 0.03) {
      this.localX += nx * 0.32;
      this.localZ += nz * 0.32;
      this.cling = null;
      this.grounded = true;
      return;
    }
    const speed = (keys.has("shift") ? 2.4 : 5.2) * dt;
    const rx = nz;
    const rz = -nx;
    if (cling.axis === "x") {
      this.localZ = Math.max(cling.minA, Math.min(cling.maxA, this.localZ + rz * along * speed));
      this.localX = cling.plane + cling.sign * pad;
    } else {
      this.localX = Math.max(cling.minA, Math.min(cling.maxA, this.localX + rx * along * speed));
      this.localZ = cling.plane + cling.sign * pad;
    }
    this.localY = Math.max(0, Math.min(this.clingFeetMax(cling.maxY), this.localY + climb * speed));
    this.vy = 0;
    this.yaw = Math.atan2(nx, nz);
    const m = edgeMargin(r);
    this.localX = Math.max(m, Math.min(this.map.w - m, this.localX));
    this.localZ = Math.max(m, Math.min(this.map.d - m, this.localZ));
  }

  syncPlayers(
    snaps: PlayerSnap[],
    myId: string,
    room: RoomState,
    opts: { hideLocal?: boolean; localMoving?: boolean; dt?: number } = {},
  ) {
    const seen = new Set<string>();
    const self = snaps.find((p) => p.id === myId);
    const dt = opts.dt ?? 0.016;
    const now = Date.now();
    for (const p of snaps) {
      seen.add(p.id);
      let rig = this.players.get(p.id);
      if (!rig) {
        rig = createCharacter(p.name, p.id);
        this.players.set(p.id, rig);
        this.scene.add(rig.group);
      }
      const ghost =
        room.phase === "hunt" &&
        room.mode === "normal" &&
        room.caughtIds.includes(p.id) &&
        !isHunter(room, p.id);
      const show = canSee(room, self, p) && !(opts.hideLocal && p.id === myId);
      rig.group.visible = show;
      applyPaint(rig, p.fill || WHITE, p.blobs || []);
      if (rig.pose !== p.pose) applyPose(rig, p.pose);
      rig.visor.visible = isHunter(room, p.id) && room.phase !== "lobby" && !ghost;
      setNameVisible(
        rig,
        ghost || p.id === myId || room.phase !== "hunt" || isHunter(room, p.id),
      );
      setGhostLook(rig, ghost);
      const x = p.id === myId ? this.localX : p.x;
      const y = p.id === myId ? this.localY : p.y;
      const z = p.id === myId ? this.localZ : p.z;
      const yaw =
        p.id === myId
          ? this.watch
            ? this.bodyYaw
            : this.cling
              ? Math.atan2(this.cling.axis === "x" ? this.cling.sign : 0, this.cling.axis === "z" ? this.cling.sign : 0)
              : this.yaw
          : p.yaw;
      const prevX = rig.group.position.x;
      const prevZ = rig.group.position.z;
      if (p.id === myId) {
        rig.group.position.set(x, y, z);
        rig.group.rotation.y = yaw;
      } else {
        rig.group.position.x += (x - rig.group.position.x) * 0.28;
        rig.group.position.y += (y - rig.group.position.y) * 0.28;
        rig.group.position.z += (z - rig.group.position.z) * 0.28;
        rig.group.rotation.y = yaw;
      }
      const moving =
        (p.id === myId && !!opts.localMoving) ||
        Math.hypot(rig.group.position.x - prevX, rig.group.position.z - prevZ) > 0.012;
      if (p.shootSeq > rig.shootSeq) {
        rig.shootSeq = p.shootSeq;
        if (p.id !== myId) this.playShot(p.id, false);
      }
      const caughtT =
        room.lastTag && room.lastTag.id === p.id ? 1 - (now - room.lastTag.at) / 1800 : 0;
      animateCharacter(rig, {
        moving,
        ghost,
        caughtT,
        dt,
        hunter: isHunter(room, p.id) && room.phase !== "lobby",
        airborne: y > 0.08 && p.pose !== "stick",
      });
    }
    if (room.lastTag && room.lastTag.at !== this.seenTagAt) {
      this.seenTagAt = room.lastTag.at;
      const vic = snaps.find((p) => p.id === room.lastTag!.id);
      if (vic) {
        const vx = vic.id === myId ? this.localX : vic.x;
        const vy = vic.id === myId ? this.localY : vic.y;
        const vz = vic.id === myId ? this.localZ : vic.z;
        this.spawnKillFx(vx, vy, vz, room.lastTag.byName, room.lastTag.name);
      }
    }
    for (const [id, rig] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(rig.group);
        disposeObject(rig.group);
        this.players.delete(id);
      }
    }
  }

  updateCamera(opts: { paintOpen: boolean; hunterHide: boolean; fps?: boolean; moving?: boolean }) {
    if (this.watch) {
      this.fpGun.visible = false;
      this.camera.up.set(0, 1, 0);
      this.euler.set(this.specPitch, this.specYaw, 0, "YXZ");
      this.camera.quaternion.setFromEuler(this.euler);
      this.camera.rotation.set(this.specPitch, this.specYaw, 0, "YXZ");
      this.specY = Math.min(this.specY, this.map.ceiling - 0.5);
      this.camera.position.set(this.specX, this.specY, this.specZ);
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();
      return;
    }
    this.euler.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(this.euler);
    if (opts.hunterHide) {
      this.fpGun.visible = false;
      this.camera.position.set(this.map.w / 2, 8, this.map.d / 2);
      this.camera.lookAt(this.map.w / 2, 0, this.map.d / 2);
      return;
    }
    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    if (opts.fps && !this.hunterTps) {
      this.viewBob += opts.moving ? 0.26 : 0.05;
      const bob = opts.moving ? Math.sin(this.viewBob) * 0.028 : 0;
      this.camEye.set(this.localX, (this.crouching ? 1.08 : 1.58) + this.localY + bob, this.localZ);
      this.camEye.y = Math.min(this.camEye.y, this.map.ceiling - 0.3);
      this.camera.position.copy(this.camEye);
      this.camRay.set(this.camEye, this.forward);
      this.camRay.near = 0.02;
      this.camRay.far = 0.42;
      const wallHit = this.camRay.intersectObjects(this.camBlockers, false)[0];
      if (wallHit && wallHit.distance < 0.28) {
        this.camera.position.addScaledVector(this.forward, wallHit.distance - 0.28);
      }
      this.camera.fov = 78;
      this.fpKick *= 0.78;
      const kick = this.fpKick;
      this.fpGun.visible = true;
      this.fpGun.position.set(0.27 + kick * 0.02, -0.22 + bob * 0.35 + kick * 0.05, -0.42 + kick * 0.12);
      this.fpGun.rotation.set(0.07 + kick * 0.38, 0.1, 0.05);
      const flash = this.fpMuzzle.material as THREE.MeshBasicMaterial;
      flash.opacity = kick * 0.9;
      this.fpMuzzle.scale.setScalar(0.8 + kick * 1.6);
      this.camera.position.y = Math.min(this.camera.position.y, this.map.ceiling - 0.28);
      this.camera.updateProjectionMatrix();
      return;
    }
    this.fpGun.visible = false;
    this.camera.fov = 70;
    const want = opts.paintOpen ? 2.4 : 4.0;
    this.camEye.set(this.localX, (this.crouching ? 1.05 : 1.48) + this.localY, this.localZ);
    this.camEye.y = Math.min(this.camEye.y, this.map.ceiling - 0.3);
    this.camPos.copy(this.camEye).addScaledVector(this.forward, -want);
    this.camPos.y = Math.max(0.55, this.camPos.y);
    this.camDir.copy(this.camPos).sub(this.camEye);
    const maxDist = this.camDir.length();
    if (maxDist > 0.001) {
      this.camDir.multiplyScalar(1 / maxDist);
      this.camRay.set(this.camEye, this.camDir);
      this.camRay.near = 0.05;
      this.camRay.far = maxDist;
      const hit = this.camRay.intersectObjects(this.camBlockers, false)[0];
      const dist = hit ? Math.max(0.42, hit.distance - 0.22) : maxDist;
      this.camera.position.copy(this.camEye).addScaledVector(this.camDir, dist);
    } else {
      this.camera.position.copy(this.camEye);
    }
    this.camera.position.y = Math.max(0.42, Math.min(this.map.ceiling - 0.28, this.camera.position.y));
    this.camera.updateProjectionMatrix();
  }

  private spawnKillFx(x: number, y: number, z: number, killer: string, victim: string) {
    const g = new THREE.Group();
    g.position.set(x, y + 0.15, z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.5, 28),
      new THREE.MeshBasicMaterial({
        color: 0xff4d6d,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 14, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffe7a8,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    ball.position.y = 1.05;
    const spr = makeKillSprite(`${killer}  처치  ${victim}`);
    spr.position.y = 2.15;
    g.add(ring, ball, spr);
    this.scene.add(g);
    this.killFx.push({ group: g, start: Date.now(), until: Date.now() + 1800 });
  }

  private tickKillFx() {
    const now = Date.now();
    this.killFx = this.killFx.filter((fx) => {
      const t = Math.min(1, (now - fx.start) / 1800);
      const ring = fx.group.children[0] as THREE.Mesh;
      const ball = fx.group.children[1] as THREE.Mesh;
      const spr = fx.group.children[2] as THREE.Sprite;
      ring.scale.setScalar(1 + t * 5.5);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t);
      ball.scale.setScalar(1 + t * 2.2);
      (ball.material as THREE.MeshBasicMaterial).opacity = 0.75 * Math.max(0, 1 - t * 1.6);
      spr.position.y = 2.15 + t * 0.9;
      (spr.material as THREE.SpriteMaterial).opacity = 1 - t;
      if (now >= fx.until) {
        this.scene.remove(fx.group);
        disposeObject(fx.group);
        return false;
      }
      return true;
    });
  }

  playShot(hunterId: string, recoil = false) {
    const rig = this.players.get(hunterId);
    if (rig) rig.shootUntil = Date.now() + 200;
    if (recoil && this.fpGun.visible) {
      this.fpKick = 1;
      this.fpMuzzle.updateMatrixWorld();
      this.fpMuzzle.getWorldPosition(this.muzzleWorld);
      this.camera.getWorldDirection(this.forward);
      this.pitch = Math.max(-1.4, this.pitch - 0.048);
    } else if (rig) {
      rig.muzzle.updateMatrixWorld();
      rig.muzzle.getWorldPosition(this.muzzleWorld);
      if (recoil) {
        this.camera.getWorldDirection(this.forward);
        this.pitch = Math.max(-1.4, this.pitch - 0.05);
      } else {
        this.forward.set(0, 0, -1).applyQuaternion(rig.group.quaternion);
      }
    } else {
      return;
    }
    this.tracerEnd.copy(this.muzzleWorld).addScaledVector(this.forward, 24);
    const geo = new THREE.BufferGeometry().setFromPoints([
      this.muzzleWorld.clone(),
      this.tracerEnd.clone(),
    ]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, until: Date.now() + 130 });
  }

  private tickTracers() {
    const now = Date.now();
    this.tracers = this.tracers.filter((t) => {
      const left = t.until - now;
      const mat = t.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, left / 130);
      if (left <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        mat.dispose();
        return false;
      }
      return true;
    });
  }

  render() {
    this.tickTracers();
    this.tickKillFx();
    this.renderer.render(this.scene, this.camera);
  }

  sampleWorld(clientX: number, clientY: number): string | null {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.mapGroup.children, true);
    const hit = hits.find((h) => (h.object as THREE.Mesh).isMesh);
    if (!hit) return null;
    const mesh = hit.object as THREE.Mesh;
    const canvas = mesh.userData.canvas as HTMLCanvasElement | undefined;
    if (canvas && hit.uv) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(hit.uv.x * canvas.width)));
        const y = Math.max(
          0,
          Math.min(canvas.height - 1, Math.floor((1 - hit.uv.y) * canvas.height)),
        );
        const d = ctx.getImageData(x, y, 1, 1).data;
        return rgbToHex(d[0], d[1], d[2]);
      }
    }
    return (mesh.userData.color as string) || null;
  }

  paintSelf(clientX: number, clientY: number, color: string, brush: number, myId: string): PaintBlob | null {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const rig = this.players.get(myId);
    if (!rig) return null;
    const hits = this.raycaster.intersectObject(rig.body, true);
    const hit = hits.find((h) => h.uv && (h.object as THREE.Mesh).userData?.part);
    if (!hit?.uv) return null;
    const part = hit.object.userData.part as BodyPart;
    return uvPaint(rig, hit.uv.x, hit.uv.y, brush / 220, color, part);
  }

  paintDrag(
    clientX: number,
    clientY: number,
    color: string,
    brush: number,
    myId: string,
    blobs: PaintBlob[],
    dragging: boolean,
  ): PaintBlob[] | null {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const rig = this.players.get(myId);
    if (!rig) return null;
    const hits = this.raycaster.intersectObject(rig.body, true);
    const hit = hits.find((h) => h.uv && (h.object as THREE.Mesh).userData?.part);
    if (!hit?.uv) return null;
    const part = hit.object.userData.part as BodyPart;
    return extendPaint(rig, blobs, hit.uv.x, hit.uv.y, brush / 220, color, part, dragging);
  }

  aimPlayer(
    myId: string,
    clientX?: number,
    clientY?: number,
  ): { id: string; dist: number } | null {
    const meshes: THREE.Object3D[] = [];
    for (const [id, rig] of this.players) {
      if (id === myId || !rig.group.visible) continue;
      meshes.push(rig.body);
    }
    const pick = (nx: number, ny: number) => {
      this.pointer.set(nx, ny);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(meshes, true)[0];
      if (!hit) return null;
      const id = (hit.object.userData.playerId as string | undefined) ?? undefined;
      if (!id || id === myId) return null;
      return { id, dist: hit.distance };
    };

    if (clientX !== undefined && clientY !== undefined) {
      this.setPointer(clientX, clientY);
      const clicked = pick(this.pointer.x, this.pointer.y);
      if (clicked) return clicked;
    }
    const centered = pick(0, 0);
    if (centered) return centered;

    this.camera.getWorldDirection(this.forward);
    let best: { id: string; dist: number } | null = null;
    let bestDot = 0.88;
    for (const [id, rig] of this.players) {
      if (id === myId || !rig.group.visible) continue;
      const dx = rig.group.position.x - this.camera.position.x;
      const dy = rig.group.position.y + 1.05 - this.camera.position.y;
      const dz = rig.group.position.z - this.camera.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.35 || dist > 9.5) continue;
      const inv = 1 / dist;
      const dot = this.forward.x * dx * inv + this.forward.y * dy * inv + this.forward.z * dz * inv;
      if (dot > bestDot) {
        bestDot = dot;
        best = { id, dist };
      }
    }
    return best;
  }

  private setPointer(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.pointer.x = ((clientX - rect.left) / w) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / h) * 2 + 1;
  }

  dispose() {
    for (const rig of this.players.values()) {
      this.scene.remove(rig.group);
      disposeObject(rig.group);
    }
    this.players.clear();
    for (const fx of this.killFx) {
      this.scene.remove(fx.group);
      disposeObject(fx.group);
    }
    this.killFx = [];
    this.camera.remove(this.fpGun);
    disposeObject(this.fpGun);
    disposeObject(this.mapGroup);
    this.renderer.dispose();
  }
}

function clingPad() {
  // The stick pose is scaled to 0.08 on its local depth axis (0.22 * 0.08).
  // Keep the body surface on the wall face instead of leaving a visible gap.
  return 0.018;
}

function clingVisualFace(box: Collider, axis: "x" | "z", sign: number) {
  const face = axis === "x" ? (sign > 0 ? box.maxX : box.minX) : sign > 0 ? box.maxZ : box.minZ;
  // Colliders are inset by BOX_COLLIDE_OUTSET for normal movement. Clinging
  // needs the rendered mesh face, so restore that inset before positioning.
  return face + sign * BOX_COLLIDE_OUTSET;
}

function makeDoor(def: DoorDef) {
  const pivot = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.62, metalness: 0.08 });
  const trim = new THREE.MeshStandardMaterial({ color: "#c9a227", roughness: 0.4, metalness: 0.45 });
  if (def.along === "z") {
    pivot.position.set(def.x, 0, def.z - def.w / 2);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(def.d, def.h, def.w), wood);
    leaf.position.set(0, def.h / 2, def.w / 2);
    leaf.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), trim);
    knob.position.set(def.d * 0.6, def.h * 0.48, def.w * 0.78);
    leaf.add(knob);
    pivot.add(leaf);
    return { pivot, leaf };
  }
  pivot.position.set(def.x - def.w / 2, 0, def.z);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), wood);
  leaf.position.set(def.w / 2, def.h / 2, 0);
  leaf.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), trim);
  knob.position.set(def.w * 0.78, def.h * 0.48, def.d * 0.6);
  leaf.add(knob);
  pivot.add(leaf);
  return { pivot, leaf };
}

function makeKillSprite(text: string) {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 640, 96);
  g.font = "700 34px sans-serif";
  g.textAlign = "center";
  g.lineWidth = 8;
  g.strokeStyle = "rgba(0,0,0,0.75)";
  g.fillStyle = "#ffe4ec";
  g.strokeText(text, 320, 58);
  g.fillText(text, 320, 58);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(2.6, 0.4, 1);
  return spr;
}

function canvasTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

function canSee(room: RoomState, self: PlayerSnap | undefined, other: PlayerSnap) {
  if (!self) return true;
  if (other.id === self.id) return true;
  if (room.phase === "lobby" || room.phase === "reveal" || room.phase === "result") return true;
  if (isHunter(room, self.id) || !hiderAlive(room, self.id)) return true;
  if (room.phase === "hide") return !isHunter(room, other.id);
  if (isHunter(room, other.id)) return true;
  if (room.mode === "normal" && room.caughtIds.includes(other.id)) return true;
  return false;
}
