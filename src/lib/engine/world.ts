import * as THREE from "three";
import { LOOK_SENS, PAINT_SPEED, PLAYER_SPEED, SNEAK_SPEED, WHITE } from "../config";
import { getMap, mapColliders } from "../maps";
import type { BodyPart, Collider, GameMap, PaintBlob, PlayerSnap, Pose, RoomState } from "../types";
import { hiderAlive, isHunter } from "../round";
import { moveWithSlide, poseRadius, resolveStuck } from "./collision";
import {
  animateCharacter,
  applyPaint,
  applyPose,
  createCharacter,
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
  map!: GameMap;
  yaw = 0;
  pitch = 0;
  localX = 4;
  localZ = 4;
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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.12, 700);
    this.camera.rotation.order = "YXZ";
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
    this.colliders = mapColliders(map);
    this.sampleCanvases = [];
    this.camBlockers = [];
    while (this.mapGroup.children.length) {
      const ch = this.mapGroup.children[0];
      this.mapGroup.remove(ch);
      disposeObject(ch);
    }

    this.scene.background = new THREE.Color(map.fog);
    this.scene.fog = new THREE.FogExp2(map.fog, 0.0045);

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
      new THREE.MeshStandardMaterial({ color: "#d9cbb8", roughness: 1 }),
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(map.w / 2, map.ceiling, map.d / 2);
    this.mapGroup.add(ceil);
    this.camBlockers.push(ceil);

    for (const b of map.boxes) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      let mat: THREE.MeshStandardMaterial;
      if (b.pattern && b.pattern !== "solid") {
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
  }

  lookDelta(dx: number, dy: number) {
    const lim = Math.PI / 2 - 0.04;
    if (this.watch) {
      this.specYaw -= dx * LOOK_SENS;
      this.specPitch = Math.max(-lim, Math.min(lim, this.specPitch - dy * LOOK_SENS));
      return;
    }
    this.yaw -= dx * LOOK_SENS;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch - dy * LOOK_SENS));
  }

  toggleWatch() {
    if (this.watch) {
      this.watch = false;
      this.yaw = this.bodyYaw;
      return false;
    }
    this.watch = true;
    this.bodyYaw = this.yaw;
    this.specYaw = this.yaw;
    this.specPitch = this.pitch;
    this.specX = this.camera.position.x;
    this.specY = Math.max(1.2, this.camera.position.y);
    this.specZ = this.camera.position.z;
    return true;
  }

  exitWatch() {
    if (!this.watch) return;
    this.watch = false;
    this.yaw = this.bodyYaw;
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
    const r = poseRadius(pose);
    const freed = resolveStuck(this.localX, this.localZ, r, boxes, bounds);
    this.localX = freed.x;
    this.localZ = freed.z;
    if (!canMove) return { x: this.localX, z: this.localZ, yaw: this.yaw };

    this.euler.set(0, this.yaw, 0, "YXZ");
    this.forward.set(0, 0, -1).applyEuler(this.euler);
    this.right.set(1, 0, 0).applyEuler(this.euler);
    this.forward.y = 0;
    this.right.y = 0;
    this.forward.normalize();
    this.right.normalize();

    this.wish.set(0, 0, 0);
    const k = input.keys;
    if (k.has("w") || k.has("arrowup")) this.wish.add(this.forward);
    if (k.has("s") || k.has("arrowdown")) this.wish.sub(this.forward);
    if (k.has("d") || k.has("arrowright")) this.wish.add(this.right);
    if (k.has("a") || k.has("arrowleft")) this.wish.sub(this.right);

    if (this.wish.lengthSq() > 0) {
      this.wish.normalize();
      let speed = PLAYER_SPEED;
      if (k.has("shift")) speed = SNEAK_SPEED;
      if (input.paintOpen) speed = PAINT_SPEED;
      if (pose === "lie") speed *= 0.45;
      if (pose === "crouch" || pose === "sit") speed *= 0.72;
      if (ghost) speed *= 1.15;
      const moved = moveWithSlide(
        this.localX,
        this.localZ,
        this.wish.x * speed * dt,
        this.wish.z * speed * dt,
        r,
        boxes,
        bounds,
      );
      this.localX = moved.x;
      this.localZ = moved.z;
    }
    return { x: this.localX, z: this.localZ, yaw: this.yaw };
  }

  setLocal(x: number, z: number, yaw?: number) {
    this.localX = x;
    this.localZ = z;
    if (yaw !== undefined) this.yaw = yaw;
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
      const z = p.id === myId ? this.localZ : p.z;
      const yaw = p.id === myId ? (this.watch ? this.bodyYaw : this.yaw) : p.yaw;
      const prevX = rig.group.position.x;
      const prevZ = rig.group.position.z;
      if (p.id === myId) {
        rig.group.position.set(x, 0, z);
        rig.group.rotation.y = yaw;
      } else {
        rig.group.position.x += (x - rig.group.position.x) * 0.28;
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
        room.lastTag && room.lastTag.id === p.id ? 1 - (now - room.lastTag.at) / 900 : 0;
      animateCharacter(rig, {
        moving,
        ghost,
        caughtT,
        dt,
        hunter: isHunter(room, p.id) && room.phase !== "lobby",
      });
    }
    for (const [id, rig] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(rig.group);
        disposeObject(rig.group);
        this.players.delete(id);
      }
    }
  }

  updateCamera(opts: { paintOpen: boolean; hunterHide: boolean }) {
    if (this.watch) {
      this.euler.set(this.specPitch, this.specYaw, 0, "YXZ");
      this.camera.quaternion.setFromEuler(this.euler);
      this.camera.position.set(this.specX, this.specY, this.specZ);
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();
      return;
    }
    this.euler.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(this.euler);
    if (opts.hunterHide) {
      this.camera.position.set(this.map.w / 2, 8, this.map.d / 2);
      this.camera.lookAt(this.map.w / 2, 0, this.map.d / 2);
      return;
    }
    this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.camera.fov = 70;
    const want = opts.paintOpen ? 2.4 : 4.0;
    this.camEye.set(this.localX, 1.48, this.localZ);
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
    this.camera.position.y = Math.max(0.42, this.camera.position.y);
    this.camera.updateProjectionMatrix();
  }

  playShot(hunterId: string, recoil = false) {
    const rig = this.players.get(hunterId);
    if (!rig) return;
    rig.shootUntil = Date.now() + 200;
    rig.muzzle.updateMatrixWorld();
    rig.muzzle.getWorldPosition(this.muzzleWorld);
    if (recoil) {
      this.camera.getWorldDirection(this.forward);
      this.pitch = Math.max(-1.4, this.pitch - 0.05);
    } else {
      this.forward.set(0, 0, -1).applyQuaternion(rig.group.quaternion);
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
    if (recoil) this.pitch = Math.max(-1.4, this.pitch - 0.05);
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
    disposeObject(this.mapGroup);
    this.renderer.dispose();
  }
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
  if (room.phase === "lobby" || room.phase === "result") return true;
  if (isHunter(room, self.id) || !hiderAlive(room, self.id)) return true;
  if (room.phase === "hide") return !isHunter(room, other.id);
  if (isHunter(room, other.id)) return true;
  if (room.mode === "normal" && room.caughtIds.includes(other.id)) return true;
  return false;
}


