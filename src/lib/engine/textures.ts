import type { Pattern } from "../types";

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
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

export function makePatternCanvas(
  pattern: Pattern,
  color: string,
  colors: string[] | undefined,
  seed: number,
  size = 256,
) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const pal = colors?.length ? colors : [color];
  const rnd = mulberry(seed || 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  if (pattern === "wood") {
    ctx.strokeStyle = pal[1] ?? shade(color, -28);
    ctx.lineWidth = 3;
    for (let i = 8; i < size; i += 16) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.bezierCurveTo(size * 0.3, i + 8, size * 0.7, i - 8, size, i + 4);
      ctx.stroke();
    }
  } else if (pattern === "books") {
    ctx.fillStyle = shade(color, -20);
    ctx.fillRect(0, 0, size, 18);
    ctx.fillRect(0, size - 18, size, 18);
    let x = 6;
    while (x < size - 8) {
      const bw = 10 + Math.floor(rnd() * 18);
      const bh = size * (0.5 + rnd() * 0.35);
      ctx.fillStyle = pal[Math.floor(rnd() * pal.length)];
      ctx.fillRect(x, size - 20 - bh, bw, bh);
      x += bw + 3;
    }
  } else if (pattern === "tiles" || pattern === "check") {
    const s = pattern === "check" ? 28 : 42;
    const g = pal[1] ?? shade(color, -22);
    for (let y = 0; y < size; y += s) {
      for (let x = 0; x < size; x += s) {
        ctx.fillStyle = ((x / s + y / s) | 0) % 2 === 0 ? color : g;
        ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
      }
    }
  } else if (pattern === "bricks") {
    const bw = 48;
    const bh = 22;
    const alt = pal[1] ?? shade(color, -16);
    for (let row = 0, y = 0; y < size; y += bh + 3, row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -off; x < size; x += bw + 3) {
        ctx.fillStyle = rnd() > 0.5 ? color : alt;
        ctx.fillRect(x, y, bw, bh);
      }
    }
  } else if (pattern === "stripes") {
    const c2 = pal[1] ?? shade(color, -40);
    ctx.lineWidth = 18;
    for (let i = -size; i < size * 2; i += 32) {
      ctx.strokeStyle = ((i / 32) | 0) % 2 === 0 ? color : c2;
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
    }
  } else if (pattern === "dots") {
    ctx.fillStyle = pal[1] ?? "#111";
    for (let y = 16; y < size; y += 28) {
      for (let x = 16; x < size; x += 28) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === "graffiti") {
    for (let i = 0; i < 16; i++) {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = pal[Math.floor(rnd() * pal.length)];
      ctx.beginPath();
      ctx.ellipse(rnd() * size, rnd() * size, 24 + rnd() * 70, 16 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal[0];
    ctx.font = "900 64px sans-serif";
    ctx.save();
    ctx.translate(30, 160);
    ctx.rotate(-0.2);
    ctx.fillText("HIDE", 0, 0);
    ctx.restore();
  } else if (pattern === "hay") {
    ctx.strokeStyle = pal[1] ?? shade(color, -24);
    ctx.lineWidth = 2;
    for (let i = 0; i < 180; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6 + rnd() * 14, y - 10 - rnd() * 16);
      ctx.stroke();
    }
  } else if (pattern === "pipes") {
    ctx.fillStyle = shade(color, -30);
    ctx.fillRect(0, size * 0.15, size, size * 0.7);
    ctx.fillStyle = color;
    ctx.fillRect(0, size * 0.22, size, size * 0.56);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(0, size * 0.28, size, size * 0.12);
    for (let x = 30; x < size; x += 70) {
      ctx.fillStyle = shade(color, -40);
      ctx.fillRect(x, 0, 14, size);
    }
  } else if (pattern === "leaves") {
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = pal[Math.floor(rnd() * pal.length)] ?? color;
      ctx.beginPath();
      ctx.ellipse(rnd() * size, rnd() * size, 8 + rnd() * 16, 5 + rnd() * 10, rnd() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === "wallpaper") {
    const c2 = pal[1] ?? shade(color, 18);
    ctx.strokeStyle = c2;
    ctx.fillStyle = c2;
    ctx.lineWidth = 2;
    for (let y = 20; y < size; y += 44) {
      for (let x = 20; x < size; x += 44) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return canvas;
}

export function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0")).join("")}`;
}
