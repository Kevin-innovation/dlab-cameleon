export type Pose = "stand" | "crouch" | "sit" | "lie" | "stretch" | "ball" | "stick" | "lean" | "huddle" | "spread" | "upside";

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

/** What a generated box is for; drives rendering (glass, emissive ceilings) and audits. */
export type BoxRole = "wall" | "ceiling" | "fixture" | "glass" | "decal" | "trim";

export type BoxDef = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  role?: BoxRole;
  /** Emissive colour for fixtures and ceilings so they read even without direct light. */
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
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

export type MapKind = "indoor" | "outdoor" | "mixed";
export type LightingPreset = "day" | "fluorescent" | "dim" | "dusk";
export type CeilingStyle = "plaster" | "tiles" | "concrete" | "beams";
export type WallSide = "n" | "s" | "e" | "w";

/** An opening cut into one side of a room. `at` is the centre offset along that side from its min corner. */
export type Opening =
  | { kind: "door"; side: WallSide; at: number; width: number; leaf?: boolean }
  | { kind: "arch"; side: WallSide; at: number; width: number }
  | { kind: "window"; side: WallSide; at: number; width: number; sill: number; height: number }
  | { kind: "gap"; side: WallSide; at: number; width: number };

export type Fixture = { x: number; z: number; kind: "fluorescent" | "pendant" | "spot"; on?: boolean };

export type RoomDef = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  wall?: { thickness?: number; color?: string; pattern?: Pattern; colors?: string[]; height?: number };
  openings?: Opening[];
  ceiling?: { style?: CeilingStyle; color?: string; height?: number; open?: boolean; fixtures?: Fixture[] };
  /** 0 (dark) .. 1 (bright); feeds hunter visibility and AI hide preference. */
  light?: number;
};

export type SkyDef = {
  top: string;
  horizon: string;
  sun: { azimuth: number; elevation: number; color: string; intensity: number };
};

export type GameMap = {
  id: string;
  name: string;
  blurb: string;
  difficulty: "쉬움" | "보통" | "어려움";
  kind?: MapKind;
  lighting?: LightingPreset;
  sky?: SkyDef;
  ceilingStyle?: CeilingStyle;
  ceilingColor?: string;
  rooms?: RoomDef[];
  /** Where players gather for the role roulette; defaults to the first hunter spawn. */
  gather?: { x: number; z: number };
  /** Point lights emitted by room fixtures (desktop only; mobile keeps the emissive fixture meshes). */
  lights?: { x: number; y: number; z: number; color: string; intensity: number; distance: number }[];
  w: number;
  d: number;
  ceiling: number;
  fog: string;
  floor: string;
  floorTexture?: string;
  /** Procedural floor pattern when no texture image is set (default: wood). */
  floorPattern?: Pattern;
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
  /** Missed Spot points this round (live, host-flushed every few seconds). */
  missed: Record<string, number>;
  /** Snapshot of `missed` refreshed every 30s: what hunters are allowed to see. */
  missedShown: Record<string, number>;
  prepareTime: number;
  hideTime: number;
  huntTime: number;
  /** Seconds every hider stays revealed after the hunt; a room option since the lobby grid shows it. */
  revealTime: number;
  /** Seconds between automatic whistles for a silent hider (host option, original default 45). */
  forcedTauntSec: number;
  /** Host allows hunters to switch to the over-the-shoulder camera. */
  hunterTps: boolean;
  /** Keep the room in the public list while a round is running (else it hides until the lobby). */
  listWhilePlaying: boolean;
  /** Host allows petit/plump bodies (original: Petit only if the host allows). */
  allowBodySizes: boolean;
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
  /** True while the body has moved in the last ~0.4s; running targets are free to shoot at. */
  moving?: boolean;
  /** Surface finish 0 (glossy) .. 1 (matte); matched against the sampled surface. */
  roughness?: number;
  bodySize?: BodySize;
};

export type BodySize = "petit" | "normal" | "plump";
/** Visual/physics scale per body size: xz = footprint, y = height. */
export const BODY_SCALE: Record<BodySize, { xz: number; y: number }> = {
  petit: { xz: 0.5, y: 0.5 },
  normal: { xz: 1, y: 1 },
  plump: { xz: 1.3, y: 1 },
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
  { id: "lean", label: "기대기", hint: "기둥·벽 모서리" },
  { id: "huddle", label: "웅크리기", hint: "상자·의자 밑" },
  { id: "spread", label: "팔 벌리기", hint: "넓은 벽면·액자" },
  { id: "upside", label: "거꾸로", hint: "천장·선반 밑" },
];
