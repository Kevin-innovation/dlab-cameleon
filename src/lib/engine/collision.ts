import type { Collider } from "../types";

export function circleHitsBox(x: number, z: number, r: number, b: Collider) {
  const nx = Math.max(b.minX, Math.min(x, b.maxX));
  const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - nx;
  const dz = z - nz;
  return dx * dx + dz * dz < r * r;
}

export function blocked(
  x: number,
  z: number,
  r: number,
  boxes: Collider[],
  bounds: { w: number; d: number },
) {
  if (x - r < 0.35 || z - r < 0.35 || x + r > bounds.w - 0.35 || z + r > bounds.d - 0.35) {
    return true;
  }
  for (const b of boxes) {
    if (circleHitsBox(x, z, r, b)) return true;
  }
  return false;
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
  let nx = x + dx;
  let nz = z + dz;
  if (blocked(nx, z, r, boxes, bounds)) nx = x;
  if (blocked(nx, nz, r, boxes, bounds)) nz = z;
  if (blocked(nx, nz, r, boxes, bounds)) return { x, z };
  return { x: nx, z: nz };
}

export function poseRadius(pose: string) {
  if (pose === "lie") return 0.55;
  if (pose === "ball") return 0.4;
  if (pose === "sit") return 0.38;
  if (pose === "stretch") return 0.22;
  return 0.32;
}
