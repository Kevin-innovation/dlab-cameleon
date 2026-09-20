import type { BodyPart, Pose } from "./types";

type Vec3 = [number, number, number];

/** Per-limb transform for a pose; anything omitted falls back to PART_BASE / identity. */
export type PartPose = { position?: Vec3; rotation?: Vec3; scale?: Vec3 };

/** Visual transform of the body group for a pose plus optional limb poses. */
export type PoseShape = {
  scale: Vec3;
  position?: Vec3;
  rotation?: Vec3;
  parts?: Partial<Record<BodyPart, PartPose>>;
};

/** Rest position of every limb (see createCharacter); poses are expressed relative to this. */
export const PART_BASE: Record<BodyPart, Vec3> = {
  head: [0, 1.52, 0],
  torso: [0, 1.0, 0],
  armL: [-0.32, 1.12, 0],
  armR: [0.32, 1.12, 0],
  legL: [-0.11, 0.3, 0],
  legR: [0.11, 0.3, 0],
};

const HALF_PI = Math.PI / 2;

/**
 * Poses reshape the silhouette but keep the body's volume (group x·y·z ≈ 1): a pose must
 * never be a free "shrink", otherwise the petit body size would be pointless. Limb poses
 * (arms out, knees tucked) give each pose a readable shape instead of a squashed mannequin.
 */
// Forward is -z in the engine (see world.stepLocal): limbs that reach "ahead" use negative z.
export const POSE_SHAPES: Record<Pose, PoseShape> = {
  stand: { scale: [1, 1, 1] },
  crouch: {
    scale: [1.05, 0.85, 1.12],
    parts: {
      torso: { position: [0, 0.82, -0.12], rotation: [-0.55, 0, 0] },
      head: { position: [0, 1.18, -0.36] },
      armL: { position: [-0.3, 0.88, -0.24], rotation: [0.9, 0, 0] },
      armR: { position: [0.3, 0.88, -0.24], rotation: [0.9, 0, 0] },
      legL: { position: [-0.11, 0.28, -0.16], rotation: [1.0, 0, 0], scale: [1, 0.85, 1] },
      legR: { position: [0.11, 0.28, -0.16], rotation: [1.0, 0, 0], scale: [1, 0.85, 1] },
    },
  },
  sit: {
    scale: [1.1, 0.82, 1.12],
    parts: {
      torso: { position: [0, 0.78, 0] },
      head: { position: [0, 1.3, 0] },
      armL: { position: [-0.32, 0.9, -0.08], rotation: [0.35, 0, 0] },
      armR: { position: [0.32, 0.9, -0.08], rotation: [0.35, 0, 0] },
      legL: { position: [-0.11, 0.24, -0.3], rotation: [HALF_PI, 0, 0] },
      legR: { position: [0.11, 0.24, -0.3], rotation: [HALF_PI, 0, 0] },
    },
  },
  // Lying: the body is rotated onto its back and slid so it is centred on the player's
  // position (feet 0.95 behind, head 0.95 ahead) — the collision radius covers that span.
  lie: { scale: [1.05, 0.95, 1.0], position: [0, 0.3, 0.95], rotation: [-HALF_PI, 0, 0] },
  stretch: {
    scale: [0.82, 1.48, 0.82],
    parts: {
      armL: { position: [-0.16, 1.66, 0], rotation: [0, 0, 0.18] },
      armR: { position: [0.16, 1.66, 0], rotation: [0, 0, -0.18] },
    },
  },
  ball: {
    scale: [1, 1, 1],
    parts: {
      torso: { position: [0, 0.5, 0], scale: [1.55, 0.72, 1.55] },
      head: { position: [0, 0.68, -0.3], scale: [0.72, 0.72, 0.72] },
      armL: { position: [-0.3, 0.5, -0.26], rotation: [1.3, 0, 0.5], scale: [0.7, 0.7, 0.7] },
      armR: { position: [0.3, 0.5, -0.26], rotation: [1.3, 0, -0.5], scale: [0.7, 0.7, 0.7] },
      legL: { position: [-0.14, 0.3, -0.3], rotation: [1.5, 0, 0], scale: [0.9, 0.6, 0.9] },
      legR: { position: [0.14, 0.3, -0.3], rotation: [1.5, 0, 0], scale: [0.9, 0.6, 0.9] },
    },
  },
  stick: {
    scale: [1.5, 1.2, 0.56],
    parts: {
      armL: { position: [-0.36, 1.12, 0], rotation: [0, 0, 0.35] },
      armR: { position: [0.36, 1.12, 0], rotation: [0, 0, -0.35] },
    },
  },
  lean: { scale: [1, 1, 1], position: [-0.18, 0, 0], rotation: [0, 0, 0.32] },
  huddle: {
    scale: [1.1, 0.78, 1.15],
    parts: {
      torso: { position: [0, 0.68, -0.08], rotation: [-0.35, 0, 0] },
      head: { position: [0, 1.02, -0.28], scale: [0.95, 0.95, 0.95] },
      armL: { position: [-0.28, 0.7, -0.24], rotation: [1.2, 0, 0.3] },
      armR: { position: [0.28, 0.7, -0.24], rotation: [1.2, 0, -0.3] },
      legL: { position: [-0.11, 0.3, -0.26], rotation: [1.35, 0, 0], scale: [1, 0.8, 1] },
      legR: { position: [0.11, 0.3, -0.26], rotation: [1.35, 0, 0], scale: [1, 0.8, 1] },
    },
  },
  spread: {
    scale: [1, 1, 1],
    parts: {
      armL: { position: [-0.52, 1.24, 0], rotation: [0, 0, HALF_PI] },
      armR: { position: [0.52, 1.24, 0], rotation: [0, 0, -HALF_PI] },
      legL: { position: [-0.2, 0.32, 0], rotation: [0, 0, 0.32] },
      legR: { position: [0.2, 0.32, 0], rotation: [0, 0, -0.32] },
    },
  },
  upside: { scale: [1, 1, 1], position: [0, 1.95, 0], rotation: [Math.PI, 0, 0] },
};

export function poseVolume(pose: Pose) {
  const [x, y, z] = POSE_SHAPES[pose].scale;
  return x * y * z;
}
