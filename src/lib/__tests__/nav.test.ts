import { describe, expect, it } from "vitest";
import { buildNavGrid, findPath, gridLineClear, nearestWalkable, navGridFor, NAV_HEAD_HEIGHT, NAV_STEP_HEIGHT } from "@/lib/nav";
import { MAPS, mapColliders } from "@/lib/maps";
import { poseRadius } from "@/lib/engine/collision";
import { blocked } from "@/lib/engine/collision";
import type { GameMap } from "@/lib/types";

const RADIUS = poseRadius("stand");

/** 10x10 open room with a wall down the middle leaving a gap at the far end. */
function wallMap(): GameMap {
  return {
    ...MAPS[0],
    id: "wall-test",
    w: 10,
    d: 10,
    boxes: [{ x: 5, y: 1.5, z: 4, w: 0.3, d: 8, h: 3, color: "#fff", collide: true }],
    doors: [],
    rooms: [],
  };
}

describe("nav grid", () => {
  it("marks cells inside walls as blocked and open floor as walkable", () => {
    const grid = buildNavGrid(wallMap(), RADIUS);
    expect(grid.cols).toBe(40);
    const wallCell = Math.floor(4 / grid.cell) * grid.cols + Math.floor(5 / grid.cell);
    const floorCell = Math.floor(2 / grid.cell) * grid.cols + Math.floor(2 / grid.cell);
    expect(grid.walkable[wallCell]).toBe(0);
    expect(grid.walkable[floorCell]).toBe(1);
    expect(nearestWalkable(grid, wallCell)).not.toBe(-1);
  });

  it("routes around the wall through the gap and string-pulls the result", () => {
    const grid = buildNavGrid(wallMap(), RADIUS);
    const start = { x: 2, z: 2 };
    const goal = { x: 8, z: 2 };
    expect(gridLineClear(grid, start, goal)).toBe(false);
    const path = findPath(grid, start, goal);
    expect(path.length).toBeGreaterThan(1);
    expect(path.length).toBeLessThan(6);
    expect(path[path.length - 1]).toEqual(goal);
    expect(path.every((p) => p.z > 7.5 || Math.abs(p.x - 5) > 0.8)).toBe(true);
    let prev = start;
    for (const p of path) {
      expect(gridLineClear(grid, prev, p)).toBe(true);
      prev = p;
    }
  });

  it("returns the goal directly when the line is clear", () => {
    const grid = buildNavGrid(wallMap(), RADIUS);
    expect(findPath(grid, { x: 1, z: 1 }, { x: 3, z: 3 })).toEqual([{ x: 3, z: 3 }]);
  });

  it("finds routes between every spawn pair on the shipped maps", () => {
    for (const map of MAPS) {
      const grid = navGridFor(map, RADIUS);
      const cols = mapColliders(map);
      for (const a of map.spawns) {
        for (const b of [...map.hunterSpawns, map.spawns[0]]) {
          const path = findPath(grid, a, b);
          expect(path.length, `${map.id} ${a.x},${a.z} → ${b.x},${b.z}`).toBeGreaterThan(0);
          for (const p of path.slice(0, -1)) {
            expect(blocked(p.x, p.z, RADIUS, cols, { w: map.w, d: map.d }, NAV_STEP_HEIGHT, NAV_HEAD_HEIGHT), `${map.id} waypoint ${p.x},${p.z}`).toBe(false);
          }
        }
      }
    }
  });

  it("caches grids per map", () => {
    expect(navGridFor(MAPS[0], RADIUS)).toBe(navGridFor(MAPS[0], RADIUS));
  });
});
