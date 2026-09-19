import { describe, expect, it } from "vitest";
import { blocked, circleHitsBox, moveWithSlide, nearestSurface, resolveStuck } from "../engine/collision";
import type { Collider } from "../types";

const BOUNDS = { w: 40, d: 30 };
const R = 0.26;

function wall(minX: number, maxX: number, minZ: number, maxZ: number, maxY = 3): Collider {
  return { minX, maxX, minZ, maxZ, minY: 0, maxY };
}

function rotated(cx: number, cz: number, halfW: number, halfD: number, rotation: number): Collider {
  const reach = Math.hypot(halfW, halfD);
  return { minX: cx - reach, maxX: cx + reach, minZ: cz - reach, maxZ: cz + reach, minY: 0, maxY: 1, centerX: cx, centerZ: cz, halfW, halfD, rotation };
}

describe("moveWithSlide", () => {
  const thinWall = wall(10, 10.4, 0, 30);

  it("never tunnels through a thin wall even with a large step", () => {
    const out = moveWithSlide(9, 15, 3, 0, R, [thinWall], BOUNDS);
    expect(out.x).toBeLessThan(10);
    expect(out.x).toBeGreaterThan(9);
  });

  it("slides along the wall when pushing diagonally into it", () => {
    const out = moveWithSlide(9.5, 15, 1, 1, R, [thinWall], BOUNDS);
    expect(out.x).toBeLessThan(10);
    expect(out.z).toBeGreaterThan(15.5);
  });

  it("moves freely when nothing is in the way", () => {
    const out = moveWithSlide(5, 5, 0.5, 0.25, R, [thinWall], BOUNDS);
    expect(out).toEqual({ x: 5.5, z: 5.25 });
  });

  it("stays inside the room boundary", () => {
    const out = moveWithSlide(1, 1, -5, -5, R, [], BOUNDS);
    expect(out.x).toBeGreaterThanOrEqual(0.64);
    expect(out.z).toBeGreaterThanOrEqual(0.64);
  });

  it("walks past a box it is standing on top of", () => {
    const crate = wall(12, 14, 12, 14, 0.6);
    const out = moveWithSlide(13, 13, 0.5, 0, R, [crate], BOUNDS, 0.6, 0.6 + 1.72);
    expect(out.x).toBeCloseTo(13.5, 5);
  });
});

describe("resolveStuck", () => {
  it("pushes a body out through the nearest face of a wall it is inside", () => {
    const thinWall = wall(10, 10.4, 0, 30);
    const left = resolveStuck(10.05, 15, R, [thinWall], BOUNDS);
    expect(left.x).toBeLessThan(10);
    const right = resolveStuck(10.35, 15, R, [thinWall], BOUNDS);
    expect(right.x).toBeGreaterThan(10.4);
  });

  it("leaves a free body untouched", () => {
    expect(resolveStuck(5, 5, R, [wall(10, 10.4, 0, 30)], BOUNDS)).toEqual({ x: 5, z: 5 });
  });
});

describe("rotated colliders", () => {
  const diamond = rotated(20, 15, 1, 1, Math.PI / 4);

  it("uses the oriented box, not its bounding square", () => {
    expect(circleHitsBox(20, 15, R, diamond)).toBe(true);
    // Corner of the AABB is outside the rotated box.
    expect(circleHitsBox(20 + 1.3, 15 + 1.3, 0.05, diamond)).toBe(false);
    expect(blocked(20 + 1.3, 15 + 1.3, 0.05, [diamond], BOUNDS)).toBe(false);
  });

  it("reports a diagonal normal from its face", () => {
    const hit = nearestSurface(20 + 1.2, 15 + 1.2, [diamond], 2);
    expect(hit).not.toBeNull();
    expect(Math.abs(hit!.nx)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(Math.abs(hit!.nz)).toBeCloseTo(Math.SQRT1_2, 2);
  });
});
