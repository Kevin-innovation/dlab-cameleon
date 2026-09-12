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

export function blocked(
  x: number,
  z: number,
  r: number,
  boxes: Collider[],
  bounds: { w: number; d: number },
) {
  const m = r + 0.28;
  if (x < m || z < m || x > bounds.w - m || z > bounds.d - m) return true;
  for (const b of boxes) {
    if (circleHitsBox(x, z, r, b)) return true;
  }
  return false;
}

export function resolveStuck(
  x: number,
  z: number,
  r: number,
  boxes: Collider[],
  bounds: { w: number; d: number },
) {
  const m = r + 0.32;
  x = clamp(x, m, bounds.w - m);
  z = clamp(z, m, bounds.d - m);
  const pad = r + 0.04;
  for (let iter = 0; iter < 8; iter++) {
    for (const b of boxes) {
      if (!circleHitsBox(x, z, r, b)) continue;
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
) {
  const freed = resolveStuck(x, z, r, boxes, bounds);
  x = freed.x;
  z = freed.z;
  let nx = x + dx;
  let nz = z + dz;
  if (blocked(nx, z, r, boxes, bounds)) nx = x;
  if (blocked(nx, nz, r, boxes, bounds)) nz = z;
  if (blocked(nx, nz, r, boxes, bounds)) {
    return resolveStuck(x, z, r, boxes, bounds);
  }
  return resolveStuck(nx, nz, r, boxes, bounds);
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
    if (inside) {
      const left = x - b.minX;
      const right = b.maxX - x;
      const top = z - b.minZ;
      const bot = b.maxZ - z;
      const m = Math.min(left, right, top, bot);
      let nx = 0;
      let nz = 0;
      let px = x;
      let pz = z;
      if (m === left) {
        nx = -1;
        px = b.minX;
      } else if (m === right) {
        nx = 1;
        px = b.maxX;
      } else if (m === top) {
        nz = -1;
        pz = b.minZ;
      } else {
        nz = 1;
        pz = b.maxZ;
      }
      if (!best || m < best.dist) best = { x: px, z: pz, nx, nz, dist: 0, box: b };
      continue;
    }
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
