import { resolveStuck } from "./engine/collision";
import { mapColliders } from "./maps";
import type { GameMap, RoomState } from "./types";

export type GatherSpot = { x: number; z: number; yaw: number };

const RING_RADIUS = 1.8;
const ROULETTE_TAIL_MS = 1600;

/**
 * Where everyone stands while the roulette runs: a ring around the map's gather
 * point (or the hunter spawn), each facing the centre. Order follows participantIds
 * sorted so every client computes the same ring.
 */
export function gatherPositions(map: GameMap, participantIds: readonly string[]): Map<string, GatherSpot> {
  const centre = map.gather ?? map.hunterSpawns[0] ?? { x: map.w / 2, z: map.d / 2 };
  const ids = [...participantIds].sort();
  const colliders = mapColliders(map);
  const bounds = { w: map.w, d: map.d };
  const spots = new Map<string, GatherSpot>();
  ids.forEach((id, i) => {
    const angle = (i / Math.max(1, ids.length)) * Math.PI * 2 - Math.PI / 2;
    const raw = { x: centre.x + Math.cos(angle) * RING_RADIUS, z: centre.z + Math.sin(angle) * RING_RADIUS };
    const safe = resolveStuck(raw.x, raw.z, 0.4, colliders, bounds);
    // Body forward is (-sin yaw, -cos yaw); face the centre.
    const yaw = Math.atan2(-(centre.x - safe.x), -(centre.z - safe.z));
    spots.set(id, { x: safe.x, z: safe.z, yaw });
  });
  return spots;
}

export type RouletteState = {
  order: string[];
  index: number;
  /** True once the spin has stopped on the hunter. */
  settled: boolean;
  /** 0..1 progress of the spin itself. */
  progress: number;
};

/**
 * Deterministic "who is it" roulette for the prepare phase. Every client derives the
 * same frame from the room clock, so the reveal is synchronised without extra state.
 */
export function rouletteState(room: RoomState, now: number): RouletteState {
  const order = [...room.participantIds].sort();
  if (order.length === 0) return { order, index: 0, settled: true, progress: 1 };
  const total = room.prepareTime * 1000;
  const start = room.phaseEndsAt - total;
  const spinMs = Math.max(900, total - ROULETTE_TAIL_MS);
  const progress = Math.max(0, Math.min(1, (now - start) / spinMs));
  const target = Math.max(0, order.indexOf(room.hunterIds[0] ?? order[0]));
  const eased = 1 - Math.pow(1 - progress, 3);
  const laps = 3;
  const steps = laps * order.length + target;
  const index = Math.floor(eased * steps) % order.length;
  return { order, index: progress >= 1 ? target : index, settled: progress >= 1, progress };
}
