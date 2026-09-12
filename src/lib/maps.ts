import { circleHitsBox, resolveStuck } from "./engine/collision";
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
  blurb: "무도회장·서재·주방. 책장·액자·타일에 녹아드세요.",
  difficulty: "쉬움",
  w: 48,
  d: 36,
  ceiling: 4.2,
  fog: "#241810",
  floor: "#c4a06a",
  doors: [],
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
    B(2, 2, 8, 0.18, "#6b3a2a", { h: 3.6, collide: true, pattern: "wallpaper", colors: ["#6b3a2a", "#8a5040"] }),
    B(12, 2, 10, 0.18, "#1f4d6e", { h: 3.2, collide: true, pattern: "wallpaper", colors: ["#1f4d6e", "#2e6a8f"] }),
    B(28, 2, 8, 0.18, "#6a8f6a", { h: 2.8, collide: true, pattern: "leaves" }),
    B(10, 11, 0.2, 8, "#6b3a2a", { h: 2.9, collide: true, pattern: "wallpaper", colors: ["#6b3a2a", "#8a5040"] }),
    B(20, 9, 9, 0.2, "#1f4d6e", { h: 2.5, collide: true, pattern: "wallpaper", colors: ["#1f4d6e", "#2e6a8f"] }),
    B(33, 12, 0.2, 7, "#6a8f6a", { h: 2.7, collide: true, pattern: "leaves" }),
    B(5, 8, 2.6, 1.1, "#a32638", { h: 0.85 }),
    B(26, 14, 2.4, 0.5, "#5c2e12", { h: 2.35, pattern: books, colors: bookColors }),
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
    B(15, 8, 1.8, 0.08, "#d4b483", { h: 1.3, y: 1.1, collide: true, pattern: "stripes", colors: ["#d4b483", "#6b3a2a"] }),
    B(34, 7, 1.6, 0.08, "#2e6a8f", { h: 1.2, y: 1.2, collide: true, pattern: "dots", colors: ["#2e6a8f", "#f3f1ea"] }),
    B(9, 15, 0.9, 0.9, "#c9a66b", { h: 1.1, collide: true, pattern: "wood" }),
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
  blurb: "소·건초·호박·빨간 문. 넓은 색면에 붙기 좋습니다.",
  difficulty: "쉬움",
  w: 52,
  d: 38,
  ceiling: 6,
  fog: "#2a2214",
  floor: "#c2a05a",
  doors: [],
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
    B(2, 2, 8, 0.22, "#d3533a", { h: 3.2, collide: true, pattern: "wood", colors: ["#d3533a", "#b43c28"] }),
    B(14, 2, 10, 0.22, "#f0c43a", { h: 2.8, collide: true, pattern: "dots", colors: ["#f0c43a", "#e0a820"] }),
    B(28, 2, 10, 0.22, "#5aa0d6", { h: 2.8, collide: true, pattern: "wallpaper", colors: ["#5aa0d6", "#3d7eaf"] }),
    B(42, 2, 8, 0.22, "#6fbf57", { h: 2.6, collide: true, pattern: "leaves" }),
    B(16, 12, 0.22, 10, "#8b5a2b", { h: 2.4, collide: true, pattern: "wood" }),
    B(30, 14, 10, 0.22, "#5aa0d6", { h: 2.2, collide: true, pattern: "wallpaper", colors: ["#5aa0d6", "#3d7eaf"] }),
    B(8, 16, 2.4, 1.5, "#e39b2d", { h: 1.05, pattern: "hay" }),
    B(36, 16, 1.8, 1.4, "#6fbf57", { h: 1.25, pattern: "leaves" }),
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
    B(14, 14, 1.3, 1.3, "#e67e22", { h: 0.85, collide: true }),
    B(16, 15, 1.1, 1.1, "#d35400", { h: 0.7, collide: true }),
    B(22, 16, 2.0, 1.1, "#f4f0e4", { h: 1.6, collide: true, pattern: "dots", colors: ["#f4f0e4", "#111"] }),
    B(44, 12, 1.4, 0.9, "#c0392b", { h: 2.1, collide: true, pattern: "wood" }),
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
  blurb: "파이프·드럼·그래피티. 어두운 구석보다 무늬에 녹으세요.",
  difficulty: "보통",
  w: 46,
  d: 34,
  ceiling: 4.4,
  fog: "#101816",
  floor: "#3d4a43",
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
    wall(0, 0, 46, 0.4, "#1b2420", 4.2),
    wall(0, 33.6, 18, 0.4, "#1b2420", 4.2),
    wall(28, 33.6, 18, 0.4, "#1b2420", 4.2),
    wall(0, 0, 0.4, 34, "#1b2420", 4.2),
    wall(45.6, 0, 0.4, 34, "#1b2420", 4.2),
    B(18, 18, 1.1, 0.7, "#2c3e50", { h: 1.8, collide: true }),
    B(28, 20, 1.4, 0.8, "#c0392b", { h: 1.7, collide: true, pattern: "dots", colors: ["#c0392b", "#111"] }),
  ],
};

const backrooms: GameMap = {
  id: "backrooms",
  name: "백룸",
  blurb: "노란 사무실. 의자·서랍·형광 벽 가장자리에 붙으세요.",
  difficulty: "어려움",
  w: 40,
  d: 30,
  ceiling: 3.6,
  fog: "#b8a84a",
  floor: "#d4c56a",
  doors: [],
  hunterSpawns: [{ x: 20, z: 27.5 }],
  spawns: [
    { x: 6, z: 6 },
    { x: 14, z: 8 },
    { x: 22, z: 7 },
    { x: 30, z: 9 },
    { x: 33, z: 16 },
    { x: 24, z: 20 },
    { x: 12, z: 18 },
    { x: 7, z: 14 },
  ],
  boxes: [
    B(1, 1, 38, 28, "#d4c56a", { h: 0.04, pattern: "tiles", colors: ["#d4c56a", "#c4b44a"] }),
    B(2, 2, 10, 0.18, "#e2d36a", { h: 3.2, collide: true, pattern: "wallpaper", colors: ["#e2d36a", "#c9b84a"] }),
    B(14, 2, 12, 0.18, "#e8dc7a", { h: 3.2, collide: true, pattern: "wallpaper", colors: ["#e8dc7a", "#d4c56a"] }),
    B(28, 2, 10, 0.18, "#d4c56a", { h: 3.2, collide: true, pattern: "wallpaper", colors: ["#d4c56a", "#b8a84a"] }),
    B(6, 8, 1.4, 0.7, "#6d5c3a", { h: 0.95, collide: true, pattern: "wood" }),
    B(8, 8, 0.55, 0.55, "#2c2c2c", { h: 1.05, collide: true }),
    B(18, 10, 1.6, 0.8, "#6d5c3a", { h: 0.9, collide: true, pattern: "wood" }),
    B(20, 10, 0.55, 0.55, "#1a1a1a", { h: 1.05, collide: true }),
    B(26, 9, 1.2, 1.2, "#4a4a4a", { h: 1.2, collide: true }),
    B(12, 16, 0.9, 0.9, "#5a4a32", { h: 0.85, collide: true, pattern: "wood" }),
    B(13, 16.2, 0.9, 0.9, "#5a4a32", { h: 0.85, y: 0.85, collide: true, pattern: "wood" }),
    B(30, 14, 1.8, 1.1, "#3d3d3d", { h: 1.15, collide: true }),
    B(5, 20, 1.3, 1.0, "#2f2f2f", { h: 1.3, collide: true, pattern: "bricks", colors: ["#2f2f2f", "#111"] }),
    B(22, 18, 2.2, 0.16, "#e74c3c", { h: 1.4, y: 0.9, collide: true, pattern: "stripes", colors: ["#e74c3c", "#f1c40f"] }),
    wall(0, 0, 40, 0.4, "#c9b84a", 3.5),
    wall(0, 29.6, 16, 0.4, "#c9b84a", 3.5),
    wall(24, 29.6, 16, 0.4, "#c9b84a", 3.5),
    wall(0, 0, 0.4, 30, "#c9b84a", 3.5),
    wall(39.6, 0, 0.4, 30, "#c9b84a", 3.5),
  ],
};

function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function nearSpawn(map: GameMap, x: number, z: number, dist: number) {
  const pts = [...map.spawns, ...map.hunterSpawns];
  return pts.some((p) => Math.hypot(p.x - x, p.z - z) < dist);
}

function nook(x: number, z: number, color: string, pattern: Pattern, colors?: string[], h = 2.5): BoxDef[] {
  return [
    B(x, z, 2.4, 0.24, color, { h, collide: true, pattern, colors }),
    B(x, z, 0.24, 2.2, color, { h, collide: true, pattern, colors }),
  ];
}

function alcove(x: number, z: number, color: string, pattern: Pattern, colors?: string[]): BoxDef[] {
  return [
    B(x, z, 2.6, 0.24, color, { h: 2.4, collide: true, pattern, colors }),
    B(x, z, 0.24, 1.7, color, { h: 2.4, collide: true, pattern, colors }),
    B(x + 2.36, z, 0.24, 1.7, color, { h: 2.4, collide: true, pattern, colors }),
  ];
}

function cluster(theme: string, x: number, z: number, kind: number, rnd: () => number): BoxDef[] {
  const j = () => (rnd() - 0.5) * 1.1;
  if (theme === "backrooms") {
    if (kind === 0) return [B(x, z, 1.5, 0.7, "#6d5c3a", { h: 0.9, collide: true, pattern: "wood" })];
    if (kind === 1) return [B(x, z, 0.55, 0.55, "#222", { h: 1.05, collide: true })];
    if (kind === 2) return nook(x, z, "#e2d36a", "wallpaper", ["#e2d36a", "#c9b84a"], 2.4);
    if (kind === 3)
      return [
        B(x, z, 0.9, 0.9, "#5a4a32", { h: 0.8, collide: true, pattern: "wood" }),
        B(x + 0.1, z + 0.1, 0.9, 0.9, "#5a4a32", { h: 0.8, y: 0.8, collide: true, pattern: "wood" }),
      ];
    return [B(x, z, 1.3, 0.9, "#3a3a3a", { h: 1.15, collide: true })];
  }
  if (theme === "farm") {
    if (kind === 0) return [B(x, z, 1.8, 1.3, "#e39b2d", { h: 1.05, collide: true, pattern: "hay" })];
    if (kind === 1)
      return [
        B(x, z, 1.2, 1.2, "#c47a3a", { h: 1.15, collide: true, pattern: "wood" }),
        B(x + 1.35, z + j(), 1.1, 1.1, "#d35400", { h: 0.95, collide: true }),
        B(x + 0.2, z + 1.3, 1.0, 1.0, "#e67e22", { h: 0.7, collide: true }),
      ];
    if (kind === 2) return nook(x, z, "#8b5a2b", "wood", ["#8b5a2b", "#6d4420"], 2.4);
    if (kind === 3) return [B(x, z, 0.85, 0.85, "#8b5a2b", { h: 2.8, collide: true, pattern: "wood" })];
    if (kind === 4)
      return [
        B(x, z, 2.2, 1.5, "#7b5428", { h: 1.1, collide: true, pattern: "hay" }),
        B(x + 1.6, z + 0.4, 1.3, 1.2, "#6fbf57", { h: 1.3, collide: true, pattern: "leaves" }),
      ];
    if (kind === 5) return alcove(x, z, "#d3533a", "wood", ["#d3533a", "#b43c28"]);
    if (kind === 6)
      return [B(x, z, 2.8, 0.22, "#f0c43a", { h: 2.3, collide: true, pattern: "dots", colors: ["#f0c43a", "#e0a820"] })];
    return [
      B(x, z, 1.5, 1.1, "#c0392b", { h: 1.05, collide: true, pattern: "wood" }),
      B(x + 1.6, z + j(), 1.1, 1.4, "#e39b2d", { h: 0.9, collide: true, pattern: "hay" }),
    ];
  }
  if (theme === "sewer") {
    if (kind === 0) return [B(x, z, 1.15, 1.15, "#b03a2e", { h: 1.25, collide: true })];
    if (kind === 1)
      return [
        B(x, z, 1.2, 1.2, "#922b21", { h: 1.2, collide: true }),
        B(x + 1.3, z + j(), 1.15, 1.15, "#c0392b", { h: 1.15, collide: true }),
        B(x + 0.4, z + 1.4, 1.1, 1.1, "#b03a2e", { h: 0.85, collide: true }),
      ];
    if (kind === 2) return [B(x, z, 0.9, 0.9, "#c47a3a", { h: 3.2, collide: true, pattern: "pipes" })];
    if (kind === 3)
      return [B(x, z, 2.2, 1.6, "#2c3e50", { h: 1.7, collide: true, pattern: "graffiti", colors: ["#e74c3c", "#3498db"] })];
    if (kind === 4) return nook(x, z, "#1b2420", "bricks", ["#1b2420", "#2a3830"], 2.6);
    if (kind === 5) return alcove(x, z, "#8e44ad", "graffiti", ["#8e44ad", "#f1c40f"]);
    if (kind === 6)
      return [B(x, z, 0.22, 2.8, "#c47a3a", { h: 2.5, collide: true, pattern: "pipes" })];
    return [B(x, z, 1.8, 1.3, "#f1c40f", { h: 1.1, collide: true, pattern: "stripes", colors: ["#f1c40f", "#111"] })];
  }
  if (kind === 0) return [B(x, z, 2.6, 1.05, "#a32638", { h: 0.88, collide: true })];
  if (kind === 1)
    return [B(x, z, 2.4, 0.55, "#5c2e12", { h: 2.35, collide: true, pattern: books, colors: bookColors })];
  if (kind === 2)
    return [
      B(x, z, 1.15, 1.15, "#8b5a2b", { h: 1.1, collide: true, pattern: "wood" }),
      B(x + 0.15, z + 0.15, 0.95, 0.95, "#6d4c2a", { h: 0.7, y: 1.1, collide: true, pattern: "wood" }),
    ];
  if (kind === 3) return [B(x, z, 0.9, 0.9, "#d9c9a5", { h: 3.3, collide: true, pattern: "bricks" })];
  if (kind === 4)
    return [
      B(x, z, 1.2, 1.2, "#2c6e4a", { h: 1.45, collide: true, pattern: "leaves", colors: ["#2c6e4a", "#1e4d32"] }),
      B(x + 1.5, z + j(), 1.1, 1.1, "#6d4c2a", { h: 0.95, collide: true, pattern: "wood" }),
    ];
  if (kind === 5) return nook(x, z, "#6b3a2a", "wallpaper", ["#6b3a2a", "#8a5040"], 2.6);
  if (kind === 6) return alcove(x, z, "#1f4d6e", "wallpaper", ["#1f4d6e", "#2e6a8f"]);
  if (kind === 7)
    return [
      B(x, z, 1.8, 1.5, "#c45c26", { h: 0.9, collide: true }),
      B(x + 1.7, z + 0.2, 0.9, 0.9, "#f4f0e6", { h: 1.35, collide: true }),
      B(x - 0.2, z + 1.5, 2.2, 0.7, "#d9c4a0", { h: 0.45, collide: true, pattern: "wood" }),
    ];
  return [B(x, z, 2.2, 0.22, "#6a8f6a", { h: 2.4, collide: true, pattern: "leaves" })];
}

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

function partitionMap(map: GameMap): GameMap {
  const theme = wallTheme(map.id);
  const h = Math.max(3.6, map.ceiling - 0.08);
  const thick = 0.4;
  const pad = 1.4;
  let xs: number[];
  let zs: number[];
  if (map.id === "farm") {
    xs = [0.33, 0.54, 0.75].map((t) => t * map.w);
    zs = [0.38, 0.64].map((t) => t * map.d);
  } else if (map.id === "sewer") {
    xs = [0.28, 0.48, 0.68, 0.84].map((t) => t * map.w);
    zs = [0.32, 0.52, 0.72].map((t) => t * map.d);
  } else if (map.id === "backrooms") {
    xs = [0.32, 0.54, 0.76].map((t) => t * map.w);
    zs = [0.36, 0.62].map((t) => t * map.d);
  } else {
    xs = [0.3, 0.52, 0.74].map((t) => t * map.w);
    zs = [0.34, 0.56, 0.76].map((t) => t * map.d);
  }
  const xLines = [pad, ...xs.filter((x) => x > pad + 2 && x < map.w - pad - 2), map.w - pad];
  const zLines = [pad, ...zs.filter((z) => z > pad + 2 && z < map.d - pad - 2), map.d - pad];
  const walls: BoxDef[] = [];
  const doors: DoorDef[] = [];
  for (const x of xs) {
    if (x <= pad || x >= map.w - pad) continue;
    for (let i = 0; i < zLines.length - 1; i++) {
      const part = wallWithDoor(map.id, "z", x, zLines[i], zLines[i + 1], thick, h, theme);
      walls.push(...part.walls);
      doors.push(part.door);
    }
  }
  for (const z of zs) {
    if (z <= pad || z >= map.d - pad) continue;
    for (let i = 0; i < xLines.length - 1; i++) {
      const part = wallWithDoor(map.id, "x", z, xLines[i], xLines[i + 1], thick, h, theme);
      walls.push(...part.walls);
      doors.push(part.door);
    }
  }
  return { ...map, boxes: [...map.boxes, ...walls], doors };
}

function clutterMap(map: GameMap): GameMap {
  const rnd = mulberry(map.id.split("").reduce((a, c) => a + c.charCodeAt(0) * 17, 11));
  const cols = mapColliders(map);
  const extras: BoxDef[] = [];
  const step = 7;
  for (let gx = 8; gx < map.w - 8; gx += step) {
    for (let gz = 8; gz < map.d - 8; gz += step) {
      const x = gx + (rnd() - 0.5) * 4.2;
      const z = gz + (rnd() - 0.5) * 4.2;
      if (nearSpawn(map, x, z, 6.5)) continue;
      if (map.doors.some((d) => Math.hypot(d.x - x, d.z - z) < 2.6)) continue;
      if (cols.some((c) => circleHitsBox(x + 1, z + 1, 1.35, c))) continue;
      if (rnd() < 0.12) continue;
      extras.push(...cluster(map.id, x, z, Math.floor(rnd() * 9), rnd));
    }
  }
  return { ...map, boxes: [...map.boxes, ...extras] };
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

function expandMap(map: GameMap, s: number): GameMap {
  return {
    ...map,
    w: map.w * s,
    d: map.d * s,
    spawns: map.spawns.map((p) => ({ x: p.x * s, z: p.z * s })),
    hunterSpawns: map.hunterSpawns.map((p) => ({ x: p.x * s, z: p.z * s })),
    boxes: map.boxes.map((b) => {
      const floor = b.h <= 0.1;
      const outer = b.w >= map.w * 0.25 || b.d >= map.d * 0.25;
      const thin = b.w <= 0.55 || b.d <= 0.55;
      let w = b.w;
      let d = b.d;
      if (floor) {
        w *= s;
        d *= s;
      } else if (outer) {
        if (b.w >= b.d) w *= s;
        else d *= s;
      } else if (thin) {
        if (b.d <= 0.55) w *= s;
        if (b.w <= 0.55) d *= s;
      }
      return { ...b, x: b.x * s, z: b.z * s, w, d };
    }),
  };
}

function sealPerimeter(map: GameMap): GameMap {
  const t = 0.5;
  const h = Math.max(map.ceiling - 0.04, 3.5);
  const theme = wallTheme(map.id);
  const hx = map.hunterSpawns[0]?.x ?? map.w * 0.5;
  const gap = 1.9;
  const doorX = Math.max(t + gap, Math.min(map.w - t - gap, hx));
  const northZ = map.d - t;
  const walls: BoxDef[] = [
    B(0, 0, map.w, t, theme.color, { h, collide: true, pattern: theme.pattern, colors: theme.colors }),
    B(0, 0, t, map.d, theme.color, { h, collide: true, pattern: theme.pattern, colors: theme.colors }),
    B(map.w - t, 0, t, map.d, theme.color, { h, collide: true, pattern: theme.pattern, colors: theme.colors }),
    B(0, northZ, Math.max(t, doorX - gap / 2), t, theme.color, {
      h,
      collide: true,
      pattern: theme.pattern,
      colors: theme.colors,
    }),
    B(doorX + gap / 2, northZ, Math.max(t, map.w - (doorX + gap / 2)), t, theme.color, {
      h,
      collide: true,
      pattern: theme.pattern,
      colors: theme.colors,
    }),
  ];
  const door: DoorDef = {
    id: `${map.id}-gate`,
    x: doorX,
    z: northZ + t / 2,
    w: gap - 0.12,
    h: Math.min(2.3, h - 0.2),
    d: t + 0.06,
    along: "x",
    color: "#5c3a22",
  };
  return { ...map, boxes: [...map.boxes, ...walls], doors: [...(map.doors ?? []), door] };
}

export const MAPS: GameMap[] = [mansion, farm, sewer, backrooms].map((m) =>
  clearSpawns(clutterMap(partitionMap(sealPerimeter(expandMap(m, 1.35))))),
);

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
  if (b.h <= 0.22) return false;
  if (b.collide) return b.w >= 0.16 && b.d >= 0.16;
  if (b.w < 0.32 || b.d < 0.32) return false;
  return b.h >= 0.45 && b.w >= 0.45 && b.d >= 0.45;
}

export function mapColliders(map: GameMap) {
  const pad = -0.06;
  return map.boxes
    .filter(isSolidProp)
    .map((b) => ({
      minX: b.x - b.w / 2 + pad,
      maxX: b.x + b.w / 2 - pad,
      minZ: b.z - b.d / 2 + pad,
      maxZ: b.z + b.d / 2 - pad,
      minY: b.y - b.h / 2,
      maxY: b.y + b.h / 2,
    }))
    .filter((b) => b.maxX - b.minX > 0.2 && b.maxZ - b.minZ > 0.2);
}
