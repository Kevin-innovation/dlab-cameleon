import { describe, expect, it } from "vitest";
import { accrueMissed, MISSED_FOV_COS, MISSED_RANGE, missedPointsPerSecond } from "../missed";
import type { PlayerSnap } from "../types";

function snap(id: string, x: number, z: number, yaw = 0, extra: Partial<PlayerSnap> = {}): PlayerSnap {
  return { id, name: id, ready: true, x, y: 0, z, yaw, pose: "stand", fill: "#fff", blobs: [], role: "hider", alive: true, shootSeq: 0, ...extra };
}

describe("missedPointsPerSecond", () => {
  it("pays more the closer the hunter is and nothing beyond range", () => {
    expect(missedPointsPerSecond(1)).toBeGreaterThan(missedPointsPerSecond(6));
    expect(missedPointsPerSecond(MISSED_RANGE)).toBe(0);
    expect(missedPointsPerSecond(MISSED_RANGE + 1)).toBe(0);
  });
});

describe("accrueMissed", () => {
  // Body forward is (-sin yaw, -cos yaw); yaw 0 looks toward -z.
  const hunter = snap("h", 0, 0, 0);
  const seen = snap("a", 0, -4);
  const behind = snap("b", 0, 4);
  const far = snap("c", 0, -20);
  const running = snap("d", 1, -4, 0, { moving: true });

  it("credits still hiders inside the hunter's cone with clear sight", () => {
    const out = accrueMissed([hunter], [seen, behind, far, running], 2, () => true);
    expect(out.get("a")).toBeCloseTo(missedPointsPerSecond(4) * 2, 5);
    expect(out.has("b")).toBe(false);
    expect(out.has("c")).toBe(false);
    expect(out.has("d")).toBe(false);
  });

  it("credits nothing when a wall blocks the view", () => {
    const out = accrueMissed([hunter], [seen], 2, () => false);
    expect(out.size).toBe(0);
  });

  it("uses the cone edge as the cutoff", () => {
    const edge = Math.acos(MISSED_FOV_COS) + 0.05;
    const justOutside = snap("e", Math.sin(edge) * 4, -Math.cos(edge) * 4);
    expect(accrueMissed([hunter], [justOutside], 1, () => true).size).toBe(0);
  });

  it("sums credit from several hunters", () => {
    const second = snap("h2", 0, -8, Math.PI); // looking toward +z, at the same hider
    const out = accrueMissed([hunter, second], [seen], 1, () => true);
    expect(out.get("a")).toBeCloseTo(missedPointsPerSecond(4) * 2, 5);
  });
});
