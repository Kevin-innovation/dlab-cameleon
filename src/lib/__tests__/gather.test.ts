import { describe, expect, it } from "vitest";
import { ceilingAt } from "../ceiling";
import { gatherPositions, rouletteState } from "../gather";
import { emptyRoom } from "../round";
import type { GameMap } from "../types";

const map: GameMap = {
  id: "t",
  name: "t",
  blurb: "",
  difficulty: "쉬움",
  w: 40,
  d: 30,
  ceiling: 3,
  fog: "#000",
  floor: "#fff",
  boxes: [],
  doors: [],
  spawns: [],
  hunterSpawns: [{ x: 20, z: 15 }],
};

describe("gatherPositions", () => {
  it("places participants on a ring around the gather point, facing it", () => {
    const ids = ["a", "b", "c", "d"];
    const spots = gatherPositions(map, ids);
    expect(spots.size).toBe(4);
    for (const id of ids) {
      const spot = spots.get(id)!;
      expect(Math.hypot(spot.x - 20, spot.z - 15)).toBeCloseTo(1.8, 1);
      // yaw points at the centre: moving forward (-sin yaw, -cos yaw) reduces the distance.
      const step = { x: spot.x - Math.sin(spot.yaw) * 0.1, z: spot.z - Math.cos(spot.yaw) * 0.1 };
      expect(Math.hypot(step.x - 20, step.z - 15)).toBeLessThan(1.8);
    }
  });

  it("uses map.gather when present and keeps everyone apart", () => {
    const spots = gatherPositions({ ...map, gather: { x: 5, z: 5 } }, ["a", "b"]);
    const a = spots.get("a")!;
    const b = spots.get("b")!;
    expect(Math.hypot(a.x - 5, a.z - 5)).toBeCloseTo(1.8, 1);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
  });

  it("is deterministic in participant order", () => {
    const one = gatherPositions(map, ["b", "a"]);
    const two = gatherPositions(map, ["a", "b"]);
    expect(one.get("a")).toEqual(two.get("a"));
  });
});

describe("rouletteState", () => {
  const room = { ...emptyRoom(), phase: "prepare" as const, prepareTime: 8, phaseEndsAt: 100_000, hunterIds: ["c"], participantIds: ["a", "b", "c", "d"] };
  const start = room.phaseEndsAt - room.prepareTime * 1000;

  it("spins through names early and lands on the hunter at the end", () => {
    const early = rouletteState(room, start + 200);
    expect(early.settled).toBe(false);
    expect(early.order).toEqual(["a", "b", "c", "d"]);
    const late = rouletteState(room, room.phaseEndsAt - 500);
    expect(late.settled).toBe(true);
    expect(late.order[late.index]).toBe("c");
  });

  it("never lands on a hider even for the last spinning frame", () => {
    const end = rouletteState(room, start + (room.prepareTime * 1000 - 1600));
    expect(end.order[end.index]).toBe("c");
  });

  it("is identical for every client at the same time", () => {
    const now = start + 2345;
    expect(rouletteState(room, now)).toEqual(rouletteState(room, now));
  });
});

describe("ceilingAt", () => {
  it("uses the smallest enclosing room, open rooms have no ceiling, outdoors is open", () => {
    const rooms = [
      { id: "yard", x: 0, z: 0, w: 40, d: 30, ceiling: { open: true } },
      { id: "barn", x: 4, z: 2, w: 16, d: 14, ceiling: { height: 5 } },
      { id: "low", x: 30, z: 20, w: 8, d: 8, wall: { height: 2.6 } },
    ];
    const m = { ...map, kind: "outdoor" as const, rooms };
    expect(ceilingAt(m, 10, 8)).toBe(5);
    expect(ceilingAt(m, 34, 24)).toBe(2.6);
    expect(ceilingAt(m, 25, 25)).toBe(Number.POSITIVE_INFINITY);
    expect(ceilingAt({ ...map, rooms: [] }, 1, 1)).toBe(3);
  });
});
