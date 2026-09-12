import type { BoxDef, GameMap, Pattern } from "./types";

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
    pattern: extra.pattern,
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
): BoxDef =>
  B(x, z, w, d, color, { h, y: 0, collide: true, pattern: "bricks", colors: [color, "#3a281e"] });

const books: Pattern = "books";
const bookColors = ["#c0392b", "#2980b9", "#27ae60", "#f1c40f", "#8e44ad", "#e67e22", "#1abc9c", "#34495e"];

const mansion: GameMap = {
  id: "mansion",
  name: "숨바꼭질 저택",
  blurb: "넓은 홀. 가구에 붙어 위장하세요. 가구는 지나갈 수 있습니다.",
  difficulty: "쉬움",
  w: 48,
  d: 36,
  ceiling: 4.2,
  fog: "#241810",
  floor: "#c4a06a",
  hunterSpawns: [{ x: 24, z: 33.5 }],
  spawns: [
    { x: 8, z: 8 },
    { x: 16, z: 12 },
    { x: 24, z: 10 },
    { x: 32, z: 8 },
    { x: 40, z: 14 },
    { x: 36, z: 24 },
    { x: 18, z: 26 },
    { x: 10, z: 22 },
  ],
  boxes: [
    B(1, 1, 46, 34, "#c4a06a", { h: 0.04, pattern: "wood" }),
    B(2, 2, 8, 0.18, "#6b3a2a", { h: 3.6, pattern: "wallpaper", colors: ["#6b3a2a", "#8a5040"] }),
    B(12, 2, 10, 0.18, "#1f4d6e", { h: 3.2, pattern: "wallpaper", colors: ["#1f4d6e", "#2e6a8f"] }),
    B(28, 2, 8, 0.18, "#6a8f6a", { h: 2.8, pattern: "leaves" }),
    B(2.4, 3.2, 3.4, 1.1, "#a32638", { h: 0.85 }),
    B(7, 3.4, 2.8, 0.5, "#5c2e12", { h: 2.5, pattern: books, colors: bookColors }),
    B(18, 3.5, 1.4, 1.4, "#2c6e4a", { h: 1.5, pattern: "leaves", colors: ["#2c6e4a", "#1e4d32"] }),
    B(22, 3.2, 3.2, 2.0, "#9b2a2a", { h: 0.08, pattern: "dots", colors: ["#9b2a2a", "#c0392b"] }),
    B(30, 3.4, 4.2, 0.5, "#5b3a28", { h: 2.6, pattern: books, colors: bookColors }),
    B(38, 3.6, 2.2, 1.6, "#e8d5a3", { h: 1.4, y: 0.9, pattern: "stripes", colors: ["#e8d5a3", "#c9a66b"] }),
    B(23.4, 16, 1.1, 1.1, "#d9c9a5", { h: 3.4, collide: true, pattern: "bricks" }),
    B(6, 18, 3.6, 2.2, "#d9c4a0", { h: 0.06, pattern: "check", colors: ["#d9c4a0", "#c3a57a"] }),
    B(8, 20, 1.6, 1.4, "#8b4513", { h: 0.7, pattern: "wood" }),
    B(14, 22, 2.2, 1.2, "#7a3426", { h: 0.9 }),
    B(32, 18, 4.0, 3.2, "#d8cfc0", { h: 0.05, pattern: "tiles", colors: ["#efe8dc", "#d2c4b0"] }),
    B(33, 20, 1.6, 0.8, "#c45c26", { h: 0.9 }),
    B(36, 20, 1.6, 0.8, "#c45c26", { h: 0.9 }),
    B(38, 24, 5.5, 6, "#d5e4e2", { h: 0.05, pattern: "tiles", colors: ["#d5e4e2", "#b9cdc9"] }),
    B(40, 26, 1.6, 1.8, "#eef6f4", { h: 1.6, pattern: "tiles" }),
    B(43, 26, 1.6, 1.8, "#9ec5c1", { h: 0.55, pattern: "tiles" }),
    B(4, 28, 2.4, 2.4, "#2f4f3a", { h: 1.3, pattern: "leaves" }),
    wall(0, 0, 48, 0.4),
    wall(0, 35.6, 20, 0.4),
    wall(28, 35.6, 20, 0.4),
    wall(0, 0, 0.4, 36),
    wall(47.6, 0, 0.4, 36),
  ],
};

const farm: GameMap = {
  id: "farm",
  name: "실내 농장",
  blurb: "탁 트인 헛간. 건초·호박에 붙어 숨으세요.",
  difficulty: "쉬움",
  w: 52,
  d: 38,
  ceiling: 6,
  fog: "#2a2214",
  floor: "#c2a05a",
  hunterSpawns: [{ x: 26, z: 35 }],
  spawns: [
    { x: 8, z: 8 },
    { x: 18, z: 12 },
    { x: 28, z: 9 },
    { x: 38, z: 11 },
    { x: 44, z: 18 },
    { x: 36, z: 26 },
    { x: 20, z: 24 },
    { x: 10, z: 22 },
  ],
  boxes: [
    B(1, 1, 50, 36, "#c2a05a", { h: 0.05, pattern: "hay", colors: ["#c2a05a", "#d4b36a"] }),
    B(1, 1, 50, 0.1, "#7ec8e8", { h: 5.5, y: 3.2 }),
    B(2, 2, 8, 0.22, "#d3533a", { h: 3.2, pattern: "wood", colors: ["#d3533a", "#b43c28"] }),
    B(14, 2, 10, 0.22, "#f0c43a", { h: 2.8, pattern: "dots", colors: ["#f0c43a", "#e0a820"] }),
    B(28, 2, 10, 0.22, "#5aa0d6", { h: 2.8, pattern: "wallpaper", colors: ["#5aa0d6", "#3d7eaf"] }),
    B(42, 2, 8, 0.22, "#6fbf57", { h: 2.6, pattern: "leaves" }),
    B(4, 6, 2.2, 1.6, "#e39b2d", { h: 0.95, pattern: "hay" }),
    B(8, 8, 2.2, 1.6, "#e39b2d", { h: 0.95, pattern: "hay" }),
    B(6, 12, 1.6, 1.4, "#d35400", { h: 0.8 }),
    B(20, 8, 1.6, 1.2, "#e67e22", { h: 0.7 }),
    B(24, 10, 1.4, 1.2, "#d35400", { h: 0.65 }),
    B(32, 8, 3.2, 2.2, "#f4f0e4", { h: 1.5, pattern: "dots", colors: ["#f4f0e4", "#111"] }),
    B(40, 9, 2.4, 1.8, "#6fbf57", { h: 1.2, pattern: "leaves" }),
    B(12, 20, 0.22, 8, "#8b5a2b", { h: 1.1, pattern: "wood" }),
    B(26, 18, 0.9, 0.9, "#8b5a2b", { h: 3.6, collide: true, pattern: "wood" }),
    B(4, 24, 2.0, 1.6, "#c0392b", { h: 1.1, pattern: "wood" }),
    B(8, 26, 2.8, 2.0, "#7b5428", { h: 1.1, pattern: "hay" }),
    B(18, 24, 1.6, 0.14, "#f7efe0", { h: 2.0, y: 0.7 }),
    B(22, 24, 1.6, 0.14, "#f7efe0", { h: 2.0, y: 0.7 }),
    B(34, 22, 1.6, 1.3, "#e67e22", { h: 0.7 }),
    B(38, 24, 1.6, 1.3, "#d35400", { h: 0.7 }),
    B(42, 22, 2.2, 1.8, "#6fbf57", { h: 1.2, pattern: "leaves" }),
    wall(0, 0, 52, 0.4, "#5a3a22", 5.5),
    wall(0, 37.6, 22, 0.4, "#5a3a22", 5.5),
    wall(30, 37.6, 22, 0.4, "#5a3a22", 5.5),
    wall(0, 0, 0.4, 38, "#5a3a22", 5.5),
    wall(51.6, 0, 0.4, 38, "#5a3a22", 5.5),
  ],
};

const sewer: GameMap = {
  id: "sewer",
  name: "하수도",
  blurb: "넓은 지하 홀. 드럼·그래피티에 녹아드세요.",
  difficulty: "보통",
  w: 46,
  d: 34,
  ceiling: 4.4,
  fog: "#101816",
  floor: "#3d4a43",
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
    B(2, 2, 8, 0.22, "#c0392b", { h: 3.2, pattern: "graffiti", colors: ["#c0392b", "#f1c40f", "#3498db", "#2ecc71"] }),
    B(14, 2, 10, 0.22, "#1f6f4a", { h: 3.0, pattern: "graffiti", colors: ["#1f6f4a", "#f39c12", "#e74c3c"] }),
    B(30, 2, 12, 0.22, "#8e44ad", { h: 3.0, pattern: "graffiti", colors: ["#8e44ad", "#f1c40f", "#1abc9c"] }),
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
    wall(0, 0, 46, 0.4, "#1b2420", 4.2),
    wall(0, 33.6, 18, 0.4, "#1b2420", 4.2),
    wall(28, 33.6, 18, 0.4, "#1b2420", 4.2),
    wall(0, 0, 0.4, 34, "#1b2420", 4.2),
    wall(45.6, 0, 0.4, 34, "#1b2420", 4.2),
  ],
};

function expandMap(map: GameMap, s: number): GameMap {
  return {
    ...map,
    w: map.w * s,
    d: map.d * s,
    ceiling: map.ceiling * 1.35,
    spawns: map.spawns.map((p) => ({ x: p.x * s, z: p.z * s })),
    hunterSpawns: map.hunterSpawns.map((p) => ({ x: p.x * s, z: p.z * s })),
    boxes: map.boxes.map((b) => {
      const floor = b.h <= 0.1;
      const wallLike =
        !!b.collide &&
        (b.w >= map.w * 0.25 || b.d >= map.d * 0.25 || b.w <= 0.55 || b.d <= 0.55);
      const thinDecor = !b.collide && (b.d <= 0.28 || b.w <= 0.28);
      let w = b.w;
      let d = b.d;
      if (floor || wallLike) {
        w *= s;
        d *= s;
      } else if (thinDecor) {
        if (b.d <= 0.28) w *= s;
        if (b.w <= 0.28) d *= s;
      }
      return { ...b, x: b.x * s, z: b.z * s, w, d };
    }),
  };
}

export const MAPS: GameMap[] = [mansion, farm, sewer].map((m) => expandMap(m, 5));

export function getMap(id: string) {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function mapColliders(map: GameMap): { minX: number; maxX: number; minZ: number; maxZ: number }[] {
  const pad = 0.08;
  return map.boxes
    .filter((b) => b.collide)
    .map((b) => ({
      minX: b.x - b.w / 2 + pad,
      maxX: b.x + b.w / 2 - pad,
      minZ: b.z - b.d / 2 + pad,
      maxZ: b.z + b.d / 2 - pad,
    }))
    .filter((b) => b.maxX - b.minX > 0.12 && b.maxZ - b.minZ > 0.12);
}
