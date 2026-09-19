import { WHITE } from "../config";
import type { RoomConfigPatch } from "../round";
import type { PaintBlob, PlayerSnap, Pose, Role, RoomState } from "../types";

export type SessionPlayer = {
  id: string;
  get: (key: string) => unknown;
  set: (key: string, value: unknown, reliable?: boolean) => void;
};

export type RoomMeta = {
  roomName: string;
  maxPlayers: number;
  isPrivate: boolean;
  channelId: string;
};

export type Session = {
  kind: "online" | "practice";
  /** Playroom room code; empty for practice. */
  roomCode: string;
  myId: () => string;
  isHost: () => boolean;
  getRoom: () => RoomState;
  setRoom: (room: RoomState) => void;
  patchRoom: (patch: RoomConfigPatch) => void;
  players: () => SessionPlayer[];
  me: () => SessionPlayer;
  callShot: (targetId: string, hunterId?: string, shotSeq?: number) => void;
  onShot: (cb: (hunterId: string, targetId: string) => void) => () => void;
  /** Toggle a door; `actorId` lets the practice host act for its bots (ignored online, the sender is the actor). */
  callDoor: (id: string, actorId?: string) => void;
  onDoor: (cb: (id: string, actorId?: string) => void) => () => void;
  sendChat: (text: string) => void;
  /** Host only. Removes the player from the room; they land on the home screen with a notice. */
  kick: (playerId: string) => void;
  leave: () => void;
};

function readSnap(p: SessionPlayer): PlayerSnap {
  return {
    id: p.id,
    name: String(p.get("name") ?? "손님"),
    ready: Boolean(p.get("ready")),
    x: Number(p.get("x") ?? 4),
    y: Number(p.get("y") ?? 0),
    z: Number(p.get("z") ?? 4),
    yaw: Number(p.get("yaw") ?? 0),
    pose: (p.get("pose") as Pose) || "stand",
    fill: String(p.get("fill") ?? WHITE),
    blobs: (p.get("blobs") as PaintBlob[]) || [],
    camoScore: Number(p.get("camoScore") ?? 0),
    presenceAt: Number(p.get("presenceAt") ?? 0),
    role: (p.get("role") as Role) || "spectator",
    alive: p.get("alive") !== false,
    shootSeq: Number(p.get("shootSeq") ?? 0),
    moving: Boolean(p.get("moving")),
    roughness: typeof p.get("roughness") === "number" ? (p.get("roughness") as number) : 0.7,
    bodySize: (["petit", "normal", "plump"] as const).includes(p.get("bodySize") as never) ? (p.get("bodySize") as PlayerSnap["bodySize"]) : "normal",
  };
}

export function snapsFrom(session: Session): PlayerSnap[] {
  return session.players().map(readSnap);
}

/** Cheap fingerprint of the fields the HUD renders; positions and paint strokes are excluded. */
export function hudSignature(snaps: PlayerSnap[]): string {
  return snaps
    .map(
      (p) =>
        `${p.id}|${p.name}|${p.ready ? 1 : 0}|${p.pose}|${p.fill}|${p.camoScore ?? 0}|${p.presenceAt ?? 0}|${p.blobs.length}|${p.bodySize ?? "normal"}`,
    )
    .join(";");
}
