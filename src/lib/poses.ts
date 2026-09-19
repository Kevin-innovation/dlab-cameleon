import type { Pose } from "./types";

/** Visual transform of the body group for a pose: scale [x, y, z], position offset, rotation (radians). */
export type PoseShape = { scale: [number, number, number]; position?: [number, number, number]; rotation?: [number, number, number] };

/**
 * Poses reshape the silhouette but keep the body's volume (x·y·z ≈ 1): a pose must never
 * be a free "shrink", otherwise the petit body size would be pointless.
 */
export const POSE_SHAPES: Record<Pose, PoseShape> = {
  stand: { scale: [1, 1, 1] },
  crouch: { scale: [1.15, 0.7, 1.25] },
  sit: { scale: [1.2, 0.68, 1.22], position: [0, -0.08, 0] },
  lie: { scale: [1.05, 0.95, 1.0], position: [0, 0.3, 0], rotation: [-Math.PI / 2, 0, 0] },
  stretch: { scale: [0.72, 1.9, 0.72] },
  ball: { scale: [1.2, 0.72, 1.16], position: [0, 0.05, 0] },
  stick: { scale: [1.5, 1.2, 0.56] },
  lean: { scale: [1, 1, 1], position: [-0.18, 0, 0], rotation: [0, 0, 0.32] },
  huddle: { scale: [1.2, 0.6, 1.4], position: [0, -0.05, 0] },
  spread: { scale: [1.6, 1.0, 0.63] },
  upside: { scale: [1, 1, 1], position: [0, 1.95, 0], rotation: [Math.PI, 0, 0] },
};

export function poseVolume(pose: Pose) {
  const [x, y, z] = POSE_SHAPES[pose].scale;
  return x * y * z;
}
