import * as THREE from "three";
import { PAINT_SPEED, PLAYER_SPEED, SNEAK_SPEED, WHITE } from "../config";
import { getMap, mapColliders } from "../maps";
import type { Collider, GameMap, PaintBlob, PlayerSnap, Pose, RoomState } from "../types";
import { hiderAlive, isHunter } from "../round";
import { moveWithSlide, poseRadius } from "./collision";
import {
  applyPaint,
  applyPose,
  createCharacter,
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
  pitch = 0.18;
  localX = 4;
  localZ = 4;
  sampleCanvases: { mesh: THREE.Mesh; canvas: HTMLCanvasElement }[] = [];
  private clockTarget = new THREE.Vector3();
  private spherical = new THREE.Spherical();

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
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.08, 120);
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
    while (this.mapGroup.children.length) {
      const ch = this.mapGroup.children[0];
      this.mapGroup.remove(ch);
      disposeObject(ch);
    }

    this.scene.background = new THREE.Color(map.fog);
    this.scene.fog = new THREE.FogExp2(map.fog, 0.045);

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

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(map.w, map.d),
      new THREE.MeshStandardMaterial({ color: "#d9cbb8", roughness: 1 }),
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(map.w / 2, map.ceiling, map.d / 2);
    this.mapGroup.add(ceil);

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
      } else {
        mat = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.78 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x, b.y, b.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.color = b.color;
        this.mapGroup.add(mesh);
      }
    }
  }

  lookDelta(dx: number, dy: number) {
    this.yaw -= dx * 0.0022;
    this.pitch = Math.max(-0.9, Math.min(0.85, this.pitch - dy * 0.0022));
  }

  stepLocal(
    dt: number,
    input: WorldInput,
    canMove: boolean,
    pose: Pose,
  ) {
    if (document.pointerLockElement === this.renderer.domElement) {
      // yaw already updated via mousemove
    }
    if (!canMove) return { x: this.localX, z: this.localZ, yaw: this.yaw };

    let ix = 0;
    let iz = 0;
    const k = input.keys;
    if (k.has("w") || k.has("arrowup")) iz -= 1;
    if (k.has("s") || k.has("arrowdown")) iz += 1;
    if (k.has("a") || k.has("arrowleft")) ix -= 1;
    if (k.has("d") || k.has("arrowright")) ix += 1;
    const mag = Math.hypot(ix, iz);
    if (mag > 0) {
      ix /= mag;
      iz /= mag;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const fx = ix * cos + iz * sin;
      const fz = iz * cos - ix * sin;
      let speed = PLAYER_SPEED;
      if (k.has("shift")) speed = SNEAK_SPEED;
      if (input.paintOpen) speed = PAINT_SPEED;
      if (pose === "lie") speed *= 0.45;
      if (pose === "crouch" || pose === "sit") speed *= 0.72;
      const r = poseRadius(pose);
      const moved = moveWithSlide(
        this.localX,
        this.localZ,
        fx * speed * dt,
        fz * speed * dt,
        r,
        this.colliders,
        { w: this.map.w, d: this.map.d },
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

  syncPlayers(snaps: PlayerSnap[], myId: string, room: RoomState) {
    const seen = new Set<string>();
    const self = snaps.find((p) => p.id === myId);
    for (const p of snaps) {
      seen.add(p.id);
      let rig = this.players.get(p.id);
      if (!rig) {
        rig = createCharacter(p.name, p.id);
        this.players.set(p.id, rig);
        this.scene.add(rig.group);
      }
      const show = canSee(room, self, p);
      rig.group.visible = show;
      applyPaint(rig, p.fill || WHITE, p.blobs || []);
      applyPose(rig, p.pose);
      rig.visor.visible = isHunter(room, p.id) && room.phase !== "lobby";
      setNameVisible(
        rig,
        p.id === myId || room.phase !== "hunt" || isHunter(room, p.id),
      );
      const x = p.id === myId ? this.localX : p.x;
      const z = p.id === myId ? this.localZ : p.z;
      const yaw = p.id === myId ? this.yaw : p.yaw;
      if (p.id === myId) {
        rig.group.position.set(x, 0, z);
        rig.group.rotation.y = yaw;
      } else {
        rig.group.position.x += (x - rig.group.position.x) * 0.25;
        rig.group.position.z += (z - rig.group.position.z) * 0.25;
        rig.group.rotation.y = yaw;
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

  updateCamera(paintOpen: boolean, hunterHide: boolean) {
    const target = this.clockTarget.set(this.localX, 1.25, this.localZ);
    const dist = paintOpen ? 3.1 : 4.8;
    this.spherical.set(dist, Math.PI / 2 - this.pitch, this.yaw);
    const pos = new THREE.Vector3().setFromSpherical(this.spherical).add(target);
    pos.y = Math.max(0.35, pos.y);
    if (hunterHide) {
      this.camera.position.set(this.map.w / 2, 8, this.map.d / 2);
      this.camera.lookAt(this.map.w / 2, 0, this.map.d / 2);
      return;
    }
    this.camera.position.lerp(pos, 0.18);
    this.camera.lookAt(target);
  }

  render() {
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
    const hit = hits.find((h) => h.uv);
    if (!hit?.uv) return null;
    return uvPaint(rig, hit.uv.x, hit.uv.y, brush / 220, color);
  }

  aimPlayer(myId: string): { id: string; dist: number } | null {
    this.pointer.set(0, 0);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const [id, rig] of this.players) {
      if (id === myId) continue;
      meshes.push(rig.body);
    }
    const hits = this.raycaster.intersectObjects(meshes, true);
    const hit = hits[0];
    if (!hit) return null;
    const id = hit.object.userData.playerId as string | undefined;
    if (!id) return null;
    return { id, dist: hit.distance };
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
  return false;
}


