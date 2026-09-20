import { describe, expect, it } from "vitest";
import { camouflageMeter, hunterVisibility, lightLevelAt, materialMatch } from "../camouflage";
import { blocked, circleHitsBox, moveWithSlide, nearestSurface, probesBlocked, resolveStuck } from "../engine/collision";
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

describe("hunterVisibility light factor", () => {
  it("makes a camouflaged hider fainter in the dark and clearer under light", () => {
    const dark = hunterVisibility(80, 8, "stand", false, 0);
    const mid = hunterVisibility(80, 8, "stand", false, 0.6);
    const bright = hunterVisibility(80, 8, "stand", false, 1);
    expect(dark).toBeLessThan(mid);
    expect(mid).toBeLessThan(bright);
    expect(hunterVisibility(0, 1, "stand", false, 1)).toBe(1);
  });

  it("reads the light level from the containing room", () => {
    const map = { rooms: [{ x: 0, z: 0, w: 10, d: 10, light: 0.2 }, { x: 10, z: 0, w: 10, d: 10 }] };
    expect(lightLevelAt(map, 5, 5)).toBe(0.2);
    expect(lightLevelAt(map, 15, 5)).toBe(0.6);
    expect(lightLevelAt(map, 50, 50)).toBe(0.6);
  });
});

describe("material finish", () => {
  it("rewards a matching roughness and penalises a mismatch by up to 15%", () => {
    expect(materialMatch(0.3, 0.3)).toBe(1);
    expect(materialMatch(0.1, 0.9)).toBe(0);
    expect(materialMatch(undefined, 0.5)).toBe(0.7);
    const good = camouflageMeter("#6b8f71", [], "#6b8f71", 0.8, 0.8).score ?? 0;
    const bad = camouflageMeter("#6b8f71", [], "#6b8f71", 0.1, 0.8).score ?? 0;
    expect(good).toBeGreaterThan(bad);
    expect(bad / good).toBeGreaterThan(0.84);
  });
});

describe("pose probes", () => {
  it("flags a wall beside spread arms and ahead of a crouched head, not for a standing body", () => {
    const wall = { minX: 4.8, maxX: 5.2, minZ: 0, maxZ: 20, minY: 0, maxY: 3 } as Collider;
    // Standing 0.6m from the wall, facing along it (yaw 0 → forward -z, right +x): arms clear.
    expect(probesBlocked("stand", 4.2, 10, 0, [wall], 0, 1.72)).toBe(false);
    // Spread arms reach 0.5 + 0.2 to the right → into the wall.
    expect(probesBlocked("spread", 4.2, 10, 0, [wall], 0, 1.72)).toBe(true);
    // Crouching and facing the wall (yaw -π/2 → forward +x): the head probe 0.42 ahead hits it.
    expect(probesBlocked("crouch", 4.3, 10, -Math.PI / 2, [wall], 0, 1.25)).toBe(true);
    // Same spot facing away: clear.
    expect(probesBlocked("crouch", 4.3, 10, Math.PI / 2, [wall], 0, 1.25)).toBe(false);
  });
});
