import type { GameMap } from "./types";

/**
 * Height of the ceiling over a point: the containing room's ceiling, the map ceiling
 * elsewhere, and effectively none under the open sky. Used to keep jumps and the
 * spectator camera inside the room.
 */
export function ceilingAt(map: Pick<GameMap, "kind" | "ceiling" | "rooms">, x: number, z: number): number {
  const rooms = (map.rooms ?? []).filter((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d);
  // Overlapping rooms (a barn inside a yard): the smallest one is the real enclosure.
  const room = rooms.sort((a, b) => a.w * a.d - b.w * b.d)[0];
  if (room) {
    if (room.ceiling?.open) return Number.POSITIVE_INFINITY;
    return room.ceiling?.height ?? room.wall?.height ?? map.ceiling;
  }
  return map.kind === "outdoor" ? Number.POSITIVE_INFINITY : map.ceiling;
}
