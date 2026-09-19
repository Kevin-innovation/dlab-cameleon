import { describe, expect, it } from "vitest";
import { followGoal, hideSpot } from "@/lib/ai";
import { poseRadius } from "@/lib/engine/collision";
import { MAPS, mapColliders } from "@/lib/maps";
import { navGridFor } from "@/lib/nav";

const RADIUS = poseRadius("stand");
const FRAME = 1 / 60;
const BUDGET_S = 30;

/** Walk a bot brain from `from` to `to` with the real steering code and static colliders (doors passable). */
function walk(mapId: string, from: { x: number; z: number }, to: { x: number; z: number }) {
  const map = MAPS.find((m) => m.id === mapId)!;
  const nav = { grid: navGridFor(map, RADIUS + 0.12), cols: mapColliders(map), bounds: { w: map.w, d: map.d } };
  const br = { route: [], routeIndex: 0, routeKey: "", routeReadyAt: 0, stuckSince: 0, wpBest: Number.POSITIVE_INFINITY, wpBestAt: 0, wpKey: "" } as unknown as Parameters<typeof followGoal>[0];
  let x = from.x;
  let z = from.z;
  let now = 0;
  for (let i = 0; i < BUDGET_S / FRAME; i++) {
    const moved = followGoal(br, x, z, to, FRAME, 5.8, RADIUS, nav, now);
    x = moved.x;
    z = moved.z;
    now += FRAME * 1000;
    if (moved.arrived) return { arrived: true, seconds: i * FRAME };
  }
  return { arrived: false, seconds: BUDGET_S, at: { x, z } };
}

describe("bot walking", () => {
  for (const map of MAPS) {
    it(`reaches every hide spot and the hunter spawn on ${map.id}`, () => {
      for (const [i, spawn] of map.spawns.entries()) {
        for (const goal of [hideSpot(map, i, 1), hideSpot(map, i + 13, 2), map.hunterSpawns[0]]) {
          const result = walk(map.id, spawn, goal);
          expect(result.arrived, `${map.id} ${spawn.x},${spawn.z} → ${goal.x.toFixed(1)},${goal.z.toFixed(1)} stuck at ${JSON.stringify(result.at)}`).toBe(true);
        }
      }
    });
  }
});
