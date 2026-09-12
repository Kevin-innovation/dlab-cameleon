import type { GameMap, Pattern, Rect } from "./types";

function R(
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  extra: Partial<Rect> = {},
): Rect {
  return { x, y, w, h, color, ...extra };
}

const wall = (x: number, y: number, w: number, h: number, color = "#3b2a22") =>
  R(x, y, w, h, color, { collide: true, pattern: "bricks", colors: [color, shade(color, -18)] });

function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const mansion: GameMap = {
  id: "mansion",
  name: "숨바꼭질 저택",
  blurb: "책장·액자·러그·타일. 시각 노이즈가 가장 많아요.",
  difficulty: "쉬움",
  w: 3200,
  h: 2000,
  bg: "#1a120e",
  floor: "#c4a06a",
  hunterSpawns: [
    { x: 1600, y: 1880 },
    { x: 200, y: 1000 },
  ],
  spawns: [
    { x: 420, y: 520 },
    { x: 900, y: 860 },
    { x: 1480, y: 640 },
    { x: 2100, y: 420 },
    { x: 2680, y: 700 },
    { x: 2400, y: 1280 },
    { x: 1760, y: 1500 },
    { x: 680, y: 1480 },
  ],
  layers: [
    R(60, 60, 3080, 1880, "#c4a06a", { pattern: "wood", colors: ["#c4a06a", "#b08950"] }),
    R(80, 80, 1180, 900, "#d7b07a", { pattern: "wood" }),
    R(80, 80, 1180, 160, "#6b3a2a", { pattern: "wallpaper", colors: ["#6b3a2a", "#8a5040"] }),
    R(140, 280, 420, 70, "#8b1e2d", { pattern: "solid" }),
    R(140, 350, 420, 180, "#a32638", { collide: true }),
    R(160, 370, 90, 70, "#6d1824"),
    R(280, 370, 90, 70, "#6d1824"),
    R(400, 370, 90, 70, "#6d1824"),
    R(180, 700, 520, 220, "#7a3f1c", { pattern: "wood", collide: true }),
    R(200, 720, 480, 180, "#5c2e12", { pattern: "books", colors: ["#c0392b", "#2980b9", "#27ae60", "#f1c40f", "#8e44ad", "#e67e22", "#1abc9c", "#34495e"] }),
    R(760, 260, 220, 280, "#d9c9a5", { pattern: "solid" }),
    R(780, 280, 180, 200, "#2c6e4a", { pattern: "leaves", colors: ["#2c6e4a", "#1e4d32", "#4ea36a"] }),
    R(780, 480, 180, 40, "#6d4c2a"),
    R(430, 620, 280, 160, "#9b2a2a", { pattern: "dots", colors: ["#9b2a2a", "#c0392b"] }),
    R(1280, 80, 1840, 820, "#e8dcc8", { pattern: "wood" }),
    R(1320, 120, 520, 740, "#5b3a28", { pattern: "books", colors: ["#8e2b2b", "#245a8e", "#1f6b45", "#b8860b", "#6c3483", "#a8431a", "#117a65", "#1c2833", "#922b21"] }),
    R(1880, 140, 280, 200, "#5c4030"),
    R(1900, 160, 240, 160, "#e8d5a3", { pattern: "stripes", colors: ["#e8d5a3", "#c9a66b"] }),
    R(1900, 160, 240, 18, "#3e2a1e"),
    R(1900, 302, 240, 18, "#3e2a1e"),
    R(2220, 140, 280, 200, "#5c4030"),
    R(2240, 160, 240, 160, "#6a8f6a", { pattern: "leaves" }),
    R(2240, 160, 240, 18, "#3e2a1e"),
    R(2560, 140, 480, 360, "#4a2f22"),
    R(2580, 160, 440, 320, "#1f4d6e", { pattern: "wallpaper", colors: ["#1f4d6e", "#2e6a8f"] }),
    R(2580, 160, 440, 22, "#3e2a1e"),
    R(1960, 420, 540, 40, "#6d4c2a", { collide: true }),
    R(1960, 460, 540, 380, "#5b3a28", { pattern: "books", colors: ["#922b21", "#1a5276", "#196f3d", "#b7950b", "#6c3483", "#d35400"] }),
    R(80, 1040, 1500, 880, "#b98b54", { pattern: "wood" }),
    R(120, 1100, 360, 280, "#2f4f3a", { pattern: "leaves", collide: true }),
    R(160, 1480, 900, 360, "#d9c4a0", { pattern: "check", colors: ["#d9c4a0", "#c3a57a"] }),
    R(200, 1520, 180, 260, "#eee4c8"),
    R(420, 1540, 220, 200, "#8b4513", { collide: true, pattern: "wood" }),
    R(700, 1520, 300, 80, "#6b2a1f"),
    R(700, 1600, 300, 200, "#7a3426", { collide: true }),
    R(1640, 980, 1480, 940, "#e6e1d6"),
    R(1680, 1020, 700, 860, "#d8cfc0", { pattern: "tiles", colors: ["#efe8dc", "#d2c4b0"] }),
    R(1720, 1080, 280, 160, "#c45c26", { collide: true }),
    R(2040, 1080, 280, 160, "#c45c26", { collide: true }),
    R(1720, 1320, 600, 40, "#6d4c2a", { collide: true }),
    R(1760, 1400, 160, 200, "#f4f0e6"),
    R(1960, 1400, 160, 200, "#f4f0e6"),
    R(2160, 1400, 160, 200, "#f4f0e6"),
    R(2480, 1020, 600, 860, "#d5e4e2", { pattern: "tiles", colors: ["#d5e4e2", "#b9cdc9"] }),
    R(2540, 1100, 480, 36, "#8aa8a4"),
    R(2560, 1180, 200, 280, "#eef6f4", { pattern: "tiles", colors: ["#eef6f4", "#c5d8d4"] }),
    R(2800, 1180, 200, 280, "#eef6f4", { pattern: "tiles" }),
    R(2580, 1540, 400, 240, "#9ec5c1", { pattern: "tiles", colors: ["#9ec5c1", "#7eada8"] }),
    wall(0, 0, 3200, 56),
    wall(0, 1944, 1480, 56),
    wall(1720, 1944, 1480, 56),
    wall(0, 0, 56, 2000),
    wall(3144, 0, 56, 2000),
    wall(1240, 56, 48, 780),
    wall(1240, 980, 48, 400),
    wall(56, 980, 700, 48),
    wall(900, 980, 340, 48),
    wall(1600, 56, 48, 700),
    wall(1600, 900, 48, 1044),
    wall(2420, 980, 48, 520),
  ],
};

const farm: GameMap = {
  id: "farm",
  name: "실내 농장",
  blurb: "건초, 헛간 벽, 호박, 울타리. 넓은 색면이 많아 페인트 입문에 좋아요.",
  difficulty: "쉬움",
  w: 3000,
  h: 1900,
  bg: "#1a140c",
  floor: "#c2a05a",
  hunterSpawns: [{ x: 1500, y: 1780 }],
  spawns: [
    { x: 360, y: 500 },
    { x: 820, y: 860 },
    { x: 1400, y: 480 },
    { x: 1980, y: 720 },
    { x: 2500, y: 500 },
    { x: 2360, y: 1240 },
    { x: 1500, y: 1300 },
    { x: 640, y: 1400 },
  ],
  layers: [
    R(50, 50, 2900, 1800, "#c2a05a", { pattern: "hay", colors: ["#c2a05a", "#d4b36a", "#a9843c"] }),
    R(50, 50, 2900, 420, "#7ec8e8", { pattern: "solid" }),
    R(50, 390, 2900, 40, "#5a8f3a"),
    R(80, 80, 900, 340, "#d3533a", { pattern: "wood", colors: ["#d3533a", "#b43c28"] }),
    R(120, 130, 180, 220, "#f2efe4"),
    R(360, 130, 180, 220, "#f2efe4"),
    R(600, 130, 180, 220, "#f2efe4"),
    R(140, 150, 140, 180, "#6ec1ff"),
    R(1040, 70, 520, 360, "#f0c43a", { pattern: "dots", colors: ["#f0c43a", "#e0a820"] }),
    R(1680, 80, 700, 340, "#5aa0d6", { pattern: "wallpaper", colors: ["#5aa0d6", "#3d7eaf"] }),
    R(2480, 90, 420, 320, "#6fbf57", { pattern: "leaves" }),
    R(140, 520, 260, 180, "#e39b2d", { pattern: "hay", collide: true }),
    R(460, 560, 260, 180, "#e39b2d", { pattern: "hay", collide: true }),
    R(200, 780, 220, 160, "#d35400", { collide: true }),
    R(240, 800, 140, 120, "#e67e22"),
    R(880, 500, 80, 700, "#8b5a2b", { collide: true, pattern: "wood" }),
    R(960, 500, 700, 36, "#8b5a2b", { collide: true }),
    R(960, 620, 700, 24, "#8b5a2b", { collide: true }),
    R(960, 740, 700, 24, "#8b5a2b", { collide: true }),
    R(960, 860, 700, 24, "#8b5a2b", { collide: true }),
    R(960, 980, 700, 24, "#8b5a2b", { collide: true }),
    R(1640, 500, 80, 700, "#8b5a2b", { collide: true, pattern: "wood" }),
    R(1880, 520, 420, 300, "#f4f0e4", { pattern: "dots", colors: ["#f4f0e4", "#111"] }),
    R(1940, 580, 120, 80, "#111"),
    R(2140, 580, 80, 80, "#111"),
    R(2040, 700, 180, 60, "#111"),
    R(2420, 540, 200, 140, "#e67e22", { collide: true }),
    R(2660, 560, 160, 120, "#d35400", { collide: true }),
    R(2480, 720, 360, 200, "#6fbf57", { pattern: "leaves" }),
    R(120, 1200, 800, 560, "#9c6b32", { pattern: "wood" }),
    R(180, 1280, 220, 160, "#c0392b", { collide: true, pattern: "wood" }),
    R(460, 1260, 360, 80, "#6d4c2a", { collide: true }),
    R(460, 1340, 360, 280, "#7b5428", { pattern: "hay", collide: true }),
    R(1000, 1180, 900, 600, "#b55232", { pattern: "wood", colors: ["#b55232", "#8d351c"] }),
    R(1080, 1260, 200, 280, "#f7efe0"),
    R(1340, 1260, 200, 280, "#f7efe0"),
    R(1600, 1260, 200, 280, "#f7efe0"),
    R(1120, 1320, 120, 180, "#3d2b1f"),
    R(2040, 1180, 840, 600, "#d9b36a", { pattern: "hay" }),
    R(2140, 1280, 180, 140, "#e67e22", { collide: true }),
    R(2360, 1320, 180, 140, "#d35400", { collide: true }),
    R(2580, 1260, 220, 200, "#6fbf57", { pattern: "leaves", collide: true }),
    wall(0, 0, 3000, 50, "#5a3a22"),
    wall(0, 1850, 1320, 50, "#5a3a22"),
    wall(1680, 1850, 1320, 50, "#5a3a22"),
    wall(0, 0, 50, 1900, "#5a3a22"),
    wall(2950, 0, 50, 1900, "#5a3a22"),
  ],
};

const sewer: GameMap = {
  id: "sewer",
  name: "하수도",
  blurb: "파이프·드럼·그래피티. 어두운 구석보다 색 덩어리에 숨으세요.",
  difficulty: "보통",
  w: 3100,
  h: 1960,
  bg: "#0d1412",
  floor: "#3d4a43",
  hunterSpawns: [{ x: 1550, y: 1840 }],
  spawns: [
    { x: 300, y: 360 },
    { x: 860, y: 800 },
    { x: 1500, y: 420 },
    { x: 2200, y: 700 },
    { x: 2700, y: 400 },
    { x: 2500, y: 1300 },
    { x: 1600, y: 1400 },
    { x: 700, y: 1500 },
  ],
  layers: [
    R(48, 48, 3004, 1864, "#3d4a43", { pattern: "bricks", colors: ["#3d4a43", "#2f3a34"] }),
    R(80, 80, 900, 560, "#2a3330", { pattern: "bricks" }),
    R(120, 120, 820, 480, "#c0392b", { pattern: "graffiti", colors: ["#c0392b", "#f1c40f", "#3498db", "#2ecc71", "#9b59b6"] }),
    R(1040, 80, 1000, 560, "#2a3330"),
    R(1100, 140, 880, 80, "#c47a3a", { pattern: "pipes", collide: true }),
    R(1100, 260, 880, 80, "#6e8b73", { pattern: "pipes", collide: true }),
    R(1100, 380, 880, 80, "#b84a2f", { pattern: "pipes", collide: true }),
    R(2140, 80, 880, 560, "#24302c"),
    R(2200, 140, 760, 440, "#1f6f4a", { pattern: "graffiti", colors: ["#1f6f4a", "#f39c12", "#e74c3c", "#ecf0f1"] }),
    R(80, 720, 1400, 480, "#333f3a"),
    R(140, 780, 160, 220, "#b03a2e", { collide: true }),
    R(340, 800, 160, 220, "#922b21", { collide: true }),
    R(540, 760, 160, 220, "#c0392b", { collide: true }),
    R(160, 790, 120, 40, "#f1c40f", { pattern: "stripes", colors: ["#f1c40f", "#111"] }),
    R(800, 780, 560, 360, "#4a5c3a", { pattern: "leaves" }),
    R(1540, 720, 1480, 480, "#2e3a36"),
    R(1600, 780, 400, 360, "#2c3e50", { pattern: "graffiti", colors: ["#e74c3c", "#3498db", "#f1c40f"] }),
    R(2080, 800, 280, 90, "#d35400", { pattern: "pipes", collide: true }),
    R(2420, 780, 500, 360, "#8e44ad", { pattern: "graffiti", colors: ["#8e44ad", "#f1c40f", "#1abc9c"] }),
    R(80, 1280, 2940, 600, "#2b3632", { pattern: "bricks", colors: ["#2b3632", "#1f2825"] }),
    R(140, 1360, 240, 420, "#c47a3a", { pattern: "pipes", collide: true }),
    R(460, 1400, 700, 80, "#6e8b73", { pattern: "pipes", collide: true }),
    R(460, 1560, 700, 80, "#b84a2f", { pattern: "pipes", collide: true }),
    R(1240, 1340, 520, 460, "#f1c40f", { pattern: "stripes", colors: ["#f1c40f", "#111"] }),
    R(1860, 1360, 360, 260, "#27ae60", { pattern: "graffiti" }),
    R(2300, 1400, 200, 280, "#b03a2e", { collide: true }),
    R(2560, 1400, 200, 280, "#922b21", { collide: true }),
    R(2780, 1360, 180, 400, "#c47a3a", { pattern: "pipes", collide: true }),
    wall(0, 0, 3100, 48, "#1b2420"),
    wall(0, 1912, 1400, 48, "#1b2420"),
    wall(1700, 1912, 1400, 48, "#1b2420"),
    wall(0, 0, 48, 1960, "#1b2420"),
    wall(3052, 0, 48, 1960, "#1b2420"),
    wall(980, 48, 48, 500),
    wall(2060, 48, 48, 500),
    wall(48, 660, 600, 48),
    wall(800, 660, 2252, 48),
    wall(1480, 720, 48, 480),
  ],
};

export const MAPS: GameMap[] = [mansion, farm, sewer];

export function getMap(id: string) {
  return MAPS.find((m) => m.id === id) ?? mansion;
}

export function collideRects(map: GameMap) {
  return map.layers.filter((r) => r.collide);
}

function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function paintPattern(ctx: CanvasRenderingContext2D, rect: Rect) {
  const { x, y, w, h, color } = rect;
  const pattern: Pattern = rect.pattern ?? "solid";
  const colors = rect.colors ?? [color];
  const rnd = mulberry((x * 73856093) ^ (y * 19349663) ^ (w * 83492791));

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);

  if (pattern === "wood") {
    ctx.strokeStyle = colors[1] ?? shade(color, -25);
    ctx.lineWidth = 2;
    for (let i = y; i < y + h; i += 14) {
      ctx.beginPath();
      ctx.moveTo(x, i + rnd() * 4);
      ctx.bezierCurveTo(x + w * 0.3, i + 6, x + w * 0.6, i - 4, x + w, i + rnd() * 4);
      ctx.stroke();
    }
  } else if (pattern === "books") {
    let cx = x + 6;
    while (cx < x + w - 8) {
      const bw = 10 + Math.floor(rnd() * 16);
      const bh = h * (0.55 + rnd() * 0.4);
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.fillRect(cx, y + h - bh - 8, bw, bh);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(cx + 2, y + h - bh, 2, bh - 16);
      cx += bw + 3;
    }
    ctx.fillStyle = shade(color, -30);
    ctx.fillRect(x, y + h - 10, w, 10);
    ctx.fillRect(x, y, w, 8);
  } else if (pattern === "tiles") {
    const s = 36;
    const g = colors[1] ?? shade(color, -20);
    for (let iy = y; iy < y + h; iy += s) {
      for (let ix = x; ix < x + w; ix += s) {
        ctx.fillStyle = (Math.floor(ix / s) + Math.floor(iy / s)) % 2 === 0 ? color : g;
        ctx.fillRect(ix + 1, iy + 1, s - 2, s - 2);
      }
    }
  } else if (pattern === "bricks") {
    const bw = 48;
    const bh = 22;
    const alt = colors[1] ?? shade(color, -16);
    for (let row = 0, iy = y; iy < y + h; iy += bh + 3, row++) {
      const off = row % 2 === 0 ? 0 : bw / 2;
      for (let ix = x - off; ix < x + w; ix += bw + 3) {
        ctx.fillStyle = rnd() > 0.5 ? color : alt;
        ctx.fillRect(ix, iy, bw, bh);
      }
    }
  } else if (pattern === "stripes") {
    const c2 = colors[1] ?? shade(color, -40);
    ctx.lineWidth = 16;
    for (let i = -h; i < w + h; i += 28) {
      ctx.strokeStyle = Math.floor(i / 28) % 2 === 0 ? color : c2;
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
    }
  } else if (pattern === "dots") {
    const c2 = colors[1] ?? "#111111";
    for (let iy = y + 16; iy < y + h; iy += 28) {
      for (let ix = x + 16; ix < x + w; ix += 28) {
        ctx.fillStyle = c2;
        ctx.beginPath();
        ctx.arc(ix, iy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === "graffiti") {
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.globalAlpha = 0.75;
      const gx = x + rnd() * w;
      const gy = y + rnd() * h;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 30 + rnd() * 90, 18 + rnd() * 50, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `900 ${Math.max(48, Math.min(w, h) / 4)}px sans-serif`;
    ctx.fillStyle = colors[0];
    ctx.rotate(-0.2);
    ctx.fillText("HIDE", x + 20, y + h * 0.65);
  } else if (pattern === "hay") {
    ctx.strokeStyle = colors[1] ?? shade(color, -20);
    ctx.lineWidth = 2;
    for (let i = 0; i < (w * h) / 900; i++) {
      const hx = x + rnd() * w;
      const hy = y + rnd() * h;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + 8 + rnd() * 16, hy - 10 - rnd() * 18);
      ctx.stroke();
    }
  } else if (pattern === "check") {
    const s = 28;
    const g = colors[1] ?? shade(color, -24);
    for (let iy = y; iy < y + h; iy += s) {
      for (let ix = x; ix < x + w; ix += s) {
        ctx.fillStyle = (Math.floor(ix / s) + Math.floor(iy / s)) % 2 === 0 ? color : g;
        ctx.fillRect(ix, iy, s, s);
      }
    }
  } else if (pattern === "pipes") {
    ctx.fillStyle = shade(color, -30);
    ctx.fillRect(x, y + h * 0.15, w, h * 0.7);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + h * 0.22, w, h * 0.56);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x, y + h * 0.28, w, h * 0.12);
    for (let i = x + 40; i < x + w; i += 90) {
      ctx.fillStyle = shade(color, -40);
      ctx.fillRect(i, y, 16, h);
    }
  } else if (pattern === "leaves") {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)] ?? color;
      ctx.beginPath();
      ctx.ellipse(x + rnd() * w, y + rnd() * h, 8 + rnd() * 18, 5 + rnd() * 10, rnd() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === "wallpaper") {
    const c2 = colors[1] ?? shade(color, 18);
    for (let iy = y + 20; iy < y + h; iy += 46) {
      for (let ix = x + 20; ix < x + w; ix += 46) {
        ctx.strokeStyle = c2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ix, iy, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ix, iy, 3, 0, Math.PI * 2);
        ctx.fillStyle = c2;
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

export function bakeMap(map: GameMap) {
  const canvas = document.createElement("canvas");
  canvas.width = map.w;
  canvas.height = map.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = map.bg;
  ctx.fillRect(0, 0, map.w, map.h);
  for (const layer of map.layers) {
    paintPattern(ctx, layer);
    if (layer.collide) {
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      roundRect(ctx, layer.x, layer.y, layer.w, layer.h, 4);
      ctx.stroke();
    }
  }
  return canvas;
}

export function sampleMap(baked: HTMLCanvasElement, x: number, y: number) {
  const ctx = baked.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#ffffff";
  const ix = Math.max(0, Math.min(baked.width - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(baked.height - 1, Math.floor(y)));
  const d = ctx.getImageData(ix, iy, 1, 1).data;
  return `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function aabb(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  b: { x: number; y: number; w: number; h: number },
) {
  return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;
}

export function blocked(
  x: number,
  y: number,
  hw: number,
  hh: number,
  walls: Rect[],
  mapW: number,
  mapH: number,
) {
  if (x - hw < 0 || y - hh < 0 || x + hw > mapW || y + hh > mapH) return true;
  for (const w of walls) {
    if (aabb(x - hw, y - hh, hw * 2, hh * 2, w)) return true;
  }
  return false;
}
