import type { PlayerSnap } from "./types";

/**
 * Missed Spot scoring (original v1.2/v1.5 rules): a hider earns points for every
 * second spent still inside a hunter's field of view without being caught, more
 * the closer the hunter is. Moving hiders earn nothing.
 */
export const MISSED_RANGE = 12;
/** cos(30°): the cone is ±30° around the hunter's facing. */
export const MISSED_FOV_COS = Math.cos(Math.PI / 6);
const MAX_POINTS_PER_SECOND = 10;

export function missedPointsPerSecond(distance: number): number {
  if (distance >= MISSED_RANGE) return 0;
  const closeness = 1 - distance / MISSED_RANGE;
  return Math.round(MAX_POINTS_PER_SECOND * closeness * closeness * 100) / 100;
}

/** Points earned by each hider over `dt` seconds. `hasSight(hunter, hider)` answers occlusion. */
export function accrueMissed(
  hunters: readonly PlayerSnap[],
  hiders: readonly PlayerSnap[],
  dt: number,
  hasSight: (hunter: PlayerSnap, hider: PlayerSnap) => boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const hunter of hunters) {
    const fx = -Math.sin(hunter.yaw);
    const fz = -Math.cos(hunter.yaw);
    for (const hider of hiders) {
      if (hider.moving) continue;
      const dx = hider.x - hunter.x;
      const dz = hider.z - hunter.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 0.001 || dist >= MISSED_RANGE) continue;
      const dot = (dx * fx + dz * fz) / dist;
      if (dot < MISSED_FOV_COS) continue;
      if (!hasSight(hunter, hider)) continue;
      out.set(hider.id, (out.get(hider.id) ?? 0) + missedPointsPerSecond(dist) * dt);
    }
  }
  return out;
}
