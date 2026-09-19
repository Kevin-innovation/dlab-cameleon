import { describe, expect, it } from "vitest";
import { buildRooms, mergeWallLines, type WallLine } from "../rooms";
import type { RoomDef } from "../../types";

const CEIL = 3;
const fullWall = (b: { role?: string; h: number }) => b.role === "wall" && Math.abs(b.h - CEIL) < 1e-6;

function room(overrides: Partial<RoomDef> = {}): RoomDef {
  return { id: "a", x: 0, z: 0, w: 10, d: 8, ...overrides };
}

describe("buildRooms", () => {
  it("surrounds a plain room with four full-height walls", () => {
    const out = buildRooms([room()], CEIL, "test");
    const walls = out.boxes.filter((b) => b.role === "wall");
    expect(walls).toHaveLength(4);
    for (const wall of walls) expect(wall.h).toBeCloseTo(CEIL, 5);
    const totalLength = walls.reduce((sum, w) => sum + Math.max(w.w, w.d), 0);
    expect(totalLength).toBeCloseTo(2 * (10 + 8), 1);
  });

  it("cuts a door out of a wall and emits a DoorDef", () => {
    const out = buildRooms([room({ openings: [{ kind: "door", side: "n", at: 5, width: 1.8 }] })], CEIL, "test");
    const north = out.boxes.filter((b) => fullWall(b) && Math.abs(b.z) < 0.5);
    expect(north).toHaveLength(2);
    const covered = north.reduce((sum, w) => sum + w.w, 0);
    expect(covered).toBeCloseTo(10 - 1.8, 5);
    expect(out.doors).toHaveLength(1);
    expect(out.doors[0].x).toBeCloseTo(5, 5);
    expect(out.doors[0].along).toBe("x");
  });

  it("cuts an arch without a door leaf", () => {
    const out = buildRooms([room({ openings: [{ kind: "arch", side: "w", at: 4, width: 2 }] })], CEIL, "test");
    expect(out.doors).toHaveLength(0);
    const west = out.boxes.filter((b) => fullWall(b) && Math.abs(b.x) < 0.5 && b.d > b.w);
    expect(west).toHaveLength(2);
  });

  it("builds a window as sill wall, header wall and a glass pane", () => {
    const out = buildRooms([room({ openings: [{ kind: "window", side: "s", at: 5, width: 2, sill: 0.9, height: 1.3 }] })], CEIL, "test");
    const south = out.boxes.filter((b) => Math.abs(b.z - 8) < 0.5);
    const sill = south.find((b) => b.role === "trim" && b.h < 1 && b.w === 2);
    const header = south.find((b) => b.role === "wall" && b.y > 2 && b.w === 2);
    const glass = south.find((b) => b.role === "glass");
    expect(sill?.h).toBeCloseTo(0.9, 5);
    expect(header?.h).toBeCloseTo(CEIL - 0.9 - 1.3, 5);
    expect(glass?.h).toBeCloseTo(1.3, 5);
    expect(glass?.collide).toBe(true);
  });

  it("shares the wall between two adjacent rooms instead of doubling it", () => {
    const rooms = [room({ id: "a" }), room({ id: "b", x: 10, openings: [{ kind: "door", side: "w", at: 4, width: 1.8 }] })];
    const out = buildRooms(rooms, CEIL, "test");
    const shared = out.boxes.filter((b) => fullWall(b) && Math.abs(b.x - 10) < 0.5 && b.d > b.w);
    // One line with one door: two segments, not four overlapping ones.
    expect(shared).toHaveLength(2);
    expect(out.doors).toHaveLength(1);
  });

  it("adds a ceiling panel per room unless the room is open to the sky", () => {
    const out = buildRooms([room({ id: "a" }), room({ id: "b", x: 10, ceiling: { open: true } })], CEIL, "test");
    const panels = out.boxes.filter((b) => b.role === "ceiling");
    expect(panels).toHaveLength(1);
    expect(panels[0].y).toBeGreaterThan(CEIL - 0.2);
    expect(panels[0].collide).toBe(false);
  });

  it("places fixtures as emissive boxes just under the ceiling", () => {
    const out = buildRooms([room({ ceiling: { fixtures: [{ x: 5, z: 4, kind: "fluorescent" }, { x: 2, z: 2, kind: "pendant", on: false }] } })], CEIL, "test");
    const fixtures = out.boxes.filter((b) => b.role === "fixture");
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0].emissive).toBeTruthy();
    expect(fixtures[1].emissive).toBeUndefined();
    expect(out.lights).toHaveLength(1);
    expect(out.lights[0].y).toBeLessThan(CEIL);
  });

  it("leaves a gap opening completely open", () => {
    const out = buildRooms([room({ openings: [{ kind: "gap", side: "e", at: 4, width: 8 }] })], CEIL, "test");
    const east = out.boxes.filter((b) => b.role === "wall" && Math.abs(b.x - 10) < 0.5 && b.d > b.w);
    expect(east).toHaveLength(0);
  });
});

describe("wall heights", () => {
  it("uses the room's own wall height (fences) and lets a building win a shared run", () => {
    const out = buildRooms(
      [
        room({ id: "yard", w: 20, d: 20, wall: { height: 1.1 }, ceiling: { open: true } }),
        room({ id: "barn", x: 0, z: 0, w: 8, d: 8, ceiling: { height: 4 } }),
      ],
      3,
      "farm",
    );
    const walls = out.boxes.filter((b) => b.role === "wall");
    const fence = walls.find((b) => Math.abs(b.x - 20) < 0.5 && b.d > b.w);
    expect(fence?.h).toBeCloseTo(1.1, 5);
    // North plane: the barn owns 0..8 at 4m, the fence continues 8..20 at 1.1m.
    const north = walls.filter((b) => Math.abs(b.z) < 0.5 && b.w >= b.d).sort((a, b) => a.x - b.x);
    expect(north.map((b) => [Math.round(b.w * 10) / 10, b.h])).toEqual([
      [8, 4],
      [12, 1.1],
    ]);
  });
});

describe("mergeWallLines", () => {
  it("unions overlapping intervals on the same plane and keeps every opening", () => {
    const lines: WallLine[] = [
      { axis: "x", plane: 0, a0: 0, a1: 10, openings: [{ at: 2, width: 1, kind: "door" }] },
      { axis: "x", plane: 0, a0: 10, a1: 18, openings: [{ at: 14, width: 2, kind: "arch" }] },
      { axis: "x", plane: 8, a0: 0, a1: 10, openings: [] },
    ];
    const merged = mergeWallLines(lines);
    expect(merged).toHaveLength(2);
    const long = merged.find((l) => l.plane === 0);
    expect(long?.a0).toBe(0);
    expect(long?.a1).toBe(18);
    expect(long?.openings).toHaveLength(2);
  });
});
