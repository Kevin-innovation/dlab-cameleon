import { resolveStuck } from "./engine/collision";
import { buildRooms } from "./maps/rooms";
import type { BoxDef, Collider, DoorDef, GameMap, Pattern } from "./types";

function B(
  x: number,
  z: number,
  w: number,
  d: number,
  color: string,
  extra: Partial<BoxDef> & { h?: number; y?: number } = {},
): BoxDef {
  const h = extra.h ?? 0.9;
  const y = extra.y ?? 0;
  return {
    x: x + w / 2,
    y: y + h / 2,
    z: z + d / 2,
    w,
    h,
    d,
    color,
    shape: extra.shape,
    prop: extra.prop,
    rotation: extra.rotation,
    modelUrl: extra.modelUrl,
    collider: extra.collider,
    pattern: extra.pattern,
    texture: extra.texture,
    colors: extra.colors,
    collide: extra.collide,
  };
}

const wall = (
  x: number,
  z: number,
  w: number,
  d: number,
  color = "#4a3428",
  h = 3.8,
  pattern: Pattern = "bricks",
  colors: string[] = [color, "#3a281e"],
): BoxDef =>
  B(x, z, w, d, color, { h, y: 0, collide: true, pattern, colors });

export const BOX_COLLIDE_OUTSET = 0.06;

const MANSION = {
  ballroom: { x: 0, z: 0, w: 24, d: 14 },
  library: { x: 24, z: 0, w: 18, d: 14 },
  hallway: { x: 0, z: 14, w: 30, d: 4 },
  stairhall: { x: 30, z: 14, w: 12, d: 6 },
  kitchen: { x: 0, z: 18, w: 14, d: 14 },
  dining: { x: 14, z: 18, w: 16, d: 14 },
  conservatory: { x: 30, z: 20, w: 12, d: 12 },
};
const CREAM_WALL = { color: "#e9dcc2", pattern: "wallpaper" as Pattern, colors: ["#e9dcc2", "#d6c5a3"], thickness: 0.34 };
const WOOD_WALL = { color: "#4a3020", pattern: "wood" as Pattern, colors: ["#4a3020", "#3a2416"], thickness: 0.34 };
const HALL_WALL = { color: "#b9a98c", pattern: "wallpaper" as Pattern, colors: ["#b9a98c", "#a6957a"], thickness: 0.34 };
const TILE_WALL = { color: "#f0f0ea", pattern: "tiles" as Pattern, colors: ["#f0f0ea", "#d9dbd2"], thickness: 0.34 };
const RED_WALL = { color: "#a4553f", pattern: "wallpaper" as Pattern, colors: ["#a4553f", "#8c4433"], thickness: 0.34 };
const GLASS_WALL = { color: "#dfe8d8", thickness: 0.3 };

/** A bright emissive slab just outside a window so the glass reads as daylight. */
function daylight(x: number, z: number, w: number, d: number): BoxDef {
  return { x, y: 1.75, z, w, h: 2.2, d, color: "#fff3d0", emissive: "#fff3d0", emissiveIntensity: 1, collide: false, role: "fixture" };
}

/**
 * 저택: 무도회장(큰 창·샹들리에), 어두운 서재, 복도, 계단 홀(0.9m 단), 밝은 주방,
 * 붉은 식당, 유리 온실. 밝기 차이와 커튼·테이블 밑·계단 밑이 은신의 핵심이다.
 */
const mansion: GameMap = {
  id: "mansion",
  name: "숨바꼭질 저택",
  blurb: "무도회장·서재·주방·온실. 커튼 뒤와 어두운 서재를 활용하세요.",
  difficulty: "쉬움",
  kind: "indoor",
  lighting: "day",
  ceilingStyle: "plaster",
  w: 42,
  d: 32,
  ceiling: 3.4,
  fog: "#2a1d12",
  floor: "#c4a06a",
  floorTexture: "/textures/oak-floor-v1.png",
  rooms: [
    {
      id: "ballroom",
      ...MANSION.ballroom,
      wall: CREAM_WALL,
      light: 0.9,
      openings: [
        { kind: "window", side: "n", at: 4, width: 3, sill: 0.9, height: 2 },
        { kind: "window", side: "n", at: 12, width: 3, sill: 0.9, height: 2 },
        { kind: "window", side: "n", at: 20, width: 3, sill: 0.9, height: 2 },
        { kind: "arch", side: "s", at: 12, width: 3.2 },
        { kind: "door", side: "e", at: 7, width: 1.8 },
      ],
      ceiling: { style: "plaster", color: "#f3ecdd", fixtures: [{ x: 8, z: 7, kind: "pendant" }, { x: 16, z: 7, kind: "pendant" }] },
    },
    {
      id: "library",
      ...MANSION.library,
      wall: WOOD_WALL,
      light: 0.3,
      openings: [
        { kind: "door", side: "s", at: 3, width: 1.8 },
        { kind: "window", side: "n", at: 14, width: 2, sill: 1.2, height: 1.4 },
      ],
      ceiling: { style: "beams", color: "#5a3f2a", fixtures: [{ x: 29, z: 7, kind: "spot" }, { x: 37, z: 7, kind: "spot", on: false }] },
    },
    {
      id: "hallway",
      ...MANSION.hallway,
      wall: HALL_WALL,
      light: 0.4,
      openings: [
        { kind: "door", side: "s", at: 7, width: 1.8 },
        { kind: "arch", side: "s", at: 22, width: 2.6 },
        { kind: "arch", side: "e", at: 2, width: 2.6 },
      ],
      ceiling: { style: "plaster", color: "#d9cfbc", fixtures: [{ x: 6, z: 16, kind: "spot" }, { x: 24, z: 16, kind: "spot", on: false }] },
    },
    {
      id: "stairhall",
      ...MANSION.stairhall,
      wall: HALL_WALL,
      light: 0.5,
      openings: [{ kind: "door", side: "s", at: 4, width: 1.8 }],
      ceiling: { style: "plaster", color: "#d9cfbc", fixtures: [{ x: 34, z: 17, kind: "pendant" }] },
    },
    {
      id: "kitchen",
      ...MANSION.kitchen,
      wall: TILE_WALL,
      light: 0.85,
      openings: [
        { kind: "window", side: "w", at: 7, width: 3, sill: 1, height: 1.4 },
        { kind: "door", side: "e", at: 6, width: 1.8 },
      ],
      ceiling: { style: "plaster", color: "#f2f2ee", fixtures: [{ x: 4, z: 25, kind: "fluorescent" }, { x: 10, z: 25, kind: "fluorescent" }] },
    },
    {
      id: "dining",
      ...MANSION.dining,
      wall: RED_WALL,
      light: 0.55,
      openings: [{ kind: "door", side: "e", at: 6, width: 1.8 }],
      ceiling: { style: "plaster", color: "#e2d4c2", fixtures: [{ x: 22, z: 25, kind: "pendant" }] },
    },
    {
      id: "conservatory",
      ...MANSION.conservatory,
      wall: GLASS_WALL,
      light: 1,
      openings: [
        { kind: "window", side: "e", at: 3, width: 3.4, sill: 0.6, height: 2.3 },
        { kind: "window", side: "e", at: 9, width: 3.4, sill: 0.6, height: 2.3 },
        { kind: "window", side: "s", at: 3, width: 3.4, sill: 0.6, height: 2.3 },
        { kind: "window", side: "s", at: 9, width: 3.4, sill: 0.6, height: 2.3 },
      ],
      ceiling: { style: "plaster", color: "#eef4ee" },
    },
  ],
  doors: [],
  hunterSpawns: [{ x: 12, z: 8 }],
  spawns: [
    { x: 4, z: 9 },
    { x: 20, z: 4 },
    { x: 33.2, z: 4.5 },
    { x: 15, z: 16 },
    { x: 7, z: 29 },
    { x: 22, z: 30 },
    { x: 36, z: 29 },
    { x: 31.2, z: 19 },
  ],
  boxes: [
    daylight(4, -0.5, 3.6, 0.2),
    daylight(12, -0.5, 3.6, 0.2),
    daylight(20, -0.5, 3.6, 0.2),
    daylight(38, -0.5, 2.4, 0.2),
    daylight(-0.5, 25, 0.2, 3.6),
    daylight(42.5, 23, 0.2, 4),
    daylight(42.5, 29, 0.2, 4),
    daylight(33, 32.5, 4, 0.2),
    daylight(39, 32.5, 4, 0.2),
  ],
};

const FENCE = { color: "#e8e2d2", pattern: "stripes" as Pattern, colors: ["#e8e2d2", "#cfc7b4"], thickness: 0.16, height: 1.15 };
const LOW_FENCE = { color: "#8a6a44", pattern: "wood" as Pattern, colors: ["#8a6a44", "#6f5232"], thickness: 0.14, height: 0.95 };
const BARN_WALL = { color: "#9b2f26", pattern: "wood" as Pattern, colors: ["#9b2f26", "#7d241d"], thickness: 0.34, height: 5 };
const SHED_WALL = { color: "#6f6a5c", pattern: "wood" as Pattern, colors: ["#6f6a5c", "#57534a"], thickness: 0.26, height: 2.8 };

/**
 * 농장: 낮은 울타리로 둘러싸인 마당(하늘·햇빛·긴 그림자), 어둡고 높은 헛간, 작은 창고,
 * 닭장·돼지우리. 헛간 안 그늘과 건초 더미 그늘이 위장에 유리하다.
 */
const farm: GameMap = {
  id: "farm",
  name: "실내 농장",
  blurb: "햇빛 마당과 어두운 헛간. 건초·울타리·그늘을 활용하세요.",
  difficulty: "쉬움",
  kind: "outdoor",
  lighting: "day",
  sky: { top: "#5f9fe0", horizon: "#e9efd8", sun: { azimuth: 0.85, elevation: 0.95, color: "#fff2d6", intensity: 1.6 } },
  w: 42,
  d: 32,
  ceiling: 6,
  fog: "#e9efd8",
  floor: "#6f8f3a",
  floorPattern: "leaves",
  rooms: [
    {
      id: "barn",
      x: 4,
      z: 2,
      w: 16,
      d: 14,
      wall: BARN_WALL,
      light: 0.28,
      openings: [
        { kind: "arch", side: "s", at: 8, width: 3.4 },
        { kind: "door", side: "e", at: 7, width: 1.8 },
        { kind: "window", side: "w", at: 4, width: 1.6, sill: 1.8, height: 1.2 },
        { kind: "window", side: "w", at: 10, width: 1.6, sill: 1.8, height: 1.2 },
      ],
      ceiling: { style: "beams", color: "#4a3320", height: 5, fixtures: [{ x: 12, z: 9, kind: "pendant", on: false }] },
    },
    {
      id: "shed",
      x: 30,
      z: 22,
      w: 10,
      d: 8,
      wall: SHED_WALL,
      light: 0.25,
      openings: [{ kind: "door", side: "w", at: 4, width: 1.8 }],
      ceiling: { style: "concrete", color: "#5b574c", height: 2.8 },
    },
    { id: "coop", x: 28, z: 2, w: 12, d: 7, wall: LOW_FENCE, light: 1, openings: [{ kind: "gap", side: "w", at: 3.5, width: 2 }], ceiling: { open: true } },
    { id: "pen", x: 22, z: 22, w: 8, d: 8, wall: LOW_FENCE, light: 1, openings: [{ kind: "gap", side: "n", at: 4, width: 2.2 }], ceiling: { open: true } },
    { id: "yard", x: 0, z: 0, w: 42, d: 32, wall: FENCE, light: 1, openings: [{ kind: "gap", side: "s", at: 21, width: 3.6 }], ceiling: { open: true } },
  ],
  doors: [],
  hunterSpawns: [{ x: 21, z: 30.5 }],
  spawns: [
    { x: 8.5, z: 10 },
    { x: 13.5, z: 6.5 },
    { x: 2, z: 20 },
    { x: 12, z: 26 },
    { x: 33.5, z: 21 },
    { x: 26, z: 12 },
    { x: 34, z: 27 },
    { x: 24, z: 26 },
  ],
  boxes: [],
};

const sewer: GameMap = {
  id: "sewer",
  name: "하수도",
  blurb: "파이프·드럼·그래피티. 어두운 구석보다 무늬에 녹으세요.",
  difficulty: "보통",
  w: 46,
  d: 34,
  ceiling: 4.4,
  fog: "#101816",
  floor: "#3d4a43",
  floorTexture: "/textures/sewer-concrete-v1.png",
  doors: [],
  hunterSpawns: [{ x: 23, z: 31.5 }],
  spawns: [
    { x: 7, z: 7 },
    { x: 16, z: 10 },
    { x: 24, z: 8 },
    { x: 34, z: 11 },
    { x: 39, z: 18 },
    { x: 32, z: 24 },
    { x: 18, z: 22 },
    { x: 8, z: 20 },
  ],
  boxes: [
    B(1, 1, 44, 32, "#3d4a43", { h: 0.05, pattern: "bricks", colors: ["#3d4a43", "#2f3a34"] }),
    B(2, 2, 8, 0.22, "#c0392b", {
      h: 3.2,
      collide: true,
      pattern: "graffiti",
      colors: ["#c0392b", "#f1c40f", "#3498db", "#2ecc71"],
    }),
    B(14, 2, 10, 0.22, "#1f6f4a", { h: 3.0, collide: true, pattern: "graffiti", colors: ["#1f6f4a", "#f39c12", "#e74c3c"] }),
    B(30, 2, 12, 0.22, "#8e44ad", { h: 3.0, collide: true, pattern: "graffiti", colors: ["#8e44ad", "#f1c40f", "#1abc9c"] }),
    B(12, 12, 0.22, 8, "#1f6f4a", { h: 2.8, collide: true, pattern: "graffiti", colors: ["#1f6f4a", "#f39c12"] }),
    B(24, 14, 8, 0.22, "#2c3e50", { h: 2.6, collide: true, pattern: "graffiti", colors: ["#e74c3c", "#3498db"] }),
    B(6, 14, 1.3, 1.3, "#b03a2e", { h: 1.2 }),
    B(34, 16, 2.2, 1.5, "#8e44ad", { h: 1.5, pattern: "graffiti", colors: ["#8e44ad", "#f1c40f"] }),
    B(8, 6, 8, 0.55, "#c47a3a", { h: 0.5, y: 3.2, pattern: "pipes" }),
    B(22, 8, 10, 0.55, "#6e8b73", { h: 0.5, y: 3.0, pattern: "pipes" }),
    B(4, 8, 1.2, 1.2, "#b03a2e", { h: 1.15 }),
    B(7, 10, 1.2, 1.2, "#922b21", { h: 1.15 }),
    B(10, 8, 1.2, 1.2, "#c0392b", { h: 1.15 }),
    B(16, 12, 4.2, 2.8, "#4a5c3a", { h: 1.4, pattern: "leaves" }),
    B(24, 10, 3.4, 2.6, "#2c3e50", { h: 2.0, pattern: "graffiti", colors: ["#e74c3c", "#3498db", "#f1c40f"] }),
    B(32, 12, 2.4, 0.55, "#d35400", { h: 0.55, y: 2.4, pattern: "pipes" }),
    B(36, 10, 5, 2.8, "#8e44ad", { h: 1.8, pattern: "graffiti", colors: ["#8e44ad", "#f1c40f"] }),
    B(22.5, 17, 1.2, 1.2, "#1b2420", { h: 4.0, collide: true, pattern: "bricks" }),
    B(6, 22, 1.3, 4, "#c47a3a", { h: 0.6, y: 2.8, pattern: "pipes" }),
    B(12, 24, 3.6, 3.2, "#f1c40f", { h: 2.2, pattern: "stripes", colors: ["#f1c40f", "#111"] }),
    B(20, 22, 2.6, 2.0, "#27ae60", { h: 1.6, pattern: "graffiti" }),
    B(30, 24, 1.3, 1.3, "#b03a2e", { h: 1.2 }),
    B(34, 24, 1.3, 1.3, "#922b21", { h: 1.2 }),
    B(38, 22, 1.4, 4, "#c47a3a", { h: 0.6, y: 2.6, pattern: "pipes" }),
    wall(0, 0, 46, 0.4, "#1b2420", 4.2, "bricks", ["#1b2420", "#2a3830"]),
    wall(0, 33.6, 18, 0.4, "#1b2420", 4.2, "bricks", ["#1b2420", "#2a3830"]),
    wall(28, 33.6, 18, 0.4, "#1b2420", 4.2, "bricks", ["#1b2420", "#2a3830"]),
    wall(0, 0, 0.4, 34, "#1b2420", 4.2, "bricks", ["#1b2420", "#2a3830"]),
    wall(45.6, 0, 0.4, 34, "#1b2420", 4.2, "bricks", ["#1b2420", "#2a3830"]),
    B(18, 18, 1.1, 0.7, "#2c3e50", { h: 1.8, collide: true }),
    B(28, 20, 1.4, 0.8, "#c0392b", { h: 1.7, collide: true, pattern: "dots", colors: ["#c0392b", "#111"] }),
  ],
};

const YELLOW_WALL = { color: "#e2d36a", pattern: "wallpaper" as Pattern, colors: ["#e2d36a", "#c9b84a"], thickness: 0.3 };
const OFFICE_WALL = { color: "#d8cf9c", pattern: "wallpaper" as Pattern, colors: ["#d8cf9c", "#c4b97e"], thickness: 0.3 };
const DARK_WALL = { color: "#8f8650", pattern: "wallpaper" as Pattern, colors: ["#8f8650", "#6f6838"], thickness: 0.3 };

/** Fluorescent tubes on a grid inside a room; `on: false` leaves a dark zone. */
function fluorescentGrid(room: { x: number; z: number; w: number; d: number }, spacing: number, on = true) {
  const out: { x: number; z: number; kind: "fluorescent"; on: boolean }[] = [];
  const nx = Math.max(1, Math.round(room.w / spacing));
  const nz = Math.max(1, Math.round(room.d / spacing));
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      out.push({ x: room.x + ((i + 0.5) * room.w) / nx, z: room.z + ((j + 0.5) * room.d) / nz, kind: "fluorescent", on });
    }
  }
  return out;
}

const BR = {
  lobby: { x: 0, z: 0, w: 16, d: 10 },
  copy: { x: 0, z: 10, w: 8, d: 8 },
  kitchen: { x: 8, z: 10, w: 8, d: 8 },
  corridorB: { x: 0, z: 18, w: 16, d: 4 },
  archive: { x: 0, z: 22, w: 16, d: 10 },
  lounge: { x: 0, z: 32, w: 16, d: 10 },
  spine: { x: 16, z: 0, w: 4, d: 42 },
  officeA: { x: 20, z: 0, w: 20, d: 14 },
  meeting: { x: 40, z: 0, w: 16, d: 12 },
  storage: { x: 40, z: 12, w: 16, d: 12 },
  officeB: { x: 20, z: 14, w: 20, d: 16 },
  breakroom: { x: 40, z: 24, w: 16, d: 6 },
  corridorC: { x: 20, z: 30, w: 36, d: 4 },
  officeC: { x: 20, z: 34, w: 20, d: 8 },
  server: { x: 40, z: 34, w: 16, d: 8 },
};

/**
 * 백룸: 56×42 사무실. 형광등 그리드 아래의 밝은 사무 구역, 창이 있는 회의실,
 * 형광등이 꺼진 창고·서버실·문서고, 좁은 탕비실·복사실, 긴 복도가 시야를 끊는다.
 */
const backrooms: GameMap = {
  id: "backrooms",
  name: "백룸",
  blurb: "노란 사무실. 꺼진 형광등 구역과 칸막이 사이에 숨으세요.",
  difficulty: "어려움",
  kind: "indoor",
  lighting: "fluorescent",
  ceilingStyle: "tiles",
  w: 56,
  d: 42,
  ceiling: 2.9,
  fog: "#8d8340",
  floor: "#c9b95a",
  rooms: [
    { id: "lobby", ...BR.lobby, wall: YELLOW_WALL, light: 0.8, openings: [{ kind: "arch", side: "e", at: 5, width: 2.4 }], ceiling: { style: "tiles", fixtures: [{ x: 5, z: 5, kind: "pendant" }, { x: 11, z: 5, kind: "pendant" }] } },
    { id: "copy", ...BR.copy, wall: OFFICE_WALL, light: 0.5, openings: [{ kind: "door", side: "s", at: 4, width: 1.8 }], ceiling: { style: "tiles", fixtures: fluorescentGrid(BR.copy, 5) } },
    { id: "kitchen", ...BR.kitchen, wall: OFFICE_WALL, light: 0.7, openings: [{ kind: "door", side: "s", at: 4, width: 1.8 }, { kind: "arch", side: "e", at: 4, width: 2 }], ceiling: { style: "tiles", fixtures: fluorescentGrid(BR.kitchen, 5) } },
    { id: "corridorB", ...BR.corridorB, wall: YELLOW_WALL, light: 0.35, openings: [{ kind: "arch", side: "e", at: 2, width: 2.4 }], ceiling: { style: "tiles", fixtures: [{ x: 4, z: 20, kind: "fluorescent" }, { x: 12, z: 20, kind: "fluorescent", on: false }] } },
    { id: "archive", ...BR.archive, wall: DARK_WALL, light: 0.12, openings: [{ kind: "door", side: "n", at: 3, width: 1.8 }], ceiling: { style: "tiles", fixtures: fluorescentGrid(BR.archive, 6, false) } },
    { id: "lounge", ...BR.lounge, wall: YELLOW_WALL, light: 0.6, openings: [{ kind: "door", side: "n", at: 12, width: 1.8 }, { kind: "arch", side: "e", at: 5, width: 2.4 }], ceiling: { style: "tiles", fixtures: [{ x: 5, z: 37, kind: "pendant" }, { x: 11, z: 37, kind: "pendant" }] } },
    { id: "spine", ...BR.spine, wall: YELLOW_WALL, light: 0.55, ceiling: { style: "tiles", fixtures: [{ x: 18, z: 8, kind: "fluorescent" }, { x: 18, z: 20, kind: "fluorescent" }, { x: 18, z: 32, kind: "fluorescent" }, { x: 18, z: 38, kind: "fluorescent", on: false }] } },
    { id: "officeA", ...BR.officeA, wall: OFFICE_WALL, light: 0.75, openings: [{ kind: "arch", side: "w", at: 7, width: 2.4 }, { kind: "door", side: "e", at: 6, width: 1.8 }, { kind: "door", side: "s", at: 10, width: 1.8 }], ceiling: { style: "tiles", fixtures: fluorescentGrid(BR.officeA, 6) } },
    { id: "meeting", ...BR.meeting, wall: OFFICE_WALL, light: 0.95, openings: [{ kind: "window", side: "e", at: 3, width: 3, sill: 0.9, height: 1.5 }, { kind: "window", side: "e", at: 9, width: 3, sill: 0.9, height: 1.5 }, { kind: "door", side: "s", at: 8, width: 1.8 }], ceiling: { style: "tiles", fixtures: fluorescentGrid(BR.meeting, 6) } },
    { id: "storage", ...BR.storage, wall: DARK_WALL, light: 0.1, openings: [{ kind: "door", side: "s", at: 8, width: 1.8 }], ceiling: { style: "tiles", fixtures: fluorescentGrid(BR.storage, 6, false) } },
    { id: "officeB", ...BR.officeB, wall: OFFICE_WALL, light: 0.65, openings: [{ kind: "arch", side: "w", at: 8, width: 2.4 }, { kind: "arch", side: "s", at: 10, width: 2.4 }], ceiling: { style: "tiles", fixtures: fluorescentGrid(BR.officeB, 6) } },
    { id: "breakroom", ...BR.breakroom, wall: YELLOW_WALL, light: 0.7, openings: [{ kind: "arch", side: "s", at: 8, width: 2.4 }], ceiling: { style: "tiles", fixtures: fluorescentGrid(BR.breakroom, 8) } },
    { id: "corridorC", ...BR.corridorC, wall: YELLOW_WALL, light: 0.45, ceiling: { style: "tiles", fixtures: [{ x: 26, z: 32, kind: "fluorescent" }, { x: 38, z: 32, kind: "fluorescent" }, { x: 50, z: 32, kind: "fluorescent" }] } },
    { id: "officeC", ...BR.officeC, wall: OFFICE_WALL, light: 0.6, openings: [{ kind: "arch", side: "n", at: 10, width: 2.4 }], ceiling: { style: "tiles", fixtures: fluorescentGrid(BR.officeC, 7) } },
    { id: "server", ...BR.server, wall: DARK_WALL, light: 0.2, openings: [{ kind: "door", side: "n", at: 8, width: 1.8 }], ceiling: { style: "tiles", fixtures: [{ x: 48, z: 38, kind: "spot" }] } },
  ],
  doors: [],
  hunterSpawns: [{ x: 53.5, z: 9.5 }],
  spawns: [
    { x: 4, z: 5 },
    { x: 12.5, z: 12.7 },
    { x: 8, z: 26 },
    { x: 5, z: 37 },
    { x: 30, z: 10.5 },
    { x: 36, z: 22 },
    { x: 30, z: 38 },
    { x: 52.5, z: 28.5 },
  ],
  boxes: [
    // 회의실 창 밖의 "낮 빛": 창 너머에 밝은 발광 패널을 두어 창이 실제로 빛나게 한다.
    { x: 56.5, y: 1.65, z: 3, w: 0.2, h: 1.7, d: 3.6, color: "#fff4cc", emissive: "#fff4cc", emissiveIntensity: 1, collide: false, role: "fixture" },
    { x: 56.5, y: 1.65, z: 9, w: 0.2, h: 1.7, d: 3.6, color: "#fff4cc", emissive: "#fff4cc", emissiveIntensity: 1, collide: false, role: "fixture" },
  ],
};

function wallTheme(id: string): { color: string; pattern: Pattern; colors: string[] } {
  if (id === "farm") return { color: "#6d4420", pattern: "wood", colors: ["#6d4420", "#8b5a2b"] };
  if (id === "sewer") return { color: "#1b2420", pattern: "bricks", colors: ["#1b2420", "#2a3830"] };
  if (id === "backrooms") return { color: "#d4c56a", pattern: "wallpaper", colors: ["#e2d36a", "#c9b84a"] };
  return { color: "#4a3428", pattern: "wallpaper", colors: ["#4a3428", "#6b3a2a"] };
}

function wallWithDoor(
  mapId: string,
  along: "x" | "z",
  plane: number,
  a0: number,
  a1: number,
  thick: number,
  h: number,
  theme: { color: string; pattern: Pattern; colors: string[] },
): { walls: BoxDef[]; door: DoorDef } {
  const gap = 1.82;
  const mid = (a0 + a1) / 2;
  const door: DoorDef = {
    id: `${mapId}-${along}-${plane.toFixed(1)}-${mid.toFixed(1)}`,
    x: along === "z" ? plane : mid,
    z: along === "z" ? mid : plane,
    w: gap - 0.08,
    h: Math.min(2.32, h - 0.15),
    d: thick + 0.05,
    along,
    color: "#5c3a22",
  };
  const walls: BoxDef[] = [];
  const leftLen = mid - gap / 2 - a0;
  const rightLen = a1 - (mid + gap / 2);
  if (along === "z") {
    if (leftLen > 0.35) walls.push(B(plane - thick / 2, a0, thick, leftLen, theme.color, { h, collide: true, pattern: theme.pattern, colors: theme.colors }));
    if (rightLen > 0.35)
      walls.push(
        B(plane - thick / 2, mid + gap / 2, thick, rightLen, theme.color, {
          h,
          collide: true,
          pattern: theme.pattern,
          colors: theme.colors,
        }),
      );
  } else {
    if (leftLen > 0.35) walls.push(B(a0, plane - thick / 2, leftLen, thick, theme.color, { h, collide: true, pattern: theme.pattern, colors: theme.colors }));
    if (rightLen > 0.35)
      walls.push(
        B(mid + gap / 2, plane - thick / 2, rightLen, thick, theme.color, {
          h,
          collide: true,
          pattern: theme.pattern,
          colors: theme.colors,
        }),
      );
  }
  return { walls, door };
}

function touchesPerimeter(map: GameMap, box: BoxDef) {
  const left = box.x - box.w / 2;
  const right = box.x + box.w / 2;
  const front = box.z - box.d / 2;
  const back = box.z + box.d / 2;
  return left <= 0.7 || right >= map.w - 0.7 || front <= 0.7 || back >= map.d - 0.7;
}

function isDisconnectedWallPanel(map: GameMap, box: BoxDef) {
  const isThin = Math.min(box.w, box.d) <= 0.3;
  return isThin && box.h >= 1.6 && !touchesPerimeter(map, box);
}

function placeOnStage(map: GameMap, box: BoxDef) {
  const bottom = box.y - box.h / 2;
  const isOverheadPipe = box.pattern === "pipes" && bottom > 1.4;
  const isWallMountedPainting = box.prop === "painting";
  if (isOverheadPipe) return { ...box, y: map.ceiling - box.h / 2 - 0.06 };
  if (bottom <= 0.08 || isWallMountedPainting) return box;
  return { ...box, y: box.h / 2 };
}

function landmarkProps(map: GameMap): BoxDef[] {
  if (map.id === "sewer") {
    return [
      // 남쪽 정비 구역: 원형 드럼과 가구를 섞어 시야·이동 속도를 동시에 바꾼다.
      B(7.5, 24, 3.8, 1.35, "#365b78", { h: 0.95, collide: true, prop: "sofa", collider: { w: 3.56, d: 1.2 } }),
      B(12, 26, 1.6, 1.4, "#5b6b58", { h: 0.95, collide: true, prop: "armchair" }),
      B(14.5, 25.5, 2.4, 1.3, "#6d4420", { h: 0.72, collide: true, prop: "coffeeTable", collider: { w: 2.2, d: 1.12 }, pattern: "wood" }),
      B(24, 23, 3.6, 1.3, "#6a3d4b", { h: 0.95, collide: true, prop: "sofa", collider: { w: 3.38, d: 1.16 } }),
      B(29, 25, 1.6, 1.4, "#5b6b58", { h: 0.95, collide: true, prop: "armchair" }),
      B(35, 18, 2.6, 0.7, "#6d4420", { h: 2.15, collide: true, prop: "bookshelf", collider: { w: 2.4, d: 0.62 }, pattern: "wood" }),
      B(3.5, 25.5, 1.35, 1.35, "#922b21", { h: 1.25, collide: true, prop: "barrel", shape: "cylinder" }),
      B(5.1, 25.8, 1.25, 1.25, "#c0392b", { h: 1.15, collide: true, prop: "barrel", shape: "cylinder" }),
      B(38.2, 26, 1.35, 1.35, "#b03a2e", { h: 1.25, collide: true, prop: "barrel", shape: "cylinder" }),
      B(16.5, 27, 1.35, 1.35, "#922b21", { h: 1.25, collide: true, prop: "barrel", shape: "cylinder" }),
      B(18.1, 27.4, 1.25, 1.25, "#c0392b", { h: 1.15, collide: true, prop: "barrel", shape: "cylinder" }),
      B(31.5, 5.5, 1.3, 1.3, "#b03a2e", { h: 1.2, collide: true, prop: "barrel", shape: "cylinder" }),
      B(34, 26, 2.2, 1.5, "#2c3e50", { h: 1.35, collide: true, pattern: "graffiti", colors: ["#e74c3c", "#3498db"] }),
    ];
  }
  return [];
}

function stageLayout(map: GameMap): GameMap {
  const theme = wallTheme(map.id);
  const h = Math.min(map.ceiling - 0.24, 2.45);
  const thick = 0.36;
  const runs: { along: "x" | "z"; plane: number; a0: number; a1: number }[] =
    map.id === "mansion"
      ? [{ along: "x", plane: 18, a0: 9, a1: 39 }]
      : map.id === "farm"
        ? [{ along: "x", plane: 20, a0: 10, a1: 42 }]
        : map.id === "sewer"
          ? [{ along: "z", plane: 29, a0: 8, a1: 26 }]
          : [{ along: "x", plane: 15, a0: 7, a1: 33 }];
  const baseBoxes = map.boxes.filter((box) => !isDisconnectedWallPanel(map, box)).map((box) => placeOnStage(map, box));
  const walls: BoxDef[] = [];
  const doors: DoorDef[] = [...(map.doors ?? [])];
  for (const run of runs) {
    const part = wallWithDoor(map.id, run.along, run.plane, run.a0, run.a1, thick, h, theme);
    walls.push(...part.walls);
    doors.push(part.door);
  }
  return { ...map, boxes: [...baseBoxes, ...landmarkProps(map), ...walls], doors };
}

function clearSpawns(map: GameMap): GameMap {
  const cols = [...mapColliders(map), ...(map.doors ?? []).flatMap((d) => doorColliders(d))];
  const bounds = { w: map.w, d: map.d };
  const fix = (p: { x: number; z: number }) => resolveStuck(p.x, p.z, 0.45, cols, bounds);
  return {
    ...map,
    spawns: map.spawns.map(fix),
    hunterSpawns: map.hunterSpawns.map(fix),
  };
}

/**
 * Arena size by difficulty. Harder maps are larger: more ground for hiders to
 * spread across and more area for the hunter to sweep in the same hunt time.
 */
export const ARENA_BY_DIFFICULTY: Record<GameMap["difficulty"], { width: number; depth: number }> = {
  쉬움: { width: 42, depth: 32 },
  보통: { width: 48, depth: 36 },
  어려움: { width: 56, depth: 42 },
};

/** Long, thin, tall boxes are walls; their length follows the arena. Everything else is a prop that keeps its size. */
function isWallRun(box: BoxDef, axis: "x" | "z") {
  const length = axis === "x" ? box.w : box.d;
  const thickness = axis === "x" ? box.d : box.w;
  return box.h >= 1.2 && length >= 3 && thickness <= 0.6;
}

function isFloorSheet(box: BoxDef) {
  return box.h <= 0.1 && box.w >= 4 && box.d >= 4;
}

/**
 * Spreads a hand-built layout to the arena size: positions (and wall lengths)
 * scale, furniture keeps its real dimensions so cover stays believable.
 */
function spreadMapToArena(map: GameMap, width: number, depth: number): GameMap {
  const sx = width / map.w;
  const sz = depth / map.d;
  const spreadBox = (box: BoxDef): BoxDef => {
    const floor = isFloorSheet(box);
    const wallX = isWallRun(box, "x");
    const wallZ = isWallRun(box, "z");
    const w = floor || wallX ? box.w * sx : box.w;
    const d = floor || wallZ ? box.d * sz : box.d;
    return { ...box, x: box.x * sx, z: box.z * sz, w, d };
  };
  // The wall segments beside a door stretch with the arena, so the leaf must too or a gap opens.
  const spreadDoor = (door: DoorDef): DoorDef => ({
    ...door,
    x: door.x * sx,
    z: door.z * sz,
    w: door.w * (door.along === "x" ? sx : sz),
  });
  return {
    ...map,
    w: width,
    d: depth,
    boxes: map.boxes.map(spreadBox),
    doors: map.doors.map(spreadDoor),
    spawns: map.spawns.map((point) => ({ x: point.x * sx, z: point.z * sz })),
    hunterSpawns: map.hunterSpawns.map((point) => ({ x: point.x * sx, z: point.z * sz })),
  };
}

const partitionTheme = { color: "#e2d36a", pattern: "wallpaper" as Pattern, colors: ["#e2d36a", "#c9b84a"] };
const partition = (x: number, z: number, w: number, d: number): BoxDef =>
  B(x, z, w, d, partitionTheme.color, { h: 1.7, collide: true, pattern: partitionTheme.pattern, colors: partitionTheme.colors });
const desk = (x: number, z: number): BoxDef =>
  B(x, z, 1.8, 0.9, "#6d5c3a", { h: 0.78, collide: true, prop: "coffeeTable", collider: { w: 1.66, d: 0.8 }, pattern: "wood" });
const chair = (x: number, z: number, color = "#8c7742"): BoxDef =>
  B(x, z, 1.4, 0.9, color, { h: 0.95, collide: true, prop: "chair", pattern: "wood" });
const cabinet = (x: number, z: number, color = "#5a5a5a"): BoxDef =>
  B(x, z, 0.9, 0.6, color, { h: 1.5, collide: true });
const barrel = (x: number, z: number, color = "#b03a2e", size = 1.3): BoxDef =>
  B(x, z, size, size, color, { h: 1.2, collide: true, prop: "barrel", shape: "cylinder" });

/**
 * Extra cover for the larger (harder) arenas, placed in arena coordinates after the
 * spread so cover density stays close to the 8-player baseline as the area grows.
 * Candidates that would overlap existing colliders or crowd a spawn are dropped;
 * `droppedExtraCover` lets the audit script report them.
 */
function extraCover(map: GameMap): BoxDef[] {
  if (map.id === "backrooms") {
    const sofa = (x: number, z: number, color = "#8c7742") =>
      B(x, z, 3.4, 1.25, color, { h: 0.95, collide: true, prop: "sofa", collider: { w: 3.2, d: 1.12 } });
    const armchair = (x: number, z: number, color = "#8c7742") => B(x, z, 1.6, 1.4, color, { h: 0.95, collide: true, prop: "armchair" });
    const table = (x: number, z: number) =>
      B(x, z, 2.2, 1.4, "#6d5c3a", { h: 0.72, collide: true, prop: "coffeeTable", collider: { w: 2.02, d: 1.2 }, pattern: "wood" });
    const plant = (x: number, z: number) =>
      B(x, z, 1.3, 1.3, "#53734c", { h: 1.5, collide: true, prop: "plant", pattern: "leaves", colors: ["#53734c", "#354e30"] });
    const lamp = (x: number, z: number) => B(x, z, 1.1, 1.1, "#d6c57c", { h: 2.6, collide: true, prop: "floorLamp", shape: "cylinder" });
    const shelf = (x: number, z: number) =>
      B(x, z, 2.4, 0.65, "#6d5c3a", { h: 2.2, collide: true, prop: "bookshelf", collider: { w: 2.2, d: 0.58 }, pattern: "wood" });
    const rack = (x: number, z: number) =>
      B(x, z, 4, 0.6, "#7a7f86", { h: 2.2, collide: true, prop: "bookshelf", collider: { w: 3.8, d: 0.54 } });
    const server = (x: number, z: number) => B(x, z, 1, 1.2, "#26313a", { h: 2.1, collide: true, pattern: "dots", colors: ["#26313a", "#4fd1c5"] });
    const crate = (x: number, z: number, size = 1.2, h = 1) => B(x, z, size, size, "#5b4b32", { h, collide: true, pattern: "wood" });
    /** Three-sided cubicle: two partitions plus a desk and chair tucked inside. */
    const pod = (x: number, z: number) => [
      partition(x, z, 0.16, 5),
      partition(x + 0.16, z + 5.16, 4.84, 0.16),
      desk(x + 1, z + 1.5),
      chair(x + 1.4, z + 2.8),
    ];
    return [
      // 로비: 안내 데스크와 소파
      B(6, 2, 4, 1, "#3a3a3a", { h: 1.1, collide: true }),
      sofa(2, 7),
      armchair(12, 7),
      plant(14, 1.5),
      lamp(1, 1),
      // 복사실
      B(1, 11, 1.2, 0.8, "#6e6e6e", { h: 1.3, collide: true }),
      cabinet(6.5, 11),
      cabinet(6.5, 12),
      desk(1, 15),
      chair(1.4, 16.2),
      // 탕비실
      B(8.5, 10.5, 5, 0.7, "#cfd3c8", { h: 0.9, collide: true }),
      B(14.5, 10.6, 0.9, 0.8, "#e9ece6", { h: 1.9, collide: true }),
      table(10.8, 14),
      chair(9.5, 15.8),
      chair(13, 15.8),
      // 복도 B
      cabinet(13, 18.4),
      // 문서고: 어두운 책장 열
      shelf(2, 24),
      shelf(5, 24),
      shelf(9, 24),
      shelf(12, 24),
      shelf(2, 27.5),
      shelf(5, 27.5),
      shelf(9, 27.5),
      shelf(12, 27.5),
      cabinet(1, 30.5),
      cabinet(2, 30.5),
      crate(13.5, 30.2),
      // 라운지
      sofa(2, 34, "#7b3f2a"),
      sofa(2, 39, "#7b3f2a"),
      armchair(8, 35),
      table(9.5, 37.5),
      plant(14.2, 40),
      lamp(14.5, 33),
      B(9, 40.8, 3, 0.6, "#2a2a2a", { h: 0.7, collide: true }),
      // 중앙 복도
      B(19.2, 26, 0.5, 0.5, "#b9d4e6", { h: 1.3, collide: true }),
      cabinet(16.4, 12),
      // 사무실 A: 칸막이 부스 2개 + 캐비닛 줄
      ...pod(22, 1),
      ...pod(29, 1),
      cabinet(21, 12.8),
      cabinet(22, 12.8),
      cabinet(23, 12.8),
      plant(38.5, 1),
      // 회의실: 긴 테이블과 의자
      B(45, 4.5, 6, 2.2, "#4a3626", { h: 0.78, collide: true, pattern: "wood" }),
      chair(45, 3.3),
      chair(47.5, 3.3),
      chair(50, 3.3),
      chair(45, 7),
      chair(47.5, 7),
      chair(50, 7),
      // 창고: 선반 열과 상자
      rack(42, 14),
      rack(42, 18),
      rack(48, 14),
      rack(48, 18),
      crate(52, 21),
      crate(53.5, 21.5, 1, 0.8),
      crate(43, 21.5, 1.4, 1.1),
      // 사무실 B: 칸막이 부스 4개
      ...pod(22, 16),
      ...pod(29, 16),
      ...pod(22, 23.5),
      ...pod(29, 23.5),
      plant(38.5, 15),
      lamp(38.5, 28.5),
      // 휴게실
      B(40.5, 24.4, 1, 0.8, "#2a2a2a", { h: 1.9, collide: true }),
      B(41.8, 24.4, 1, 0.8, "#8b1e1e", { h: 1.9, collide: true }),
      table(46, 26),
      chair(44.5, 27.8),
      chair(48, 27.8),
      sofa(51, 24.5, "#365b78"),
      plant(54.3, 28.3),
      // 복도 C
      cabinet(54.5, 30.4),
      B(30, 33.2, 2, 0.6, "#6d5c3a", { h: 0.9, collide: true, pattern: "wood" }),
      // 사무실 C: 책상 줄
      desk(22, 36),
      chair(22.4, 37.2),
      desk(26, 36),
      chair(26.4, 37.2),
      desk(34, 36),
      chair(34.4, 37.2),
      cabinet(38.6, 40.9),
      cabinet(37.6, 40.9),
      // 서버실
      server(42, 35),
      server(42, 37.5),
      server(45.5, 35),
      server(45.5, 37.5),
      server(49, 35),
      server(49, 37.5),
      crate(53, 40),
    ];
  }
  if (map.id === "mansion") {
    const sofa = (x: number, z: number, color = "#7b3f2a") =>
      B(x, z, 3.4, 1.25, color, { h: 0.95, collide: true, prop: "sofa", collider: { w: 3.2, d: 1.12 }, texture: "/textures/velvet-ruby-v1.png" });
    const armchair = (x: number, z: number, color = "#a56832") => B(x, z, 1.6, 1.4, color, { h: 0.95, collide: true, prop: "armchair" });
    const table = (x: number, z: number) =>
      B(x, z, 2.2, 1.4, "#6d4420", { h: 0.72, collide: true, prop: "coffeeTable", collider: { w: 2.02, d: 1.2 }, pattern: "wood" });
    const plant = (x: number, z: number) =>
      B(x, z, 1.3, 1.3, "#2c6e4a", { h: 1.5, collide: true, prop: "plant", pattern: "leaves", colors: ["#2c6e4a", "#1e4d32"] });
    const lamp = (x: number, z: number) => B(x, z, 1.1, 1.1, "#d9c9a5", { h: 2.6, collide: true, prop: "floorLamp", shape: "cylinder" });
    const shelf = (x: number, z: number, rotation?: number) =>
      B(x, z, 2.4, 0.65, "#6d4420", { h: 2.3, collide: true, prop: "bookshelf", collider: { w: 2.2, d: 0.58 }, pattern: "wood", rotation });
    const woodChair = (x: number, z: number) => chair(x, z, "#8b5a2b");
    /** Velvet curtain hung 0.7m off the wall so a hider can slip behind it (no collision, blocks sight). */
    const curtain = (x: number, z: number, w: number, d: number) => B(x, z, w, d, "#7b1f2e", { h: 3.1, collide: false, pattern: "stripes", colors: ["#7b1f2e", "#5e1522"] });
    const step = (x: number, z: number, h: number) => B(x, z, 1.4, 3.6, "#6b4a32", { h, collide: true, pattern: "wood" });
    return [
      // 무도회장: 피아노, 커튼, 벨벳 소파
      B(1, 1, 2.4, 1.6, "#141414", { h: 1.1, collide: true }),
      curtain(1.9, 0.9, 0.7, 0.3),
      curtain(5.4, 0.9, 0.7, 0.3),
      curtain(9.9, 0.9, 0.7, 0.3),
      curtain(13.4, 0.9, 0.7, 0.3),
      curtain(17.9, 0.9, 0.7, 0.3),
      curtain(21.4, 0.9, 0.7, 0.3),
      sofa(6, 12.3),
      sofa(14.5, 12.3),
      armchair(1, 5.5),
      armchair(21.5, 8.5),
      table(10, 5),
      plant(22.4, 1.2),
      lamp(1, 12.6),
      // 서재: 책장 벽과 열
      shelf(25, 0.5),
      shelf(28, 0.5),
      shelf(31, 0.5),
      shelf(34, 0.5),
      shelf(39.2, 0.5),
      shelf(40.2, 3, Math.PI / 2),
      shelf(40.2, 7, Math.PI / 2),
      shelf(27, 6),
      shelf(30, 6),
      shelf(27, 9.5),
      shelf(30, 9.5),
      desk(35, 8),
      woodChair(35.4, 9.2),
      armchair(37, 12, "#2f5d3a"),
      lamp(25.4, 12.5),
      // 복도
      B(1, 14.5, 1.6, 0.5, "#6d4420", { h: 0.85, collide: true, pattern: "wood" }),
      lamp(28.4, 14.6),
      B(20, 17.2, 2, 0.6, "#6d4420", { h: 0.9, collide: true, pattern: "wood" }),
      // 계단 홀: 3단 계단과 속이 빈 단(밑에 누워 숨을 수 있다)
      step(33, 15.2, 0.3),
      step(34.4, 15.2, 0.6),
      step(35.8, 15.2, 0.9),
      { x: 39.4, y: 0.75, z: 17.1, w: 4.4, h: 0.3, d: 5.2, color: "#6b4a32", pattern: "wood", collide: true, role: "trim" },
      // 주방
      B(0.5, 18.5, 6, 0.7, "#e8e8e2", { h: 0.92, collide: true }),
      B(0.5, 31, 6, 0.7, "#e8e8e2", { h: 0.92, collide: true }),
      B(12.5, 18.5, 1, 0.9, "#f4f4f0", { h: 1.95, collide: true }),
      B(5, 24.5, 3.2, 1.4, "#3b3b3b", { h: 0.92, collide: true }),
      woodChair(4, 26.3),
      woodChair(6.5, 26.3),
      // 식당
      B(19, 23, 7, 2.2, "#4a3626", { h: 0.78, collide: true, pattern: "wood" }),
      woodChair(19.5, 21.6),
      woodChair(22.5, 21.6),
      woodChair(25.5, 21.6),
      woodChair(19.5, 25.5),
      woodChair(22.5, 25.5),
      woodChair(25.5, 25.5),
      B(14.5, 30.5, 4, 0.7, "#6d4420", { h: 1, collide: true, pattern: "wood" }),
      plant(28.4, 30.2),
      lamp(14.6, 18.6),
      // 온실
      plant(30.5, 20.5),
      plant(40.4, 20.5),
      plant(30.5, 30.4),
      plant(40.4, 30.4),
      table(34.5, 25),
      armchair(32.5, 27.5, "#b08a4e"),
      armchair(38, 27.5, "#b08a4e"),
      B(35, 30.8, 2.4, 0.6, "#b08a4e", { h: 0.9, collide: true, pattern: "wood" }),
    ];
  }
  if (map.id === "farm") {
    const hay = (x: number, z: number, size = 1.6, h = 1.1) => B(x, z, size, size * 0.75, "#d9a441", { h, collide: true, shape: "cylinder", pattern: "hay" });
    const hayStack = (x: number, z: number) => [hay(x, z), hay(x + 1.7, z + 0.1), hay(x + 0.85, z + 1.35, 1.6, 2.2)];
    /** Rows of tall corn: walkable lanes between them, no line of sight across. */
    const cornField = (x: number, z: number, rows: number, length: number) =>
      Array.from({ length: rows }, (_, i) =>
        B(x, z + i * 2, length, 0.7, "#6f9a3a", { h: 2.2, collide: true, pattern: "leaves", colors: ["#6f9a3a", "#c9b44a"] }),
      );
    const trough = (x: number, z: number) => B(x, z, 2.2, 0.7, "#5c5c5c", { h: 0.6, collide: true });
    const tree = (x: number, z: number) => [
      B(x, z, 0.6, 0.6, "#4a3320", { h: 3.2, collide: true, shape: "cylinder" }),
      { x: x + 0.3, y: 4.4, z: z + 0.3, w: 4.6, h: 3.6, d: 4.6, color: "#2f6b2e", shape: "sphere" as const, collide: false, role: "trim" as const, pattern: "leaves" as Pattern, colors: ["#2f6b2e", "#1f4a20"] },
    ];
    const crate = (x: number, z: number, size = 1.2, h = 1) => B(x, z, size, size, "#8a6a44", { h, collide: true, pattern: "wood" });
    const chair = (x: number, z: number) => B(x, z, 1.7, 0.9, "#8b5a2b", { h: 0.95, collide: true, prop: "chair", pattern: "wood" });
    const stall = (x: number, z: number, w: number, d: number) => B(x, z, w, d, "#8a6a44", { h: 1.4, collide: true, pattern: "wood", colors: ["#8a6a44", "#6f5232"] });
    return [
      // 헛간 안: 트랙터, 건초, 작업대, 칸막이 축사
      B(5, 3, 3.4, 4.6, "#2e7d32", { h: 2.2, collide: true, pattern: "stripes", colors: ["#2e7d32", "#1b5e20"] }),
      B(5.3, 7.9, 1.2, 1.2, "#111", { h: 1.2, collide: true, shape: "cylinder" }),
      ...hayStack(15, 3),
      hay(17.5, 12.5),
      hay(15.5, 13),
      B(4.6, 12.5, 4, 0.9, "#6d4420", { h: 0.95, collide: true, pattern: "wood" }),
      stall(10, 3, 0.16, 4),
      stall(10, 9, 0.16, 4),
      stall(13, 9, 0.16, 4),
      crate(11, 4.5, 1, 0.8),
      // 마당: 나무, 건초 더미, 물통, 우물, 수레
      ...tree(2, 2.5),
      ...tree(38.5, 12),
      ...tree(2.5, 29),
      ...hayStack(8, 20),
      hay(14, 23),
      hay(16, 19),
      trough(23, 4),
      B(24, 17, 1.6, 1.6, "#7d7d7d", { h: 1.1, collide: true, shape: "cylinder", pattern: "bricks", colors: ["#7d7d7d", "#5b5b5b"] }),
      ...cornField(29, 11, 5, 9),
      B(12, 30, 2.2, 1.6, "#e39b2d", { h: 1.1, collide: true, shape: "cylinder", pattern: "hay" }),
      B(15, 29.8, 2.2, 1.6, "#d79a2d", { h: 1.1, collide: true, shape: "cylinder", pattern: "hay" }),
      chair(4, 25),
      chair(6.5, 25),
      B(4.5, 27, 2.4, 1.1, "#6d4420", { h: 0.75, collide: true, prop: "coffeeTable", collider: { w: 2.2, d: 1 }, pattern: "wood" }),
      // 닭장: 작은 닭집과 모이통
      B(35, 3, 2.4, 1.8, "#c9b48a", { h: 1.5, collide: true, pattern: "wood" }),
      trough(30, 6.5),
      // 돼지우리: 진흙과 여물통
      { x: 26, y: 0.02, z: 26, w: 5, h: 0.04, d: 5, color: "#6b4a2e", collide: false, role: "decal" as const },
      trough(23, 28.5),
      B(27, 23, 1.8, 1.4, "#8a6a44", { h: 1.1, collide: true, pattern: "wood" }),
      // 창고 안
      crate(31, 23),
      crate(32.4, 23, 1, 0.8),
      crate(31.4, 24.4, 1, 1.4),
      B(36, 28.2, 3.4, 0.9, "#6d4420", { h: 2.2, collide: true, prop: "bookshelf", collider: { w: 3.2, d: 0.8 }, pattern: "wood" }),
      B(38, 23, 1.3, 1.3, "#922b21", { h: 1.2, collide: true, prop: "barrel", shape: "cylinder" }),
    ];
  }
  if (map.id === "sewer") {
    return [
      barrel(41, 5),
      B(20, 5, 2.0, 1.2, "#2c3e50", { h: 1.1, collide: true, pattern: "graffiti", colors: ["#2c3e50", "#e74c3c"] }),
      barrel(10.5, 15, "#922b21", 1.2),
      B(40, 30.2, 3.4, 1.25, "#365b78", { h: 0.95, collide: true, prop: "sofa", collider: { w: 3.2, d: 1.12 } }),
      B(44, 20, 1.6, 1.4, "#5b6b58", { h: 0.95, collide: true, prop: "armchair" }),
      B(27, 30.5, 1.8, 1.1, "#7f8c8d", { h: 1.2, collide: true, pattern: "stripes", colors: ["#7f8c8d", "#111"] }),
    ];
  }
  return [];
}

export const droppedExtraCover: Record<string, string[]> = {};

/** Overlap deeper than a touch on both axes (collider outsets make neighbours graze each other). */
function aabbOverlap(a: Collider, b: Collider, tolerance = 0.12) {
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return overlapX > tolerance && overlapZ > tolerance;
}

function withExtraCover(map: GameMap): GameMap {
  const candidates = extraCover(map);
  if (candidates.length === 0) return map;
  const spawns = [...map.spawns, ...map.hunterSpawns];
  let boxes = [...map.boxes];
  const dropped: string[] = [];
  for (const candidate of candidates) {
    const existing = mapColliders({ ...map, boxes }).filter((c) => c.minY < 1.5);
    const [self] = mapColliders({ ...map, boxes: [candidate] });
    const label = `${candidate.prop ?? candidate.pattern ?? "box"}@(${candidate.x.toFixed(1)}, ${candidate.z.toFixed(1)})`;
    if (!self) {
      // Non-colliding dressing (curtains, rugs) cannot block anything; place it as is.
      if (candidate.collide === false) boxes = [...boxes, candidate];
      else dropped.push(`${label}: no collider`);
      continue;
    }
    const inside = self.minX > 0.2 && self.maxX < map.w - 0.2 && self.minZ > 0.2 && self.maxZ < map.d - 0.2;
    const clash = existing.find((c) => aabbOverlap(self, c));
    const nearSpawn = spawns.find((p) => p.x > self.minX - 1.1 && p.x < self.maxX + 1.1 && p.z > self.minZ - 1.1 && p.z < self.maxZ + 1.1);
    if (!inside) dropped.push(`${label}: outside arena`);
    else if (clash) dropped.push(`${label}: overlaps (${clash.minX.toFixed(1)}..${clash.maxX.toFixed(1)}, ${clash.minZ.toFixed(1)}..${clash.maxZ.toFixed(1)})`);
    else if (nearSpawn) dropped.push(`${label}: crowds spawn (${nearSpawn.x.toFixed(1)}, ${nearSpawn.z.toFixed(1)})`);
    else boxes = [...boxes, candidate];
  }
  if (dropped.length) droppedExtraCover[map.id] = dropped;
  return { ...map, boxes };
}

/** Room-based maps are authored at final arena size: walls, doors, ceilings and lights come from the room list. */
function withRooms(map: GameMap): GameMap {
  if (!map.rooms?.length) return map;
  const built = buildRooms(map.rooms, map.ceiling, map.id);
  return {
    ...map,
    boxes: [...built.boxes, ...map.boxes],
    doors: [...built.doors, ...(map.doors ?? [])],
    lights: [...(map.lights ?? []), ...built.lights],
  };
}

export const MAPS: GameMap[] = [mansion, farm, sewer, backrooms].map((m) => {
  if (m.rooms?.length) return clearSpawns(withExtraCover(withRooms(m)));
  const size = ARENA_BY_DIFFICULTY[m.difficulty];
  return clearSpawns(withExtraCover(spreadMapToArena(stageLayout(m), size.width, size.depth)));
});

function rotY(x: number, z: number, ang: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: x * c - z * s, z: x * s + z * c };
}

function doorSegment(door: DoorDef, ang: number, a: number, b: number, pad: number): Collider {
  const hx = door.along === "x" ? door.x - door.w / 2 : door.x;
  const hz = door.along === "z" ? door.z - door.w / 2 : door.z;
  const corners: { x: number; z: number }[] = [];
  if (door.along === "x") {
    for (const lx of [a, b]) {
      for (const lz of [-door.d / 2, door.d / 2]) {
        const r = rotY(lx, lz, ang);
        corners.push({ x: hx + r.x, z: hz + r.z });
      }
    }
  } else {
    for (const lz of [a, b]) {
      for (const lx of [-door.d / 2, door.d / 2]) {
        const r = rotY(lx, lz, ang);
        corners.push({ x: hx + r.x, z: hz + r.z });
      }
    }
  }
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minZ: Math.min(...zs) - pad,
    maxZ: Math.max(...zs) + pad,
    minY: 0,
    maxY: door.h,
  };
}

export function doorColliders(door: DoorDef, open = false): Collider[] {
  const ang = open ? 1.84 : 0;
  const pad = open ? 0.05 : 0.1;
  const n = Math.max(5, Math.ceil(door.w / 0.26));
  const out: Collider[] = [];
  for (let i = 0; i < n; i++) {
    out.push(doorSegment(door, ang, (i / n) * door.w, ((i + 1) / n) * door.w, pad));
  }
  return out;
}

export function getMap(id: string) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

function isSolidProp(b: BoxDef) {
  if (b.collide === false) return false;
  if (b.h <= 0.22) return false;
  if (b.collide) return b.w >= 0.16 && b.d >= 0.16;
  if (b.w < 0.32 || b.d < 0.32) return false;
  return b.h >= 0.45 && b.w >= 0.45 && b.d >= 0.45;
}

export function mapColliders(map: GameMap) {
  const pad = -BOX_COLLIDE_OUTSET;
  return map.boxes
    .filter(isSolidProp)
    .map((b) => {
      const profile = b.collider;
      const w = profile?.w ?? b.w;
      const d = profile?.d ?? b.d;
      const h = profile?.h ?? b.h;
      const y = profile?.y ?? b.y;
      const rotation = b.rotation ?? 0;
      const halfW = w / 2 - pad;
      const halfD = d / 2 - pad;
      const c = Math.abs(Math.cos(rotation));
      const s = Math.abs(Math.sin(rotation));
      const extentX = c * halfW + s * halfD;
      const extentZ = s * halfW + c * halfD;
      return {
        minX: b.x - extentX,
        maxX: b.x + extentX,
        minZ: b.z - extentZ,
        maxZ: b.z + extentZ,
        minY: y - h / 2,
        maxY: y + h / 2,
        centerX: b.x,
        centerZ: b.z,
        halfW,
        halfD,
        rotation,
      };
    })
    .filter((b) => b.maxX - b.minX > 0.2 && b.maxZ - b.minZ > 0.2);
}
