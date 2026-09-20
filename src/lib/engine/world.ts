import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GRAVITY, JUMP_SPEED, LOOK_SENS, PAINT_SPEED, PLAYER_SPEED, RUN_SPEED, SNEAK_SPEED, WHITE } from "../config";
import { BOX_COLLIDE_OUTSET, doorColliders, getMap, mapColliders } from "../maps";
import type { BodyPart, BoxDef, Collider, DoorDef, GameMap, PaintBlob, PlayerSnap, Pose, PropKind, RoomState } from "../types";
import { hiderAlive, isGhost, isHunter } from "../round";
import { BODY_SCALE, effectiveBodySize, type BodySize } from "../types";
import { lightLevelAt } from "../camouflage";
import { ceilingAt } from "../ceiling";
import {
  blocked,
  blockedByBoxes,
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
  applyBodySize,
  applyFinish,
  applyPaint,
  applyPose,
  createCharacter,
  createViewGun,
  extendPaint,
  setCamouflageLook,
  setGhostLook,
  setNameVisible,
  uvPaint,
  type CharacterRig,
} from "./character";
import { makePatternCanvas, rgbToHex } from "./textures";
import { hunterVisibility } from "../camouflage";

/** Desktop quality ladder walked by adaptQuality(); the first entry is the default. */
const QUALITY_STEPS: { pixelRatio: number; shadows: boolean }[] = [
  { pixelRatio: 1.5, shadows: true },
  { pixelRatio: 1.25, shadows: true },
  { pixelRatio: 1, shadows: true },
  { pixelRatio: 1, shadows: false },
];
const QUALITY_SAMPLE_FRAMES = 90;
const ROAMING_LIGHTS = 3;
const KILL_FX_MS = 2400;
const KILL_DROPS = 28;
/** How far (surface distance) a wall may be for Space / the stick pose to snap onto it. */
const CLING_REACH = 0.7;
const QUALITY_SLOW_FRAME_MS = 20;
const SHADOW_REFRESH_EVERY = 2;

const LOCAL_PROP_MODELS: Partial<Record<PropKind, string>> = {
  sofa: "/models/lobby-sofa-cc0.glb",
  armchair: "/models/lobby-armchair-cc0.glb",
  coffeeTable: "/models/lobby-coffee-table-cc0.glb",
  floorLamp: "/models/floor-lamp-cc0.glb",
  plant: "/models/lobby-planter-cc0.glb",
};

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
  private playerVisibility = new Map<string, number>();
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
    box: Collider;
  } | null = null;
  /** Local player's body size; scales collision radius, height and camera eye height. */
  bodySize: BodySize = "normal";
  /** Hunter the spectator camera is riding along with, if any. */
  private followId: string | null = null;
  /** Space attached us to the wall; ignore it for detaching until released. */
  private clingSpaceLatch = false;
  /** Last position verified free of colliders; used to undo a push-through. */
  private lastFreeX = 4;
  private lastFreeZ = 4;
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
  private remoteStuckSince = new Map<string, number>();
  private camSide = new THREE.Vector3();
  private camProbe = new THREE.Vector3();
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
  private killFx: {
    group: THREE.Group;
    start: number;
    until: number;
    /** Paint droplets flung out of the caught body; each carries its own velocity. */
    drops: { mesh: THREE.Mesh; v: THREE.Vector3 }[];
    splat: THREE.Sprite;
  }[] = [];
  private shakeUntil = 0;
  private shakeAmp = 0;
  private seenTagAt = 0;
  private fpGun: THREE.Group;
  private fpMuzzle: THREE.Mesh;
  private fpKick = 0;
  private viewBob = 0;
  private reducedMotion = false;
  private isMobile = false;
  private textureLoader = new THREE.TextureLoader();
  private imageTextures = new Map<string, THREE.Texture>();
  private modelLoader = new GLTFLoader();
  private modelTemplates = new Map<string, Promise<THREE.Group>>();
  private mapLoadSeq = 0;
  private modelStats = { pending: 0, loaded: 0, failed: 0 };
  private roamingLights: { point: THREE.PointLight; index: number }[] = [];
  private fixtureLights: { x: number; y: number; z: number; color: string; intensity: number; distance: number }[] = [];
  private roamClock = 0;
  /** Rolling average frame time from the last quality window, for the ?stats overlay. */
  private lastAverageMs = 0;
  /** Adaptive quality: index into QUALITY_STEPS, only ever stepped down when frames run long. */
  private qualityStep = 0;
  private frameClock = 0;
  private frameAccum = 0;
  private frameCount = 0;
  private shadowFrame = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.isMobile = window.matchMedia("(max-width: 767px), (pointer: coarse) and (hover: none)").matches;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // MSAA on top of a ≥1.5 device pixel ratio is nearly invisible and costs a lot of fill.
      antialias: !this.isMobile && (window.devicePixelRatio || 1) < 1.5,
      alpha: false,
      powerPreference: "high-performance",
    });
    // iPhones often report a 2–3x device pixel ratio. Rendering the full
    // framebuffer at that density makes the WebGL tab far more likely to be
    // evicted when the map, furniture, and player paint textures are loaded.
    this.renderer.setPixelRatio(Math.min(this.isMobile ? 1 : QUALITY_STEPS[0].pixelRatio, window.devicePixelRatio || 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = !this.isMobile;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Static geometry dominates the shadow pass; refreshing it every other frame is invisible and halves its cost.
    this.renderer.shadowMap.autoUpdate = false;
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

  assetStatus() {
    return { ...this.modelStats };
  }

  loadMap(id: string) {
    const map = getMap(id);
    const loadSeq = ++this.mapLoadSeq;
    this.map = map;
    this.modelStats = { pending: 0, loaded: 0, failed: 0 };
    this.sampleCanvases = [];
    this.camBlockers = [];
    while (this.mapGroup.children.length) {
      const ch = this.mapGroup.children[0];
      this.mapGroup.remove(ch);
      disposeObject(ch);
    }

    this.scene.background = new THREE.Color(map.sky ? map.sky.horizon : map.fog);
    this.scene.fog = new THREE.FogExp2(map.sky ? map.sky.horizon : map.fog, map.kind === "outdoor" ? 0.0035 : 0.0072);
    this.cling = null;
    this.grounded = true;
    this.doorPass.clear();

    const preset = LIGHTING_PRESETS[map.lighting ?? "day"];
    const hemi = new THREE.HemisphereLight(preset.skyColor, preset.groundColor, preset.hemi);
    const sun = new THREE.DirectionalLight(map.sky?.sun.color ?? preset.sunColor, map.sky?.sun.intensity ?? preset.sun);
    // Aim the sun at the arena centre and size its shadow frustum to the map so
    // larger (harder) arenas keep shadows in every corner.
    const half = Math.max(map.w, map.d) * 0.5 + 4;
    if (map.sky) {
      const az = map.sky.sun.azimuth;
      const el = map.sky.sun.elevation;
      const reach = half * 1.6;
      sun.position.set(map.w / 2 + Math.cos(az) * Math.cos(el) * reach, Math.sin(el) * reach, map.d / 2 + Math.sin(az) * Math.cos(el) * reach);
    } else {
      sun.position.set(map.w / 2 + 8, 14 + half * 0.4, map.d / 2 + 6);
    }
    sun.target.position.set(map.w / 2, 0, map.d / 2);
    this.mapGroup.add(sun.target);
    sun.castShadow = !this.isMobile;
    const shadowMapSize = this.isMobile ? 512 : 1024;
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40 + half * 2;
    sun.shadow.camera.left = -half;
    sun.shadow.camera.right = half;
    sun.shadow.camera.top = half;
    sun.shadow.camera.bottom = -half;
    this.mapGroup.add(hemi, sun);

    const accentColor = map.id === "sewer" ? "#65c8ba" : map.id === "backrooms" ? "#fff0a3" : "#ffd1a1";
    // One fill light per map; per-room light comes from the roaming fixture lights below.
    const accentPoints = [{ x: map.w * 0.5, z: map.d * 0.42 }];
    for (const point of accentPoints) {
      const accent = new THREE.PointLight(accentColor, this.isMobile ? 0.42 : 0.72, Math.max(map.w, map.d) * 0.62, 2);
      accent.position.set(point.x, map.ceiling * 0.68, point.z);
      this.mapGroup.add(accent);
    }

    const floorTex = map.floorTexture
      ? this.loadImageTexture(map.floorTexture, map.w / 4, map.d / 4)
      : canvasTexture(
          makePatternCanvas(map.floorPattern ?? "wood", map.floor, [map.floor, map.floorPattern ? map.floor : "#b08950"], 11, this.isMobile ? 256 : 512),
          this.isMobile ? 1 : 8,
        );
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(map.w, map.d),
      new THREE.MeshStandardMaterial({ map: floorTex, color: map.floor, roughness: 0.88 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(map.w / 2, 0, map.d / 2);
    floor.receiveShadow = true;
    floor.userData.color = map.floor;
    this.mapGroup.add(floor);
    this.camBlockers.push(floor);

    const kind = map.kind ?? "indoor";
    if (kind === "outdoor") {
      this.mapGroup.add(makeSkyDome(map, Math.max(map.w, map.d) * 3));
      // The world does not stop at the fence: a wide ground sheet and a ring of
      // tree silhouettes give the low perimeter something to look out onto.
      const far = Math.max(map.w, map.d) * 2.5;
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(far * 2, far * 2),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(map.floor).multiplyScalar(0.82), roughness: 1 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(map.w / 2, -0.03, map.d / 2);
      ground.receiveShadow = true;
      this.mapGroup.add(ground);
      this.mapGroup.add(makeTreeLine(map, this.isMobile ? 14 : 28));
    } else if (!map.rooms?.length) {
      // Legacy maps without room definitions: one ceiling sheet. It sits above the
      // lights, so give it an emissive floor so it never renders as a black void.
      const ceilColor = map.ceilingColor ?? "#d9cbb8";
      const ceil = new THREE.Mesh(
        new THREE.PlaneGeometry(map.w, map.d),
        new THREE.MeshStandardMaterial({
          color: ceilColor,
          emissive: ceilColor,
          emissiveIntensity: 0.32,
          roughness: 1,
          side: THREE.DoubleSide,
        }),
      );
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(map.w / 2, map.ceiling, map.d / 2);
      this.mapGroup.add(ceil);
      this.camBlockers.push(ceil);
    }

    const batches = new Map<string, StaticBatch>();
    const staticProps: { object: THREE.Object3D; blocker: boolean }[] = [];
    for (const b of map.boxes) {
      if (b.prop) {
        const modelUrl = b.modelUrl ?? LOCAL_PROP_MODELS[b.prop];
        if (modelUrl) {
          // Placeholder until the glTF arrives; the model replaces it and is flattened then.
          const prop = flattenStatic(this.createPropVisual(b));
          this.mapGroup.add(prop);
          if (b.collide || b.h >= 0.28) this.addMeshBlockers(prop);
          this.modelStats.pending += 1;
          void this.loadPropModel(b, prop, modelUrl, loadSeq);
        } else {
          // Purely procedural props are static for the map's lifetime: batch them map-wide.
          staticProps.push({ object: this.createPropVisual(b), blocker: Boolean(b.collide || b.h >= 0.28) });
        }
        continue;
      }
      const isPipe = b.pattern === "pipes";
      const geo = isPipe
        ? new THREE.CylinderGeometry(
            Math.min(b.h, b.w, b.d) * 0.46,
            Math.min(b.h, b.w, b.d) * 0.46,
            Math.max(b.w, b.d),
            16,
          )
        : b.shape === "cylinder"
          ? new THREE.CylinderGeometry(Math.min(b.w, b.d) / 2, Math.min(b.w, b.d) / 2, b.h, 12)
          : b.shape === "sphere"
            ? new THREE.SphereGeometry(Math.min(b.w, b.h, b.d) / 2, 16, 10)
            : b.collide && !b.role && b.w > 0.25 && b.h > 0.25 && b.d > 0.25
              ? new RoundedBoxGeometry(
                  b.w,
                  b.h,
                  b.d,
                  2,
                  Math.min(0.08, b.w / 4, b.h / 4, b.d / 4),
                )
              : new THREE.BoxGeometry(b.w, b.h, b.d);
      const key = materialKey(b);
      let batch = batches.get(key);
      if (!batch) {
        let mat: THREE.MeshStandardMaterial;
        let cnv: HTMLCanvasElement | null = null;
        if (b.texture) {
          const tex = this.loadImageTexture(b.texture, Math.max(1, b.w / 3), Math.max(1, b.h / 3));
          mat = new THREE.MeshStandardMaterial({ map: tex, color: b.color, roughness: 0.84 });
        } else if (b.pattern && b.pattern !== "solid") {
          // One canvas per material key (not per box) so equal surfaces share a texture and a draw call.
          cnv = makePatternCanvas(b.pattern, b.color, b.colors, 7, this.isMobile ? 128 : 256);
          const tex = canvasTexture(cnv, this.isMobile ? 1 : 8);
          mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78 });
        } else {
          mat = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.78 });
        }
        applyRoleMaterial(mat, b);
        batch = { mat, cnv, geoms: [], color: b.color, texture: b.texture, role: b.role, blocker: false, castShadow: false };
        batches.set(key, batch);
      }
      // Bake the box transform into its geometry so the whole batch is one static mesh.
      const placed = geo;
      if (isPipe) {
        if (b.w >= b.d) placed.rotateZ(Math.PI / 2);
        else placed.rotateX(Math.PI / 2);
      } else if (b.rotation) {
        placed.rotateY(b.rotation);
      }
      placed.translate(b.x, b.y, b.z);
      batch.geoms.push(placed);
      const structural = b.role === "ceiling" || b.role === "fixture" || b.role === "glass";
      if (!structural) batch.castShadow = true;
      if (b.role !== "fixture" && (b.collide || b.h >= 0.28)) batch.blocker = true;
    }

    if (staticProps.length) {
      const holder = new THREE.Group();
      for (const entry of staticProps) holder.add(entry.object);
      const flat = flattenStatic(holder);
      this.mapGroup.add(flat);
      if (staticProps.some((entry) => entry.blocker)) this.addMeshBlockers(flat);
    }

    for (const batch of batches.values()) {
      const merged = mergeGeometries(batch.geoms, false);
      for (const geom of batch.geoms) geom.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, batch.mat);
      mesh.castShadow = !this.isMobile && batch.castShadow;
      mesh.receiveShadow = batch.role !== "fixture";
      mesh.userData.color = batch.color;
      if (batch.texture) mesh.userData.texture = batch.texture;
      if (batch.cnv) {
        mesh.userData.canvas = batch.cnv;
        this.sampleCanvases.push({ mesh, canvas: batch.cnv });
      }
      this.mapGroup.add(mesh);
      if (batch.blocker) this.camBlockers.push(mesh);
    }

    // Room lights: every fixture glows (emissive), but only ROAMING_LIGHTS real point lights
    // exist; they follow the player to the nearest fixtures so the light count (and the
    // shader cost of each lit fragment) stays constant however many rooms a map has.
    this.roamingLights = [];
    this.fixtureLights = map.lights ?? [];
    const lightBudget = this.isMobile ? 0 : Math.min(ROAMING_LIGHTS, this.fixtureLights.length);
    for (let i = 0; i < lightBudget; i++) {
      const light = this.fixtureLights[i];
      const point = new THREE.PointLight(light.color, light.intensity, light.distance, 1.2);
      point.position.set(light.x, light.y, light.z);
      this.mapGroup.add(point);
      this.roamingLights.push({ point, index: i });
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

  private loadImageTexture(path: string, repeatX = 1, repeatY = 1) {
    const key = `${path}|${repeatX.toFixed(2)}|${repeatY.toFixed(2)}`;
    let texture = this.imageTextures.get(key);
    if (!texture) {
      texture = this.textureLoader.load(path);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = Math.min(this.isMobile ? 2 : 8, this.renderer.capabilities.getMaxAnisotropy());
      this.imageTextures.set(key, texture);
    }
    return texture;
  }

  private propMaterial(def: BoxDef, color = def.color, roughness = 0.78) {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0.03,
    });
    if (def.texture) material.map = this.loadImageTexture(def.texture, Math.max(1, def.w / 2.5), Math.max(1, def.h / 1.4));
    return material;
  }

  private createPropVisual(def: BoxDef) {
    const group = new THREE.Group();
    group.position.set(def.x, def.y, def.z);
    group.rotation.y = def.rotation ?? 0;
    const w = Math.max(0.12, def.w);
    const h = Math.max(0.12, def.h);
    const d = Math.max(0.12, def.d);
    const soft = (color = def.color, roughness = 0.82) => this.propMaterial(def, color, roughness);
    const wood = (color = "#6d4428") => this.propMaterial({ ...def, texture: undefined }, color, 0.58);
    const metal = (color = "#2d3434") => {
      const material = this.propMaterial({ ...def, texture: undefined }, color, 0.32);
      material.metalness = 0.72;
      return material;
    };
    const leaf = (color = "#2c6e4a") => this.propMaterial({ ...def, texture: undefined }, color, 0.9);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = !this.isMobile;
      mesh.receiveShadow = true;
      mesh.userData.color = def.color;
      mesh.userData.prop = def.prop;
      group.add(mesh);
      return mesh;
    };
    const rounded = (width: number, height: number, depth: number, radius: number, material: THREE.Material, x = 0, y = 0, z = 0) =>
      add(
        new RoundedBoxGeometry(
          Math.max(0.04, width),
          Math.max(0.04, height),
          Math.max(0.04, depth),
          2,
          Math.min(radius, width / 2, height / 2, depth / 2),
        ),
        material,
        x,
        y,
        z,
      );

    switch (def.prop as PropKind) {
      case "sofa": {
        const baseH = Math.min(0.34, h * 0.34);
        const armW = Math.min(0.28, w * 0.16);
        const cushionH = Math.min(0.2, h * 0.2);
        rounded(w * 0.94, baseH, d * 0.86, 0.1, soft(), 0, -h * 0.23, 0);
        rounded(armW, h * 0.62, d * 0.88, 0.1, soft(), -w * 0.42, 0.01, 0);
        rounded(armW, h * 0.62, d * 0.88, 0.1, soft(), w * 0.42, 0.01, 0);
        rounded(w * 0.84, h * 0.56, d * 0.2, 0.09, soft(), 0, h * 0.17, -d * 0.31);
        const gap = Math.min(0.06, w * 0.03);
        const cushionW = (w * 0.78 - gap) / 2;
        rounded(cushionW, cushionH, d * 0.62, 0.07, soft(), -(cushionW + gap) / 2, -h * 0.02, d * 0.05);
        rounded(cushionW, cushionH, d * 0.62, 0.07, soft(), (cushionW + gap) / 2, -h * 0.02, d * 0.05);
        const leg = new THREE.CylinderGeometry(0.045, 0.055, Math.min(0.16, h * 0.16), 8);
        for (const x of [-w * 0.35, w * 0.35]) for (const z of [-d * 0.28, d * 0.28]) add(leg.clone(), wood("#3b251a"), x, -h * 0.42, z);
        break;
      }
      case "armchair": {
        const armW = Math.min(0.24, w * 0.18);
        rounded(w * 0.92, h * 0.34, d * 0.86, 0.1, soft(), 0, -h * 0.23, 0);
        rounded(armW, h * 0.64, d * 0.9, 0.1, soft(), -w * 0.38, 0.01, 0);
        rounded(armW, h * 0.64, d * 0.9, 0.1, soft(), w * 0.38, 0.01, 0);
        rounded(w * 0.7, h * 0.54, d * 0.2, 0.08, soft(), 0, h * 0.17, -d * 0.31);
        rounded(w * 0.62, h * 0.2, d * 0.58, 0.07, soft(), 0, -h * 0.02, d * 0.04);
        const leg = new THREE.CylinderGeometry(0.04, 0.05, Math.min(0.16, h * 0.16), 8);
        for (const x of [-w * 0.3, w * 0.3]) for (const z of [-d * 0.27, d * 0.27]) add(leg.clone(), wood("#3b251a"), x, -h * 0.42, z);
        break;
      }
      case "coffeeTable": {
        const topH = Math.min(0.16, h * 0.24);
        rounded(w * 0.92, topH, d * 0.88, 0.07, wood(def.color), 0, h * 0.2, 0);
        const legH = Math.max(0.12, h * 0.62);
        const leg = new THREE.CylinderGeometry(Math.min(0.07, w * 0.05), Math.min(0.085, w * 0.06), legH, 8);
        for (const x of [-w * 0.35, w * 0.35]) for (const z of [-d * 0.3, d * 0.3]) add(leg.clone(), wood("#4b2d1b"), x, -h * 0.12, z);
        rounded(w * 0.65, 0.07, d * 0.52, 0.025, wood("#815533"), 0, -h * 0.16, 0);
        break;
      }
      case "chair": {
        rounded(w * 0.78, Math.min(0.16, h * 0.2), d * 0.78, 0.06, soft(), 0, h * 0.05, 0.03);
        rounded(w * 0.68, h * 0.62, Math.min(0.18, d * 0.2), 0.06, soft(), 0, h * 0.29, -d * 0.29);
        const legH = Math.max(0.12, h * 0.58);
        const leg = new THREE.CylinderGeometry(0.035, 0.045, legH, 8);
        for (const x of [-w * 0.27, w * 0.27]) for (const z of [-d * 0.25, d * 0.25]) add(leg.clone(), wood("#4b2d1b"), x, -h * 0.21, z);
        break;
      }
      case "plant": {
        const potR = Math.min(w, d) * 0.28;
        add(new THREE.CylinderGeometry(potR * 0.82, potR, Math.max(0.16, h * 0.3), 12), soft("#9a5336"), 0, -h * 0.29, 0);
        add(new THREE.CylinderGeometry(potR * 0.16, potR * 0.2, h * 0.34, 8), wood("#4c321d"), 0, -h * 0.02, 0);
        const canopy = [
          [0, h * 0.25, 0, 0.65],
          [-w * 0.2, h * 0.12, d * 0.08, 0.52],
          [w * 0.2, h * 0.1, -d * 0.04, 0.5],
        ] as const;
        canopy.forEach(([x, y, z, scale], index) => {
          const mesh = add(new THREE.SphereGeometry(0.5, 12, 8), leaf(index === 1 ? "#3f8250" : def.colors?.[0] ?? "#2c6e4a"), x, y, z);
          mesh.scale.set(w * scale, h * scale, d * scale);
        });
        break;
      }
      case "floorLamp": {
        const baseR = Math.min(w, d) * 0.42;
        add(new THREE.CylinderGeometry(baseR, baseR * 1.15, Math.max(0.08, h * 0.08), 16), metal("#5c5143"), 0, -h * 0.42, 0);
        add(new THREE.CylinderGeometry(0.035, 0.05, h * 0.66, 10), metal("#9c8d72"), 0, -h * 0.05, 0);
        add(new THREE.CylinderGeometry(w * 0.38, w * 0.52, h * 0.26, 16, 1, true), soft("#e7d5a5", 0.65), 0, h * 0.32, 0);
        add(new THREE.SphereGeometry(w * 0.16, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffe8a6" }), 0, h * 0.3, 0);
        break;
      }
      case "painting": {
        const frame = wood("#6f4425");
        rounded(w, h, Math.max(0.055, d), 0.045, frame);
        rounded(w * 0.84, h * 0.78, Math.max(0.025, d * 0.65), 0.02, soft(def.colors?.[0] ?? def.color, 0.9), 0, 0, d * 0.55);
        rounded(w * 0.58, h * 0.08, Math.max(0.028, d * 0.72), 0.012, soft(def.colors?.[1] ?? "#e6c15a", 0.9), 0, h * 0.16, d * 0.57);
        break;
      }
      case "barrel": {
        const radius = Math.min(w, d) * 0.46;
        add(new THREE.CylinderGeometry(radius, radius * 1.04, h * 0.88, 14), soft(def.color, 0.64), 0, 0, 0);
        const hoop = new THREE.TorusGeometry(radius * 1.01, Math.max(0.025, radius * 0.055), 6, 14);
        for (const y of [-h * 0.25, h * 0.25]) add(hoop.clone(), metal("#302d29"), 0, y, 0).rotation.x = Math.PI / 2;
        break;
      }
      case "bookshelf": {
        const sideW = Math.min(0.12, w * 0.07);
        const backD = Math.min(0.1, d * 0.18);
        rounded(sideW, h, d, 0.025, wood(def.color), -w * 0.43, 0, 0);
        rounded(sideW, h, d, 0.025, wood(def.color), w * 0.43, 0, 0);
        rounded(w * 0.9, Math.min(0.12, h * 0.06), d, 0.025, wood(def.color), 0, -h * 0.45, 0);
        rounded(w * 0.9, Math.min(0.12, h * 0.06), d, 0.025, wood(def.color), 0, h * 0.45, 0);
        rounded(w * 0.82, h * 0.92, backD, 0.02, wood("#4b2d1b"), 0, 0, -d * 0.38);
        const colors = def.colors ?? ["#c0392b", "#2980b9", "#27ae60", "#f1c40f"];
        const rows = 3;
        for (let row = 0; row < rows; row++) {
          const shelfY = -h * 0.31 + row * h * 0.3;
          rounded(w * 0.86, 0.06, d * 0.9, 0.015, wood("#5a351e"), 0, shelfY - h * 0.1, 0);
          const bookW = w * 0.12;
          for (let col = 0; col < 6; col++) {
            const bookH = h * (0.17 + ((col + row) % 3) * 0.035);
            rounded(bookW, bookH, d * 0.5, 0.018, soft(colors[(col + row) % colors.length], 0.86), -w * 0.33 + col * w * 0.13, shelfY + bookH * 0.45, d * 0.08);
          }
        }
        break;
      }
      default:
        rounded(w, h, d, Math.min(0.08, w * 0.1, h * 0.1, d * 0.1), soft());
    }
    return group;
  }

  private addMeshBlockers(object: THREE.Object3D) {
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) this.camBlockers.push(child);
    });
  }

  private removeMeshBlockers(object: THREE.Object3D) {
    const meshes = new Set<THREE.Object3D>();
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) meshes.add(child);
    });
    this.camBlockers = this.camBlockers.filter((blocker) => !meshes.has(blocker));
  }

  private getModelTemplate(url: string) {
    const cached = this.modelTemplates.get(url);
    if (cached) return cached;
    const promise = this.modelLoader.loadAsync(url).then((gltf) => gltf.scene);
    this.modelTemplates.set(url, promise);
    return promise;
  }

  private async loadPropModel(def: BoxDef, fallback: THREE.Group, url: string, loadSeq: number) {
    try {
      const template = await this.getModelTemplate(url);
      if (loadSeq !== this.mapLoadSeq) return;
      const model = cloneStaticModel(template);
      model.rotation.y = def.rotation ?? 0;
      model.updateMatrixWorld(true);
      const sourceBox = new THREE.Box3().setFromObject(model);
      const sourceSize = sourceBox.getSize(new THREE.Vector3());
      // Fit the footprint so the visual matches the collider; height only caps runaway proportions.
      const footprint = Math.min(def.w / Math.max(0.001, sourceSize.x), def.d / Math.max(0.001, sourceSize.z));
      const heightCap = (def.h * 1.35) / Math.max(0.001, sourceSize.y);
      const scale = Math.min(footprint, heightCap);
      model.scale.setScalar(Math.max(0.001, scale));
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(
        def.x - center.x,
        def.y - def.h / 2 - box.min.y,
        def.z - center.z,
      );
      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = !this.isMobile;
        mesh.receiveShadow = true;
        const firstMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const materialColor = firstMaterial && "color" in firstMaterial
          ? (firstMaterial as THREE.MeshStandardMaterial).color.getHexString()
          : undefined;
        mesh.userData.color = materialColor ? `#${materialColor}` : def.color;
        mesh.userData.prop = def.prop;
        mesh.userData.modelUrl = url;
      });
      const parent = fallback.parent;
      if (!parent) {
        disposeObject(model);
        this.modelStats.pending = Math.max(0, this.modelStats.pending - 1);
        return;
      }
      parent.add(model);
      this.removeMeshBlockers(fallback);
      if (def.collide || def.h >= 0.28) this.addMeshBlockers(model);
      parent.remove(fallback);
      disposeObject(fallback);
      this.modelStats.pending = Math.max(0, this.modelStats.pending - 1);
      this.modelStats.loaded += 1;
    } catch (error) {
      // The procedural prop remains visible when an optional model cannot load.
      console.warn("[world] prop model failed", url, error);
      if (loadSeq === this.mapLoadSeq) {
        this.modelStats.pending = Math.max(0, this.modelStats.pending - 1);
        this.modelStats.failed += 1;
      }
    }
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

  /** Player-adjustable look sensitivity multiplier (settings menu), 0.4‥2. */
  lookScale = 1;

  lookDelta(dx: number, dy: number) {
    const lim = Math.PI / 2 - 0.04;
    const LOOK = LOOK_SENS * this.lookScale;
    if (this.watch) {
      this.specYaw -= dx * LOOK;
      this.specPitch = Math.max(-lim, Math.min(lim, this.specPitch - dy * LOOK));
      return;
    }
    if (!this.cling) this.yaw -= dx * LOOK;
    const pitchLim = this.cling ? Math.PI / 5 : lim;
    this.pitch = Math.max(-pitchLim, Math.min(pitchLim, this.pitch - dy * LOOK));
  }

  /** Spectator shortcut: cycle the free camera onto each hunter's shoulder. */
  cycleFollow(hunterIds: string[]) {
    if (!this.watch || hunterIds.length === 0) return;
    const idx = this.followId ? hunterIds.indexOf(this.followId) : -1;
    this.followId = idx + 1 < hunterIds.length ? hunterIds[idx + 1] : idx === -1 ? hunterIds[0] : null;
  }

  toggleWatch() {
    if (this.watch) {
      this.watch = false;
      this.followId = null;
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
    const cling = this.cling;
    if (!cling) return;
    this.detachFromWall(cling.axis === "x" ? cling.sign : 0, cling.axis === "z" ? cling.sign : 0);
  }

  tryCling(pose: Pose) {
    if (this.cling) {
      this.exitCling();
      return false;
    }
    if (pose === "lie" || pose === "ball") return false;
    // The map boundary keeps normal movement a little inside the room, so its
    // rendered wall can be more than the body radius away from the player.
    // C should still reach that wall and snap the player onto its surface.
    const hit = nearestSurface(this.localX, this.localZ, this.colliders, 0.9);
    if (!hit || hit.dist < 0.04 || hit.dist > CLING_REACH) return false;
    const box = hit.box;
    // Cling rails run along X or Z. A rotated prop's face is diagonal, so sliding
    // along an axis would walk the body into (or off) the surface; skip those.
    if (!isAxisAligned(box)) return false;
    const pad = clingPad();
    if (Math.abs(hit.nx) >= Math.abs(hit.nz)) {
      const sign = hit.nx >= 0 ? 1 : -1;
      this.cling = {
        axis: "x",
        sign,
        plane: hit.x - sign * BOX_COLLIDE_OUTSET,
        minA: box.minZ + 0.04,
        maxA: box.maxZ - 0.04,
        maxY: box.maxY,
        box,
      };
      this.localX = this.cling.plane + sign * pad;
      this.localZ = Math.max(this.cling.minA, Math.min(this.cling.maxA, this.localZ));
    } else {
      const sign = hit.nz >= 0 ? 1 : -1;
      this.cling = {
        axis: "z",
        sign,
        plane: hit.z - sign * BOX_COLLIDE_OUTSET,
        minA: box.minX + 0.04,
        maxA: box.maxX - 0.04,
        maxY: box.maxY,
        box,
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
    if (this.followId) {
      const rig = this.players.get(this.followId);
      const moved = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].some((key) => keys.has(key));
      if (!rig || moved) {
        this.followId = null;
      } else {
        // Over-the-shoulder view of the hunter, using the hunter's facing.
        const yaw = rig.group.rotation.y;
        this.specYaw = yaw;
        this.specPitch = Math.max(this.specPitch, -0.35);
        this.specX = rig.group.position.x + Math.sin(yaw) * 2.6;
        this.specZ = rig.group.position.z + Math.cos(yaw) * 2.6;
        this.specY = rig.group.position.y + 2.0;
        return;
      }
    }
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
    const specRoof = ceilingAt(this.map, this.specX, this.specZ);
    this.specY = Math.max(0.6, Math.min((Number.isFinite(specRoof) ? specRoof : this.map.ceiling + 6) - 0.4, this.specY));
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
    const body = BODY_SCALE[this.bodySize];
    const r = poseRadius(this.cling ? "stick" : this.crouching ? "crouch" : pose) * body.xz;
    const h = poseHeight(this.cling ? "stick" : this.crouching ? "crouch" : pose) * body.y;
    const feet = this.localY;
    const head = this.localY + h;
    if (!this.cling) {
      const freed = resolveStuck(this.localX, this.localZ, r, boxes, bounds, feet, head);
      // A large correction means the centre ended up inside a thin wall and the
      // nearest face was the far side. Go back to the last known-free spot instead
      // of popping through.
      if (!ghost && Math.hypot(freed.x - this.localX, freed.z - this.localZ) > 0.45) {
        this.localX = this.lastFreeX;
        this.localZ = this.lastFreeZ;
      } else {
        this.localX = freed.x;
        this.localZ = freed.z;
      }
      if (!ghost && !blocked(this.localX, this.localZ, r, boxes, bounds, feet, head)) {
        this.lastFreeX = this.localX;
        this.lastFreeZ = this.localZ;
      }
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
      speed *= BODY_SCALE[this.bodySize].speed;
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
      const wall = nearestSurface(this.localX, this.localZ, boxes, CLING_REACH);
      if (wall && this.tryCling(pose)) {
        // The same Space press that attached us must not detach us next frame.
        this.clingSpaceLatch = true;
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
    // Rooms have real ceilings now: a jump ends at the ceiling instead of poking through it.
    const roof = ceilingAt(this.map, this.localX, this.localZ);
    if (Number.isFinite(roof) && this.localY + h > roof - 0.06) {
      this.localY = Math.max(0, roof - 0.06 - h);
      if (this.vy > 0) this.vy = 0;
    }
    const m = edgeMargin(r);
    this.localX = Math.max(m, Math.min(this.map.w - m, this.localX));
    this.localZ = Math.max(m, Math.min(this.map.d - m, this.localZ));
    return { x: this.localX, z: this.localZ, yaw: this.yaw };
  }

  setLocal(x: number, z: number, yaw?: number) {
    this.localX = x;
    this.localZ = z;
    this.lastFreeX = x;
    this.lastFreeZ = z;
    this.localY = 0;
    this.vy = 0;
    this.cling = null;
    this.grounded = true;
    this.hunterTps = false;
    this.crouching = false;
    if (yaw !== undefined) this.yaw = yaw;
  }

  /** Leave the wall along its normal, sliding around anything that stands in the way. */
  private detachFromWall(nx: number, nz: number) {
    this.cling = null;
    const r = poseRadius("stand");
    const h = poseHeight("stand");
    const moved = moveWithSlide(
      this.localX,
      this.localZ,
      nx * 0.32,
      nz * 0.32,
      r,
      this.colliders,
      { w: this.map.w, d: this.map.d },
      this.localY,
      this.localY + h,
    );
    this.localX = moved.x;
    this.localZ = moved.z;
  }

  private stepCling(dt: number, keys: Set<string>, r: number) {
    const cling = this.cling;
    if (!cling) return;
    const nx = cling.axis === "x" ? cling.sign : 0;
    const nz = cling.axis === "z" ? cling.sign : 0;
    const pad = clingPad();
    // Original keys: E climbs, Q descends, Space lets go (W/S and Shift remain as aliases).
    const spaceHeld = keys.has(" ") || keys.has("space");
    if (!spaceHeld) this.clingSpaceLatch = false;
    if (keys.has("shift") || (spaceHeld && !this.clingSpaceLatch)) {
      this.detachFromWall(nx, nz);
      this.grounded = this.localY <= 0.04;
      return;
    }
    let along = 0;
    if (keys.has("d") || keys.has("arrowright")) along += 1;
    if (keys.has("a") || keys.has("arrowleft")) along -= 1;
    let climb = 0;
    if (keys.has("e") || keys.has("w") || keys.has("arrowup")) climb += 1;
    if (keys.has("q") || keys.has("control") || keys.has("s") || keys.has("arrowdown")) climb -= 1;
    if (climb < 0 && this.localY <= 0.03) {
      this.detachFromWall(nx, nz);
      this.grounded = true;
      return;
    }
    const speed = (keys.has("shift") ? 2.4 : 5.2) * dt;
    const rx = nz;
    const rz = -nx;
    // Moving along or up the wall must not push the body into a neighbouring
    // wall or prop; the clung box itself is excluded since we sit on its face.
    const others = this.colliders.filter((b) => !sameCollider(b, cling.box));
    const h = poseHeight("stick");
    let nextX = cling.axis === "x" ? cling.plane + cling.sign * pad : Math.max(cling.minA, Math.min(cling.maxA, this.localX + rx * along * speed));
    let nextZ = cling.axis === "z" ? cling.plane + cling.sign * pad : Math.max(cling.minA, Math.min(cling.maxA, this.localZ + rz * along * speed));
    // Box-only checks: on a perimeter wall the body legitimately sits inside the room-edge margin.
    if (blockedByBoxes(nextX, nextZ, r, others, this.localY, this.localY + h)) {
      nextX = this.localX;
      nextZ = this.localZ;
    }
    const nextY = Math.max(0, Math.min(this.clingFeetMax(cling.maxY), this.localY + climb * speed));
    this.localX = nextX;
    this.localZ = nextZ;
    if (!blockedByBoxes(nextX, nextZ, r, others, nextY, nextY + h)) this.localY = nextY;
    this.vy = 0;
    this.yaw = Math.atan2(nx, nz);
    const m = edgeMargin(r);
    // Do not re-apply the room boundary clamp on the axis that is attached to
    // the rendered surface. That clamp was the source of the visible gap when
    // a player looked at a wall from the side.
    if (cling.axis === "x") {
      this.localZ = Math.max(m, Math.min(this.map.d - m, this.localZ));
      this.localX = cling.plane + cling.sign * pad;
    } else {
      this.localX = Math.max(m, Math.min(this.map.w - m, this.localX));
      this.localZ = cling.plane + cling.sign * pad;
    }
  }

  syncPlayers(
    snaps: PlayerSnap[],
    myId: string,
    room: RoomState,
    opts: { hideLocal?: boolean; localMoving?: boolean; dt?: number } = {},
  ) {
    const seen = new Set<string>();
    this.playerVisibility.clear();
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
      const ghost = isGhost(room, p.id);
      const show = canSee(room, self, p) && !(opts.hideLocal && p.id === myId);
      rig.group.visible = show;
      applyPaint(rig, p.fill || WHITE, p.blobs || []);
      applyFinish(rig, p.roughness ?? 0.7);
      applyBodySize(rig, effectiveBodySize(room, p.bodySize));
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
      // A clinging pose is a surface contact state. Interpolating its network
      // position leaves a visible gap while the remote proxy catches up to the
      // wall, so snap it when the pose arrives instead of smoothing it.
      if (p.id === myId || p.pose === "stick") {
        rig.group.position.set(x, y, z);
        rig.group.rotation.y = yaw;
      } else {
        // Frame-rate independent catch-up. Remote bodies obey the same colliders so
        // they slide around corners instead of cutting through walls between updates.
        const gap = Math.hypot(x - rig.group.position.x, z - rig.group.position.z);
        const k = 1 - Math.exp(-dt * 16);
        if (gap > REMOTE_SNAP_DISTANCE || ghost) {
          rig.group.position.x += (x - rig.group.position.x) * (ghost ? k : 1);
          rig.group.position.z += (z - rig.group.position.z) * (ghost ? k : 1);
        } else {
          const rr = poseRadius(p.pose) * BODY_SCALE[rig.bodySize].xz;
          const hh = poseHeight(p.pose) * BODY_SCALE[rig.bodySize].y;
          const slid = moveWithSlide(
            rig.group.position.x,
            rig.group.position.z,
            (x - rig.group.position.x) * k,
            (z - rig.group.position.z) * k,
            rr,
            this.colliders,
            { w: this.map.w, d: this.map.d },
            rig.group.position.y,
            rig.group.position.y + hh,
          );
          // Pinned against a wall while the real player is on the other side
          // (they went around through a door): give up sliding and snap.
          const wanted = gap * k;
          const got = Math.hypot(slid.x - rig.group.position.x, slid.z - rig.group.position.z);
          const stalled = wanted > 0.004 && got < wanted * 0.2;
          const since = stalled ? (this.remoteStuckSince.get(p.id) ?? now) : 0;
          if (stalled) this.remoteStuckSince.set(p.id, since);
          else this.remoteStuckSince.delete(p.id);
          if (stalled && now - since > 450) {
            rig.group.position.x = x;
            rig.group.position.z = z;
            this.remoteStuckSince.delete(p.id);
          } else {
            rig.group.position.x = slid.x;
            rig.group.position.z = slid.z;
          }
        }
        rig.group.position.y += (y - rig.group.position.y) * k;
        rig.group.rotation.y = yaw;
      }
      const moving =
        (p.id === myId && !!opts.localMoving) ||
        Math.hypot(rig.group.position.x - prevX, rig.group.position.z - prevZ) > 0.012;
      const hunterIsSearching =
        room.phase === "hunt" &&
        !!self &&
        isHunter(room, self.id) &&
        p.id !== myId &&
        !isHunter(room, p.id) &&
        hiderAlive(room, p.id);
      const selfX = self?.id === myId ? this.localX : self?.x ?? 0;
      const selfZ = self?.id === myId ? this.localZ : self?.z ?? 0;
      const distance = Math.hypot(x - selfX, z - selfZ);
      const visibility = hunterIsSearching ? hunterVisibility(p.camoScore, distance, p.pose, moving, lightLevelAt(this.map, x, z)) : 1;
      this.playerVisibility.set(p.id, visibility);
      setCamouflageLook(rig, visibility);
      if (p.shootSeq > rig.shootSeq) {
        rig.shootSeq = p.shootSeq;
        if (p.id !== myId) this.playShot(p.id, false);
      }
      const caughtT =
        room.lastTag && room.lastTag.id === p.id ? 1 - (now - room.lastTag.at) / KILL_FX_MS : 0;
      animateCharacter(rig, {
        moving,
        ghost,
        caughtT,
        dt,
        hunter: isHunter(room, p.id) && room.phase !== "lobby",
        airborne: y > 0.08 && p.pose !== "stick",
        reducedMotion: this.reducedMotion,
      });
    }
    if (room.lastTag && room.lastTag.at !== this.seenTagAt) {
      this.seenTagAt = room.lastTag.at;
      const vic = snaps.find((p) => p.id === room.lastTag!.id);
      if (vic) {
        const vx = vic.id === myId ? this.localX : vic.x;
        const vy = vic.id === myId ? this.localY : vic.y;
        const vz = vic.id === myId ? this.localZ : vic.z;
        const palette = [vic.fill || WHITE, ...(vic.blobs ?? []).slice(-6).map((b) => b.c), "#ff4d6d"];
        this.spawnKillFx(vx, vy, vz, room.lastTag.byName, room.lastTag.name, palette);
        // The victim's own camera jolts; everyone else just sees the burst.
        if (vic.id === myId) this.shake(0.22, 520);
      }
    }
    for (const [id, rig] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(rig.group);
        disposeObject(rig.group);
        this.players.delete(id);
        this.playerVisibility.delete(id);
        this.remoteStuckSince.delete(id);
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
      const bob = !this.reducedMotion && opts.moving ? Math.sin(this.viewBob) * 0.028 : 0;
      this.camEye.set(this.localX, (this.crouching ? 1.08 : 1.58) * BODY_SCALE[this.bodySize].y + this.localY + bob, this.localZ);
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
    this.camEye.set(this.localX, (this.crouching ? 1.05 : 1.48) * BODY_SCALE[this.bodySize].y + this.localY, this.localZ);
    this.camEye.y = Math.min(this.camEye.y, this.map.ceiling - 0.3);
    this.camPos.copy(this.camEye).addScaledVector(this.forward, -want);
    this.camPos.y = Math.max(0.55, this.camPos.y);
    this.camDir.copy(this.camPos).sub(this.camEye);
    const maxDist = this.camDir.length();
    if (maxDist > 0.001) {
      this.camDir.multiplyScalar(1 / maxDist);
      // Probe the centre ray plus four offset rays so the camera keeps clear of
      // corners and door frames that a single ray would slip past.
      this.camSide.crossVectors(this.camDir, this.camera.up).normalize();
      let dist = maxDist;
      for (const [sx, sy] of CAMERA_PROBES) {
        this.camProbe.copy(this.camEye).addScaledVector(this.camSide, sx).addScaledVector(this.camera.up, sy);
        this.camRay.set(this.camProbe, this.camDir);
        this.camRay.near = 0.05;
        this.camRay.far = maxDist;
        const hit = this.camRay.intersectObjects(this.camBlockers, false)[0];
        if (hit) dist = Math.min(dist, Math.max(0.42, hit.distance - 0.22));
      }
      this.camera.position.copy(this.camEye).addScaledVector(this.camDir, dist);
    } else {
      this.camera.position.copy(this.camEye);
    }
    this.camera.position.y = Math.max(0.42, Math.min(this.map.ceiling - 0.28, this.camera.position.y));
    const shakeLeft = this.shakeUntil - performance.now();
    if (shakeLeft > 0 && !this.reducedMotion) {
      const k = (shakeLeft / 520) * this.shakeAmp;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
      this.camera.position.z += (Math.random() - 0.5) * k;
    }
    this.camera.updateProjectionMatrix();
  }

  /** Brief camera jolt (metres, milliseconds) used when the local player is caught. */
  shake(amplitude: number, ms: number) {
    this.shakeAmp = amplitude;
    this.shakeUntil = performance.now() + ms;
  }

  private spawnKillFx(x: number, y: number, z: number, killer: string, victim: string, palette: string[]) {
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
        color: new THREE.Color(palette[0] || WHITE).lerp(new THREE.Color(0xffffff), 0.35),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    ball.position.y = 1.05;
    const spr = makeKillSprite(`${killer}  발견  ${victim}`);
    spr.position.y = 2.15;
    // Paint burst: the body "pops" and its own colours spray outwards, then a splat stays behind.
    const drops: { mesh: THREE.Mesh; v: THREE.Vector3 }[] = [];
    const dropGeo = new THREE.SphereGeometry(0.09, 6, 5);
    for (let i = 0; i < KILL_DROPS; i++) {
      const colour = palette[i % palette.length] || WHITE;
      const mesh = new THREE.Mesh(dropGeo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 1, depthWrite: false }));
      mesh.position.set(0, 0.7 + Math.random() * 0.8, 0);
      const size = 0.6 + Math.random() * 1.1;
      mesh.scale.setScalar(size);
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.2 + Math.random() * 3.4;
      const v = new THREE.Vector3(Math.cos(angle) * speed, 2.5 + Math.random() * 3.5, Math.sin(angle) * speed);
      drops.push({ mesh, v });
      g.add(mesh);
    }
    const splat = makeSplatSprite(palette);
    splat.position.y = 0.95;
    splat.scale.setScalar(0.01);
    g.add(ring, ball, spr, splat);
    this.scene.add(g);
    this.killFx.push({ group: g, start: Date.now(), until: Date.now() + KILL_FX_MS, drops, splat });
  }

  private tickKillFx() {
    const now = Date.now();
    const dt = 1 / 60;
    this.killFx = this.killFx.filter((fx) => {
      const t = Math.min(1, (now - fx.start) / KILL_FX_MS);
      const ring = fx.group.children[0] as THREE.Mesh;
      const ball = fx.group.children[1] as THREE.Mesh;
      const spr = fx.group.children[2] as THREE.Sprite;
      ring.scale.setScalar(1 + t * 5.5);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t);
      ball.scale.setScalar(1 + t * 2.2);
      (ball.material as THREE.MeshBasicMaterial).opacity = 0.75 * Math.max(0, 1 - t * 1.6);
      spr.position.y = 2.15 + t * 0.9;
      (spr.material as THREE.SpriteMaterial).opacity = 1 - t;
      for (const drop of fx.drops) {
        drop.v.y -= 9.8 * dt;
        drop.mesh.position.addScaledVector(drop.v, dt);
        if (drop.mesh.position.y < -0.1) {
          // Landed: stick to the floor as a puddle instead of falling through.
          drop.mesh.position.y = -0.1;
          drop.v.set(0, 0, 0);
          drop.mesh.scale.y = Math.max(0.15, drop.mesh.scale.y * 0.9);
        }
        (drop.mesh.material as THREE.MeshBasicMaterial).opacity = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
      }
      const splatIn = Math.min(1, (now - fx.start) / 220);
      fx.splat.scale.setScalar(0.2 + splatIn * 1.6);
      (fx.splat.material as THREE.SpriteMaterial).opacity = t < 0.65 ? 0.95 : Math.max(0, 0.95 * (1 - (t - 0.65) / 0.35));
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

  /** Re-assign the roaming point lights to the fixtures nearest the camera (cheap; every 0.4s). */
  private updateRoamingLights() {
    if (this.roamingLights.length === 0) return;
    const now = performance.now();
    if (now - this.roamClock < 400) return;
    this.roamClock = now;
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;
    const nearest = this.fixtureLights
      .map((light, index) => ({ index, d: (light.x - cx) ** 2 + (light.z - cz) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.roamingLights.length)
      .map((entry) => entry.index);
    // Keep lights that are still among the nearest where they are; move the others to the free slots.
    const free = nearest.filter((index) => !this.roamingLights.some((slot) => slot.index === index));
    for (const slot of this.roamingLights) {
      if (nearest.includes(slot.index)) continue;
      const index = free.shift();
      if (index === undefined) break;
      const light = this.fixtureLights[index];
      slot.index = index;
      slot.point.position.set(light.x, light.y, light.z);
      slot.point.color.set(light.color);
      slot.point.intensity = light.intensity;
      slot.point.distance = light.distance;
    }
  }

  render() {
    this.tickTracers();
    this.tickKillFx();
    this.updateRoamingLights();
    this.shadowFrame = (this.shadowFrame + 1) % SHADOW_REFRESH_EVERY;
    if (this.renderer.shadowMap.enabled && this.shadowFrame === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    this.adaptQuality();
  }

  /**
   * Long frames over a two-second window step resolution down, then shadows off,
   * so an eight-player match stays playable on integrated GPUs. Never steps back up:
   * flapping between settings looks worse than a steady lower one.
   */
  private adaptQuality() {
    const now = performance.now();
    // Tab switches and asset loads produce outlier frames that say nothing about steady-state cost.
    if (this.frameClock > 0 && now - this.frameClock < 100) {
      this.frameAccum += now - this.frameClock;
      this.frameCount += 1;
    }
    this.frameClock = now;
    if (this.frameCount < QUALITY_SAMPLE_FRAMES) return;
    const average = this.frameAccum / this.frameCount;
    this.lastAverageMs = average;
    this.frameAccum = 0;
    this.frameCount = 0;
    if (this.isMobile || average <= QUALITY_SLOW_FRAME_MS || this.qualityStep >= QUALITY_STEPS.length - 1) return;
    this.qualityStep += 1;
    const step = QUALITY_STEPS[this.qualityStep];
    this.renderer.setPixelRatio(Math.min(step.pixelRatio, window.devicePixelRatio || 1));
    this.resize();
    if (!step.shadows && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) m.needsUpdate = true;
      });
    }
  }

  /** Current adaptive quality step (0 = full); exposed for the perf audit. */
  qualityLevel() {
    return this.qualityStep;
  }

  /** Renderer counters for the last frame (draw calls, triangles); used by the perf audit. */
  frameStats() {
    const info = this.renderer.info.render;
    return { calls: info.calls, triangles: info.triangles, meshes: this.mapGroup.children.length };
  }

  /** Whether the local body can take `pose` here without its collision footprint entering a solid. */
  poseFits(pose: Pose) {
    return !blockedByBoxes(this.localX, this.localZ, poseRadius(pose), this.colliders, this.localY, this.localY + poseHeight(pose));
  }

  /**
   * QA helper: how far each body part of a player sinks into any solid collider (metres,
   * 0 = clean). Used by the headless play-through to catch "pose clips through wall" bugs.
   */
  clipReport(playerId: string, tolerance = 0.06) {
    const rig = this.players.get(playerId);
    if (!rig) return [];
    rig.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const out: { part: string; depth: number; box: { x: number; z: number } }[] = [];
    for (const [name, part] of Object.entries(rig.parts)) {
      // Geometry only: the (hidden) gun hangs off the right arm and must not count as body.
      const geo = part.mesh.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      box.copy(geo.boundingBox!).applyMatrix4(part.mesh.matrixWorld);
      for (const c of this.colliders) {
        if (c.rotation) continue;
        const dx = Math.min(box.max.x, c.maxX) - Math.max(box.min.x, c.minX);
        const dz = Math.min(box.max.z, c.maxZ) - Math.max(box.min.z, c.minZ);
        const dy = Math.min(box.max.y, c.maxY) - Math.max(box.min.y, c.minY);
        const depth = Math.min(dx, dz, dy);
        if (depth > tolerance) out.push({ part: name, depth: Math.round(depth * 100) / 100, box: { x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2 } });
      }
    }
    return out;
  }

  /** One-line performance snapshot: frame time, adaptive step, pixel ratio, draw calls, lights. */
  perfSnapshot() {
    const info = this.renderer.info.render;
    return {
      avgMs: this.lastAverageMs,
      quality: this.qualityStep,
      pixelRatio: this.renderer.getPixelRatio(),
      shadows: this.renderer.shadowMap.enabled,
      calls: info.calls,
      triangles: info.triangles,
      lights: this.roamingLights.length + 1,
    };
  }

  /** Colour and surface finish under the pointer; the finish feeds the material axis of camouflage. */
  sampleSurface(clientX: number, clientY: number): { color: string; roughness: number } | null {
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.mapGroup.children, true);
    const hit = hits.find((h) => (h.object as THREE.Mesh).isMesh);
    if (!hit) return null;
    const mesh = hit.object as THREE.Mesh;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const roughness = typeof material?.roughness === "number" ? Math.max(0, Math.min(1, material.roughness)) : 0.7;
    const color = this.colorFromHit(mesh, hit);
    return color ? { color, roughness } : null;
  }

  private colorFromHit(mesh: THREE.Mesh, hit: THREE.Intersection): string | null {
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
      if ((this.playerVisibility.get(id) ?? 1) < 0.42) continue;
      meshes.push(rig.body);
    }
    const pick = (nx: number, ny: number) => {
      this.pointer.set(nx, ny);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(meshes, true)[0];
      if (!hit) return null;
      const id = (hit.object.userData.playerId as string | undefined) ?? undefined;
      if (!id || id === myId) return null;
      if (!this.hasLineOfSight(myId, id)) return null;
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
      if ((this.playerVisibility.get(id) ?? 1) < 0.42) continue;
      if (!this.hasLineOfSight(myId, id)) continue;
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

  hasLineOfSight(hunterId: string, targetId: string) {
    const hunter = this.players.get(hunterId);
    const target = this.players.get(targetId);
    if (!hunter || !target) return false;
    const origin = new THREE.Vector3(
      hunter.group.position.x,
      hunter.group.position.y + 1.35,
      hunter.group.position.z,
    );
    const targetPoint = new THREE.Vector3(
      target.group.position.x,
      target.group.position.y + 1.05,
      target.group.position.z,
    );
    const delta = targetPoint.sub(origin);
    const distance = delta.length();
    if (distance < 0.01) return true;
    delta.normalize();
    this.raycaster.set(origin, delta);
    this.raycaster.near = 0.05;
    this.raycaster.far = Math.max(0.05, distance - 0.16);
    const blocker = this.raycaster
      .intersectObjects(this.camBlockers, false)
      .find((hit) => hit.distance < distance - 0.16);
    return !blocker;
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
    for (const texture of this.imageTextures.values()) texture.dispose();
    this.imageTextures.clear();
    this.renderer.dispose();
  }
}

type StaticBatch = {
  mat: THREE.MeshStandardMaterial;
  cnv: HTMLCanvasElement | null;
  geoms: THREE.BufferGeometry[];
  color: string;
  texture?: string;
  role?: BoxDef["role"];
  blocker: boolean;
  castShadow: boolean;
};

/** Boxes that can share one mesh: same look in every respect that reaches the material. */
function materialKey(b: BoxDef) {
  return [
    b.texture ?? "",
    b.pattern ?? "",
    b.color,
    (b.colors ?? []).join(","),
    b.role ?? "",
    b.emissive ?? "",
    b.emissiveIntensity ?? "",
    b.opacity ?? "",
    b.texture ? `${Math.max(1, b.w / 3).toFixed(1)}x${Math.max(1, b.h / 3).toFixed(1)}` : "",
  ].join("|");
}

type LightingRig = { hemi: number; sun: number; skyColor: string; groundColor: string; sunColor: string };
const LIGHTING_PRESETS: Record<NonNullable<GameMap["lighting"]>, LightingRig> = {
  day: { hemi: 1.05, sun: 1.35, skyColor: "#f2efe6", groundColor: "#3d2a1c", sunColor: "#fff4e0" },
  fluorescent: { hemi: 0.9, sun: 0.5, skyColor: "#eef2e4", groundColor: "#5a5340", sunColor: "#f6f8ec" },
  dim: { hemi: 0.95, sun: 0.6, skyColor: "#c9d2d6", groundColor: "#30363a", sunColor: "#d5dde0" },
  dusk: { hemi: 0.6, sun: 0.95, skyColor: "#f5cfa0", groundColor: "#2b1d24", sunColor: "#ffb36b" },
};

/** Role-driven material tweaks: glass is translucent, ceilings and fixtures glow so they never read as a void. */
function applyRoleMaterial(mat: THREE.MeshStandardMaterial, b: BoxDef) {
  if (b.emissive) {
    mat.emissive = new THREE.Color(b.emissive);
    mat.emissiveIntensity = b.emissiveIntensity ?? 0.3;
  }
  if (b.role === "glass") {
    mat.transparent = true;
    mat.opacity = b.opacity ?? 0.32;
    mat.roughness = 0.12;
    mat.metalness = 0.05;
    mat.depthWrite = false;
  } else if (b.opacity !== undefined && b.opacity < 1) {
    mat.transparent = true;
    mat.opacity = b.opacity;
  }
  if (b.role === "ceiling") mat.roughness = 0.95;
}

/** Gradient sky sphere with a soft sun glow; only for outdoor maps. */
function makeSkyDome(map: GameMap, radius: number) {
  const sky = map.sky!;
  const az = sky.sun.azimuth;
  const el = sky.sun.elevation;
  const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(sky.top) },
      horizon: { value: new THREE.Color(sky.horizon) },
      sunColor: { value: new THREE.Color(sky.sun.color) },
      sunDir: { value: sunDir },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 220.0);
        float halo = pow(max(dot(normalize(vDir), sunDir), 0.0), 8.0) * 0.18;
        col += sunColor * (sun * 1.4 + halo);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  dome.position.set(map.w / 2, 0, map.d / 2);
  return dome;
}

/** Ring of simple trees just outside the arena so the horizon is not empty. */
function makeTreeLine(map: GameMap, count: number) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#4a3320", roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#2f5d2a", roughness: 0.9 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 3.2, 6);
  const leafGeo = new THREE.SphereGeometry(2.2, 8, 6);
  const rx = map.w / 2 + 9;
  const rz = map.d / 2 + 9;
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const jitter = ((i * 7919) % 13) / 13;
    const x = map.w / 2 + Math.cos(t) * (rx + jitter * 5);
    const z = map.d / 2 + Math.sin(t) * (rz + jitter * 5);
    const scale = 0.8 + ((i * 31) % 7) / 10;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1.6 * scale, z);
    trunk.scale.setScalar(scale);
    const crown = new THREE.Mesh(leafGeo, leafMat);
    crown.position.set(x, (3.2 + 1.4) * scale, z);
    crown.scale.set(scale, scale * 1.15, scale);
    group.add(trunk, crown);
  }
  return group;
}

/** Lateral/vertical offsets (metres) of the extra camera occlusion rays. */
const CAMERA_PROBES: readonly [number, number][] = [
  [0, 0],
  [0.22, 0],
  [-0.22, 0],
  [0, 0.16],
  [0, -0.16],
];

/** Beyond this gap a remote body teleports (door pass-through, respawn) instead of sliding. */
const REMOTE_SNAP_DISTANCE = 2.2;

/** Door colliders are rebuilt every frame, so identify the clung box by geometry, not reference. */
function sameCollider(a: Collider, b: Collider) {
  return (
    a === b ||
    (Math.abs(a.minX - b.minX) < 1e-6 &&
      Math.abs(a.maxX - b.maxX) < 1e-6 &&
      Math.abs(a.minZ - b.minZ) < 1e-6 &&
      Math.abs(a.maxZ - b.maxZ) < 1e-6 &&
      Math.abs(a.maxY - b.maxY) < 1e-6 &&
      (a.rotation ?? 0) === (b.rotation ?? 0))
  );
}

function isAxisAligned(box: Collider) {
  const quarter = Math.PI / 2;
  const turns = (box.rotation ?? 0) / quarter;
  return Math.abs(turns - Math.round(turns)) < 0.02;
}

function clingPad() {
  // The stick pose keeps its volume, so the body is 0.56 × 0.22 ≈ 0.12 deep: sit the
  // centre that far off the wall so the back touches the face without sinking in.
  return 0.13;
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

/** Irregular multi-colour splat drawn once per catch from the victim's own paint. */
function makeSplatSprite(palette: string[]) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  const blobs = 14;
  for (let i = 0; i < blobs; i++) {
    const angle = (i / blobs) * Math.PI * 2 + Math.random() * 0.5;
    const reach = i % 3 === 0 ? 40 + Math.random() * 70 : 20 + Math.random() * 40;
    const r = 14 + Math.random() * 26;
    g.fillStyle = palette[i % palette.length] || WHITE;
    g.beginPath();
    g.arc(128 + Math.cos(angle) * reach, 128 + Math.sin(angle) * reach, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = palette[0] || WHITE;
  g.beginPath();
  g.arc(128, 128, 52, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  return new THREE.Sprite(mat);
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

function canvasTexture(canvas: HTMLCanvasElement, anisotropy = 8) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
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

/**
 * Collapses a static prop (procedural group or glTF clone) into one mesh per
 * distinct material, with world transforms baked in. Cuts draw calls roughly
 * 5-10x per prop; multi-material meshes are kept as they are.
 */
/** Local-to-root transform of a node, refreshing each local matrix from its TRS on the way up. */
function matrixWithin(root: THREE.Object3D, node: THREE.Object3D) {
  const chain: THREE.Object3D[] = [];
  for (let cursor: THREE.Object3D | null = node; cursor; cursor = cursor.parent) {
    chain.push(cursor);
    if (cursor === root) break;
  }
  const result = new THREE.Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) {
    const item = chain[i];
    if (item.matrixAutoUpdate) item.updateMatrix();
    result.multiply(item.matrix);
  }
  return result;
}

function flattenStatic(root: THREE.Object3D): THREE.Group {
  const out = new THREE.Group();
  out.userData = { ...root.userData };
  const buckets = new Map<string, { material: THREE.Material; geoms: THREE.BufferGeometry[]; sample: THREE.Mesh }>();
  const keep: THREE.Mesh[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material) || !mesh.geometry.attributes.position) {
      keep.push(mesh);
      return;
    }
    const material = mesh.material as THREE.MeshStandardMaterial;
    // Procedural props create a fresh material per part, so key on what the shader sees.
    const key = [
      material.type,
      material.color ? material.color.getHexString() : "",
      material.map ? material.map.uuid : "",
      material.emissive ? material.emissive.getHexString() : "",
      material.emissiveIntensity ?? "",
      material.roughness ?? "",
      material.metalness ?? "",
      material.transparent ? material.opacity : "",
      material.side,
    ].join("|");
    const cloned = mesh.geometry.clone().applyMatrix4(matrixWithin(root, mesh));
    // Merging needs identical attribute sets and index-ness; normalise both.
    const geometry = cloned.index ? cloned.toNonIndexed() : cloned;
    if (geometry !== cloned) cloned.dispose();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (!geometry.attributes.uv) {
      geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    }
    const bucket = buckets.get(key);
    if (bucket) bucket.geoms.push(geometry);
    else buckets.set(key, { material, geoms: [geometry], sample: mesh });
  });
  for (const bucket of buckets.values()) {
    const merged = bucket.geoms.length === 1 ? bucket.geoms[0] : mergeGeometries(bucket.geoms, false);
    if (bucket.geoms.length > 1) for (const geom of bucket.geoms) geom.dispose();
    if (!merged) {
      console.warn("[world] prop batch could not be merged; keeping parts separate", bucket.geoms.length);
      continue;
    }
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.castShadow = bucket.sample.castShadow;
    mesh.receiveShadow = bucket.sample.receiveShadow;
    mesh.userData = { ...bucket.sample.userData };
    out.add(mesh);
  }
  for (const mesh of keep) {
    const clone = mesh.clone();
    clone.applyMatrix4(matrixWithin(root, mesh));
    out.add(clone);
  }
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && !keep.includes(mesh)) mesh.geometry.dispose();
  });
  return out;
}

function cloneStaticModel(template: THREE.Group) {
  const clone = template.clone(true);
  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((material) => material.clone());
    else mesh.material = mesh.material.clone();
  });
  return clone;
}

function canSee(room: RoomState, self: PlayerSnap | undefined, other: PlayerSnap) {
  if (!self) return true;
  if (other.id === self.id) return true;
  if (room.phase === "lobby" || room.phase === "reveal" || room.phase === "result") return true;
  if (isGhost(room, other.id)) return true;
  if (isHunter(room, self.id) || !hiderAlive(room, self.id)) return true;
  if (room.phase === "prepare" || room.phase === "hide") return !isHunter(room, other.id);
  if (isHunter(room, other.id)) return true;
  if (room.mode === "normal" && room.caughtIds.includes(other.id)) return true;
  return false;
}
