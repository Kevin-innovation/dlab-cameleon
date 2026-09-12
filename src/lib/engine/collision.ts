import type { Collider } from "../types";

export function circleHitsBox(x: number, z: number, r: number, b: Collider) {
  const nx = Math.max(b.minX, Math.min(x, b.maxX));
  const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - nx;
  const dz = z - nz;
  return dx * dx + dz * dz < r * r;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function poseHeight(pose: string) {
  if (pose === "crouch" || pose === "sit") return 1.05;
  if (pose === "lie" || pose === "ball") return 0.5;
  return 1.72;
}

export function yHitsBox(feetY: number, headY: number, b: Collider, skin = 0.05) {
  return feetY + skin < b.maxY && headY - skin > b.minY;
}

function solidAt(x: number, z: number, r: number, feetY: number, headY: number, b: Collider) {
  if (!yHitsBox(feetY, headY, b)) return false;
  return circleHitsBox(x, z, r, b);
}

export function blocked(
  x: number,
  z: number,
  r: number,
  boxes: Collider[],
  bounds: { w: number; d: number },
  feetY = 0,
  headY = 1.72,
) {
  const m = r + 0.28;
  if (x < m || z < m || x > bounds.w - m || z > bounds.d - m) return true;
  for (const b of boxes) {
    if (solidAt(x, z, r, feetY, headY, b)) return true;
  }
  return false;
}

export function resolveStuck(
  x: number,
  z: number,
  r: number,
  boxes: Collider[],
  bounds: { w: number; d: number },
  feetY = 0,
  headY = 1.72,
) {
  const m = r + 0.32;
  x = clamp(x, m, bounds.w - m);
  z = clamp(z, m, bounds.d - m);
  const pad = r + 0.04;
  for (let iter = 0; iter < 8; iter++) {
    for (const b of boxes) {
      if (!solidAt(x, z, r, feetY, headY, b)) continue;
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);
      let dx = x - cx;
      let dz = z - cz;
      let len = Math.hypot(dx, dz);
      if (len < 1e-5) {
        const left = x - b.minX;
        const right = b.maxX - x;
        const top = z - b.minZ;
        const bot = b.maxZ - z;
        const nearest = Math.min(left, right, top, bot);
        if (nearest === left) x = b.minX - pad;
        else if (nearest === right) x = b.maxX + pad;
        else if (nearest === top) z = b.minZ - pad;
        else z = b.maxZ + pad;
      } else {
        x = cx + (dx / len) * pad;
        z = cz + (dz / len) * pad;
      }
    }
    x = clamp(x, m, bounds.w - m);
    z = clamp(z, m, bounds.d - m);
  }
  return { x, z };
}

export function moveWithSlide(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r: number,
  boxes: Collider[],
  bounds: { w: number; d: number },
  feetY = 0,
  headY = 1.72,
) {
  const freed = resolveStuck(x, z, r, boxes, bounds, feetY, headY);
  x = freed.x;
  z = freed.z;
  let nx = x + dx;
  let nz = z + dz;
  if (blocked(nx, z, r, boxes, bounds, feetY, headY)) nx = x;
  if (blocked(nx, nz, r, boxes, bounds, feetY, headY)) nz = z;
  if (blocked(nx, nz, r, boxes, bounds, feetY, headY)) {
    return resolveStuck(x, z, r, boxes, bounds, feetY, headY);
  }
  return resolveStuck(nx, nz, r, boxes, bounds, feetY, headY);
}

export function landOn(x: number, z: number, r: number, prevY: number, nextY: number, boxes: Collider[]) {
  let best: number | null = null;
  for (const b of boxes) {
    if (!circleHitsBox(x, z, r + 0.04, b)) continue;
    const top = b.maxY;
    if (top < 0.14) continue;
    if (prevY >= top - 0.12 && nextY <= top + 0.02) {
      if (best === null || top > best) best = top;
    }
  }
  return best;
}

export function headHit(x: number, z: number, r: number, prevHead: number, nextHead: number, boxes: Collider[]) {
  let best: number | null = null;
  for (const b of boxes) {
    if (!circleHitsBox(x, z, r + 0.04, b)) continue;
    const bot = b.minY;
    if (bot < 0.3) continue;
    if (prevHead <= bot + 0.12 && nextHead >= bot - 0.02) {
      if (best === null || bot < best) best = bot;
    }
  }
  return best;
}

export function poseRadius(pose: string) {
  if (pose === "stick") return 0.16;
  if (pose === "stretch") return 0.2;
  if (pose === "lie" || pose === "ball") return 0.3;
  return 0.26;
}

export function nearestSurface(
  x: number,
  z: number,
  boxes: Collider[],
  maxDist: number,
): { x: number; z: number; nx: number; nz: number; dist: number; box: Collider } | null {
  let best: { x: number; z: number; nx: number; nz: number; dist: number; box: Collider } | null = null;
  for (const b of boxes) {
    const inside = x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
    if (inside) continue;
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    const dx = x - cx;
    const dz = z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDist || dist < 1e-6) continue;
    const nx = dx / dist;
    const nz = dz / dist;
    if (!best || dist < best.dist) best = { x: cx, z: cz, nx, nz, dist, box: b };
  }
  return best;
}
