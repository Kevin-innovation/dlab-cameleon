export type Pose = "stand" | "crouch" | "sit" | "lie" | "stretch" | "ball" | "stick";

export type Phase = "lobby" | "prepare" | "hide" | "hunt" | "reveal" | "result";

export type Mode = "normal" | "infection";

export type HunterMode = "random" | "human" | "ai";

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

export type PropKind =
  | "sofa"
  | "armchair"
  | "coffeeTable"
  | "chair"
  | "plant"
  | "floorLamp"
  | "painting"
  | "barrel"
  | "bookshelf";

export type ColliderProfile = {
  w: number;
  d: number;
  y?: number;
  h?: number;
};

export const BODY_PARTS: BodyPart[] = ["head", "torso", "armL", "armR", "legL", "legR"];

export type PaintBlob = {
  x: number;
  y: number;
  r: number;
  c: string;
  part: BodyPart;
  tx?: number;
  ty?: number;
};

export type BoxDef = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  shape?: "box" | "cylinder" | "sphere";
  prop?: PropKind;
  rotation?: number;
  modelUrl?: string;
  collider?: ColliderProfile;
  pattern?: Pattern;
  texture?: string;
  colors?: string[];
  collide?: boolean;
};

export type Collider = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  /** Optional oriented-rectangle data. Legacy colliders remain axis-aligned. */
  centerX?: number;
  centerZ?: number;
  halfW?: number;
  halfD?: number;
  rotation?: number;
};

export type DoorDef = {
  id: string;
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  along: "x" | "z";
  color: string;
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
  floorTexture?: string;
  boxes: BoxDef[];
  doors: DoorDef[];
  spawns: { x: number; z: number }[];
  hunterSpawns: { x: number; z: number }[];
};

export type SystemMessage = {
  id: string;
  kind: "host" | "join" | "leave" | "kick" | "info";
  text: string;
  at: number;
};

export type RoomState = {
  /** Room identity and lobby metadata (Phase 0 online-rooms plan §2.4). */
  channelId: string;
  roomName: string;
  maxPlayers: number;
  isPrivate: boolean;
  hostId: string;
  hostName: string;
  directoryToken: string;
  createdAt: number;
  /** Ids locked in by beginRound; anyone else is a spectator until the next lobby. */
  participantIds: string[];
  system: SystemMessage[];
  phase: Phase;
  mode: Mode;
  mapId: string;
  round: number;
  phaseEndsAt: number;
  hunterIds: string[];
  hunterMode: HunterMode;
  hunterPlayerId?: string;
  caughtIds: string[];
  scores: Record<string, number>;
  prepareTime: number;
  hideTime: number;
  huntTime: number;
  hunterCount: number;
  ammoEnabled: boolean;
  ammoCount: number;
  ammo: Record<string, number>;
  lastTag?: { id: string; by: string; name: string; byName: string; at: number };
  feed: { id: string; by: string; name: string; byName: string; at: number }[];
  taunts: { x: number; y: number; at: number; id: string }[];
  doors: Record<string, boolean>;
  chat: ChatMessage[];
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
  camoScore?: number;
  presenceAt?: number;
  role: Role;
  alive: boolean;
  shootSeq: number;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  at: number;
};

export const POSES: { id: Pose; label: string; hint: string }[] = [
  { id: "stand", label: "서기", hint: "기본" },
  { id: "crouch", label: "숙이기", hint: "낮은 가구" },
  { id: "sit", label: "앉기", hint: "소파·상자" },
  { id: "lie", label: "눕기", hint: "러그·바닥" },
  { id: "stretch", label: "늘이기", hint: "문틀·파이프" },
  { id: "ball", label: "공", hint: "원형 소품" },
  { id: "stick", label: "붙기", hint: "벽·가구 면" },
];
