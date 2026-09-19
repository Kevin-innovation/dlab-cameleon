import type { Collider } from "../types";

export function circleHitsBox(x: number, z: number, r: number, b: Collider) {
  const p = localPoint(x, z, b);
  const nx = Math.max(-p.halfW, Math.min(p.x, p.halfW));
  const nz = Math.max(-p.halfD, Math.min(p.z, p.halfD));
  const dx = p.x - nx;
  const dz = p.z - nz;
  return dx * dx + dz * dz < r * r;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

type SurfacePoint = {
  x: number;
  z: number;
  nx: number;
  nz: number;
  dist: number;
  inside: boolean;
};

function localPoint(x: number, z: number, b: Collider) {
  const cx = b.centerX ?? (b.minX + b.maxX) / 2;
  const cz = b.centerZ ?? (b.minZ + b.maxZ) / 2;
  const rotation = b.rotation ?? 0;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return {
    x: (x - cx) * c + (z - cz) * s,
    z: -(x - cx) * s + (z - cz) * c,
    cx,
    cz,
    c,
    s,
    halfW: b.halfW ?? (b.maxX - b.minX) / 2,
    halfD: b.halfD ?? (b.maxZ - b.minZ) / 2,
  };
}

function worldPoint(x: number, z: number, p: ReturnType<typeof localPoint>) {
  return {
    x: p.cx + x * p.c - z * p.s,
    z: p.cz + x * p.s + z * p.c,
  };
}

function closestSurface(x: number, z: number, b: Collider): SurfacePoint {
  const p = localPoint(x, z, b);
  const inside = Math.abs(p.x) <= p.halfW && Math.abs(p.z) <= p.halfD;
  let qx = clamp(p.x, -p.halfW, p.halfW);
  let qz = clamp(p.z, -p.halfD, p.halfD);
  let nx = p.x - qx;
  let nz = p.z - qz;

  if (inside) {
    const left = p.x + p.halfW;
    const right = p.halfW - p.x;
    const back = p.z + p.halfD;
    const front = p.halfD - p.z;
    const nearest = Math.min(left, right, back, front);
    if (nearest === left) {
      qx = -p.halfW;
      nx = -1;
      nz = 0;
    } else if (nearest === right) {
      qx = p.halfW;
      nx = 1;
      nz = 0;
    } else if (nearest === back) {
      qz = -p.halfD;
      nx = 0;
      nz = -1;
    } else {
      qz = p.halfD;
      nx = 0;
      nz = 1;
    }
  }

  const dist = inside ? Math.hypot(p.x - qx, p.z - qz) : Math.hypot(nx, nz);
  if (!inside && dist > 1e-6) {
    nx /= dist;
    nz /= dist;
  }
  const world = worldPoint(qx, qz, p);
  const normal = worldPoint(nx, nz, { ...p, cx: 0, cz: 0 });
  return {
    x: world.x,
    z: world.z,
    nx: normal.x,
    nz: normal.z,
    dist,
    inside,
  };
}

/** Collision height per pose; tracks the volume-preserving visual scales in character.ts. */
export function poseHeight(pose: string) {
  if (pose === "crouch" || pose === "sit" || pose === "huddle") return 1.35;
  if (pose === "ball") return 1.4;
  if (pose === "lie") return 0.6;
  if (pose === "stretch") return 1.72;
  return 1.72;
}

export function yHitsBox(feetY: number, headY: number, b: Collider, skin = 0.05) {
  return feetY + skin < b.maxY && headY - skin > b.minY;
}

function solidAt(x: number, z: number, r: number, feetY: number, headY: number, b: Collider) {
  if (!yHitsBox(feetY, headY, b)) return false;
  return circleHitsBox(x, z, r, b);
}

export function edgeMargin(r: number) {
  // The perimeter wall mesh is 0.4 units thick. Keep the player's collision
  // circle just outside its rendered face instead of adding an arbitrary
  // inner-room gap that becomes obvious from a side angle.
  return Math.max(r + 0.4, 0.64);
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
  const m = edgeMargin(r);
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
  const m = edgeMargin(r);
  x = clamp(x, m, bounds.w - m);
  z = clamp(z, m, bounds.d - m);
  const pad = r + 0.06;
  for (let iter = 0; iter < 10; iter++) {
    let pushed = false;
    for (const b of boxes) {
      if (!solidAt(x, z, r, feetY, headY, b)) continue;
      pushed = true;
      const surface = closestSurface(x, z, b);
      const len = Math.hypot(surface.nx, surface.nz);
      if (len < 1e-5) {
        const inwardX = bounds.w * 0.5 - x;
        const inwardZ = bounds.d * 0.5 - z;
        if (Math.abs(inwardX) >= Math.abs(inwardZ)) x += Math.sign(inwardX || 1) * pad;
        else z += Math.sign(inwardZ || 1) * pad;
      } else {
        x = surface.x + surface.nx * pad;
        z = surface.z + surface.nz * pad;
      }
    }
    x = clamp(x, m, bounds.w - m);
    z = clamp(z, m, bounds.d - m);
    // Free of every box: the common case, so the remaining passes are skipped.
    if (!pushed) break;
  }
  return { x, z };
}

function slideOnce(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r: number,
  boxes: Collider[],
  bounds: { w: number; d: number },
  feetY: number,
  headY: number,
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
  const dist = Math.hypot(dx, dz);
  const maxStep = 0.14;
  const steps = Math.max(1, Math.ceil(dist / maxStep));
  let cx = x;
  let cz = z;
  for (let i = 0; i < steps; i++) {
    const next = slideOnce(cx, cz, dx / steps, dz / steps, r, boxes, bounds, feetY, headY);
    cx = next.x;
    cz = next.z;
  }
  return { x: cx, z: cz };
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
  if (pose === "stick") return 0.2;
  if (pose === "stretch") return 0.2;
  if (pose === "lie" || pose === "ball" || pose === "huddle") return 0.3;
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
    const surface = closestSurface(x, z, b);
    if (surface.inside || surface.dist > maxDist || surface.dist < 1e-6) continue;
    if (!best || surface.dist < best.dist) best = { ...surface, box: b };
  }
  return best;
}
