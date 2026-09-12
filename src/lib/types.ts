export type Pose = "stand" | "crouch" | "sit" | "lie" | "stretch" | "ball";

export type Phase = "lobby" | "hide" | "hunt" | "result";

export type Mode = "normal" | "infection";

export type Role = "hider" | "hunter" | "spectator";

export type Pattern =
  | "solid"
  | "wood"
  | "books"
  | "tiles"
  | "bricks"
  | "stripes"
  | "dots"
  | "graffiti"
  | "hay"
  | "check"
  | "pipes"
  | "leaves"
  | "wallpaper";

export type BodyPart = "head" | "torso" | "armL" | "armR" | "legL" | "legR";

export const BODY_PARTS: BodyPart[] = ["head", "torso", "armL", "armR", "legL", "legR"];

export type PaintBlob = {
  x: number;
  y: number;
  r: number;
  c: string;
  part: BodyPart;
};

export type BoxDef = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  pattern?: Pattern;
  colors?: string[];
  collide?: boolean;
};

export type Collider = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type GameMap = {
  id: string;
  name: string;
  blurb: string;
  difficulty: "쉬움" | "보통" | "어려움";
  w: number;
  d: number;
  ceiling: number;
  fog: string;
  floor: string;
  boxes: BoxDef[];
  spawns: { x: number; z: number }[];
  hunterSpawns: { x: number; z: number }[];
};

export type RoomState = {
  phase: Phase;
  mode: Mode;
  mapId: string;
  round: number;
  phaseEndsAt: number;
  hunterIds: string[];
  caughtIds: string[];
  scores: Record<string, number>;
  hideTime: number;
  huntTime: number;
  hunterCount: number;
  ammoCount: number;
  ammo: Record<string, number>;
  lastTag?: { id: string; by: string; name: string; byName: string; at: number };
  feed: { id: string; by: string; name: string; byName: string; at: number }[];
  taunts: { x: number; y: number; at: number; id: string }[];
  winner?: "hunters" | "hiders";
};

export type PlayerSnap = {
  id: string;
  name: string;
  ready: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pose: Pose;
  fill: string;
  blobs: PaintBlob[];
  role: Role;
  alive: boolean;
  shootSeq: number;
};

export const POSES: { id: Pose; label: string; hint: string }[] = [
  { id: "stand", label: "서기", hint: "기본" },
  { id: "crouch", label: "숙이기", hint: "낮은 가구" },
  { id: "sit", label: "앉기", hint: "소파·상자" },
  { id: "lie", label: "눕기", hint: "러그·바닥" },
  { id: "stretch", label: "늘이기", hint: "문틀·파이프" },
  { id: "ball", label: "공", hint: "원형 소품" },
];
