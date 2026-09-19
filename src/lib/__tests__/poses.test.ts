import { describe, expect, it } from "vitest";
import { POSE_SHAPES, poseVolume } from "@/lib/poses";
import { POSES } from "@/lib/types";

describe("pose shapes", () => {
  it("defines a shape for every pose", () => {
    for (const p of POSES) expect(POSE_SHAPES[p.id]).toBeDefined();
  });

  it("keeps body volume within 5% so no pose is a free shrink", () => {
    for (const p of POSES) {
      expect(poseVolume(p.id), p.id).toBeGreaterThan(0.95);
      expect(poseVolume(p.id), p.id).toBeLessThan(1.05);
    }
  });
});
