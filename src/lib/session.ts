import {
  insertCoin,
  isHost,
  myPlayer,
  onPlayerJoin,
  RPC,
  setState,
  getState,
  getParticipants,
  getRoomCode,
  onDisconnect,
} from "playroomkit";
import {
  BOT_NAMES,
  DEFAULT_CHANNEL_ID,
  LEAVE_REASON_KEY,
  MAX_PLAYERS,
  RECONNECT_GRACE_MS,
  ROOM_NAME_MAX,
  SHOT_COOLDOWN,
  SYSTEM_MESSAGE_MAX,
  WHITE,
} from "./config";
import { uniqueNickname } from "./nickname";
import { closeRoom, generateDirectoryToken } from "./rooms/client";
import { emptyRoom, patchRoom, sanitizeRoom, type RoomConfigPatch } from "./round";
import type { PlayerState } from "playroomkit";
import type { ChatMessage, PaintBlob, PlayerSnap, Pose, Role, RoomState, SystemMessage } from "./types";

export type LeaveReason = "kicked" | "lost";
export type LeaveRecord = { reason: LeaveReason; code: string; at: number };

export function readLeaveRecord(): LeaveRecord | null {
  try {
    const raw = window.sessionStorage.getItem(LEAVE_REASON_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(LEAVE_REASON_KEY);
    const parsed = JSON.parse(raw) as Partial<LeaveRecord>;
    if ((parsed.reason !== "kicked" && parsed.reason !== "lost") || typeof parsed.code !== "string") return null;
    return { reason: parsed.reason, code: parsed.code, at: Number(parsed.at) || 0 };
  } catch {
    return null;
  }
}

function writeLeaveRecord(record: LeaveRecord) {
  try {
    window.sessionStorage.setItem(LEAVE_REASON_KEY, JSON.stringify(record));
  } catch {
    // Storage can be blocked; the home screen then shows no reason, which is acceptable.
  }
}

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
  callDoor: (id: string) => void;
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
        `${p.id}|${p.name}|${p.ready ? 1 : 0}|${p.pose}|${p.fill}|${p.camoScore ?? 0}|${p.presenceAt ?? 0}|${p.blobs.length}`,
    )
    .join(";");
}

const joined = new Map<string, { id: string; get: SessionPlayer["get"]; set: SessionPlayer["set"] }>();

/** Playroom's typings say Record<id, PlayerState>, but the runtime hands back an array; key by `.id` ourselves. */
function participantsById(): Map<string, PlayerState> {
  const map = new Map<string, PlayerState>();
  for (const player of Object.values(getParticipants())) map.set(player.id, player);
  return map;
}

function registerPlayer(player: {
  id: string;
  getState: (key: string) => unknown;
  setState: (key: string, value: unknown, reliable?: boolean) => void;
}) {
  joined.set(player.id, {
    id: player.id,
    get: (k) => player.getState(k),
    set: (k, v, rel) => player.setState(k, v, rel),
  });
}

export async function connectOnline(opts: {
  roomCode: string;
  nickname: string;
  /** Room capacity to request from Playroom; the creator's value is what the room enforces. */
  maxPlayers?: number;
  /** Present when this client is creating the room; also used as the fallback if we end up host of an empty room. */
  meta?: Partial<RoomMeta>;
}): Promise<Session> {
  joined.clear();
  const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, opts.maxPlayers ?? MAX_PLAYERS));
  await insertCoin({
    skipLobby: true,
    roomCode: opts.roomCode,
    maxPlayersPerRoom: maxPlayers,
    reconnectGracePeriod: RECONNECT_GRACE_MS,
    gameId: process.env.NEXT_PUBLIC_PLAYROOM_GAME_ID,
    defaultStates: { room: emptyRoom() },
    defaultPlayerStates: {
      ready: false,
      fill: WHITE,
      blobs: [],
      camoScore: 0,
      presenceAt: 0,
      pose: "stand",
      alive: true,
      role: "spectator",
      x: 4.2,
      y: 0,
      z: 3.4,
      yaw: 0,
    },
  });

  onPlayerJoin((player) => {
    registerPlayer(player);
    player.onQuit(() => joined.delete(player.id));
  });

  const me = myPlayer();
  registerPlayer(me);
  const others = () =>
    Object.values(getParticipants())
      .filter((p) => p.id !== me.id)
      .map((p) => ({ id: p.id, name: String(p.getState("name") ?? "") }))
      .filter((p) => p.name);
  me.setState("name", uniqueNickname(opts.nickname, others().map((p) => p.name)), true);
  // Remote player states can arrive a moment after insertCoin resolves. Re-check once;
  // on a simultaneous collision only the larger id renames so the two never ping-pong.
  window.setTimeout(() => {
    try {
      const current = String(me.getState("name") ?? opts.nickname);
      const clash = others().find((p) => p.name.trim().toLowerCase() === current.trim().toLowerCase());
      if (!clash || clash.id > me.id) return;
      me.setState("name", uniqueNickname(opts.nickname, others().map((p) => p.name)), true);
    } catch {
      // Participant snapshot can be unavailable during reconnect; the initial name stands.
    }
  }, 1500);
  me.setState("ready", false, true);
  me.setState("fill", WHITE, true);
  me.setState("blobs", [], true);
  me.setState("camoScore", 0, true);
  me.setState("presenceAt", Date.now(), false);
  me.setState("pose", "stand", true);
  me.setState("x", 4.2, true);
  me.setState("y", 0, true);
  me.setState("z", 3.4, true);
  me.setState("yaw", 0, true);

  // The host of a fresh room (creator, or first back after everyone left) seeds the room metadata.
  // Playroom clears state when a room empties, so a stale directory entry can lead a joiner here too.
  const current = (getState("room") as RoomState | undefined) ?? emptyRoom();
  if (isHost() && !current.directoryToken) {
    const nickname = String(me.getState("name") ?? opts.nickname);
    const roomName = (opts.meta?.roomName ?? "").trim().slice(0, ROOM_NAME_MAX) || `${nickname}의 방`;
    setState(
      "room",
      sanitizeRoom({
        ...emptyRoom(),
        ...current,
        roomName,
        maxPlayers,
        isPrivate: Boolean(opts.meta?.isPrivate),
        channelId: opts.meta?.channelId ?? DEFAULT_CHANNEL_ID,
        directoryToken: generateDirectoryToken(),
        createdAt: Date.now(),
      }),
      true,
    );
  }

  const shotListeners = new Set<(hunterId: string, targetId: string) => void>();
  const doorListeners = new Set<(id: string, actorId?: string) => void>();
  const lastShotSeq = new Map<string, number>();
  const lastShotAt = new Map<string, number>();
  const lastDoorAt = new Map<string, number>();
  const chatWindows = new Map<string, number[]>();
  RPC.register("shot", async (payload, sender) => {
    const targetId = String(payload?.targetId ?? "").slice(0, 80);
    const sequence = Number(payload?.sequence ?? 0);
    if (!Number.isSafeInteger(sequence) || sequence < 1) return;
    const previous = lastShotSeq.get(sender.id) ?? 0;
    if (isHost() && sequence <= previous) return;
    const now = Date.now();
    if (isHost() && now - (lastShotAt.get(sender.id) ?? 0) < SHOT_COOLDOWN - 80) return;
    lastShotSeq.set(sender.id, sequence);
    lastShotAt.set(sender.id, now);
    shotListeners.forEach((cb) => cb(sender.id, targetId));
  });
  RPC.register("door", async (payload, sender) => {
    const id = String(payload?.id ?? "").slice(0, 80);
    if (!id) return;
    const now = Date.now();
    if (isHost() && now - (lastDoorAt.get(sender.id) ?? 0) < 260) return;
    lastDoorAt.set(sender.id, now);
    doorListeners.forEach((cb) => cb(id, sender.id));
  });
  RPC.register("chat", async (payload, sender) => {
    if (!isHost()) return;
    const text = String(payload?.text ?? "").trim().slice(0, 120);
    if (!text) return;
    const now = Date.now();
    const recent = (chatWindows.get(sender.id) ?? []).filter((at) => now - at < 5000);
    if (recent.length >= 6) return;
    chatWindows.set(sender.id, [...recent, now]);
    const message: ChatMessage = {
      id: `chat-${now}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: sender.id,
      senderName: String(sender.getState("name") ?? "손님").trim().slice(0, 12) || "손님",
      text,
      at: now,
    };
    const room = sanitizeRoom((getState("room") as RoomState) || emptyRoom());
    setState("room", sanitizeRoom({ ...room, chat: [...(room.chat ?? []), message].slice(-60) }), true);
  });

  const roomCode = getRoomCode() ?? opts.roomCode;
  let leavingOnPurpose = false;

  // Playroom reports the final disconnect (after its own retries) with a reason string.
  onDisconnect((event) => {
    if (leavingOnPurpose) return;
    const reason = String((event as { reason?: unknown }).reason ?? "");
    if (reason === "PLAYER_LEAVED") return;
    writeLeaveRecord({ reason: reason === "PLAYER_KICKED" ? "kicked" : "lost", code: roomCode, at: Date.now() });
    window.location.assign(window.location.origin + "/");
  });

  const leaveKicked = () => {
    leavingOnPurpose = true;
    writeLeaveRecord({ reason: "kicked", code: roomCode, at: Date.now() });
    try {
      myPlayer().leaveRoom();
    } catch {
      /* ignore */
    }
    window.location.assign(window.location.origin + "/");
  };
  // Playroom's player.kick() only broadcasts; the kicked client itself has to act on it.
  RPC.register("kick", async (payload, sender) => {
    const targetId = String(payload?.targetId ?? "");
    const room = (getState("room") as RoomState | undefined) ?? emptyRoom();
    if (targetId !== myPlayer().id) return;
    if (sender.id !== room.hostId) return;
    leaveKicked();
  });

  const appendSystem = (message: SystemMessage) => {
    if (!isHost()) return;
    const room = sanitizeRoom((getState("room") as RoomState) || emptyRoom());
    setState("room", sanitizeRoom({ ...room, system: [...room.system, message].slice(-SYSTEM_MESSAGE_MAX) }), true);
  };

  return {
    kind: "online",
    roomCode,
    myId: () => myPlayer().id,
    isHost: () => isHost(),
    getRoom: () => (getState("room") as RoomState) || emptyRoom(),
    setRoom: (room) => {
      if (!isHost()) return;
      setState("room", sanitizeRoom(room), true);
    },
    patchRoom: (roomPatch) => {
      if (!isHost()) return;
      const room = sanitizeRoom((getState("room") as RoomState) || emptyRoom());
      setState("room", patchRoom(room, roomPatch), true);
    },
    players: () => {
      try {
        const participants = participantsById();
        for (const id of joined.keys()) {
          if (!participants.has(id)) joined.delete(id);
        }
        for (const player of participants.values()) {
          if (!joined.has(player.id)) registerPlayer(player);
        }
      } catch {
        // Playroom can briefly have no participant snapshot during reconnect.
      }
      return [...joined.values()];
    },
    me: () => {
      const p = myPlayer();
      return {
        id: p.id,
        get: (k) => p.getState(k),
        set: (k, v, rel) => p.setState(k, v, rel),
      };
    },
    callShot: (targetId, _hunterId, shotSeq) => {
      if (typeof shotSeq !== "number" || !Number.isSafeInteger(shotSeq) || shotSeq < 1) return;
      void RPC.call("shot", { targetId, sequence: shotSeq }, RPC.Mode.HOST);
    },
    onShot: (cb) => {
      shotListeners.add(cb);
      return () => shotListeners.delete(cb);
    },
    callDoor: (id) => {
      void RPC.call("door", { id }, RPC.Mode.HOST);
    },
    onDoor: (cb) => {
      doorListeners.add(cb);
      return () => doorListeners.delete(cb);
    },
    sendChat: (text) => {
      void RPC.call("chat", { text: text.slice(0, 120) }, RPC.Mode.HOST);
    },
    kick: (playerId) => {
      if (!isHost() || playerId === myPlayer().id) return;
      const target = participantsById().get(playerId);
      if (!target) return;
      const name = String(target.getState("name") ?? "손님").trim().slice(0, 12) || "손님";
      appendSystem({
        id: `sys-kick-${Date.now()}-${playerId.slice(0, 8)}`,
        kind: "kick",
        text: `${name}님이 강퇴되었습니다`,
        at: Date.now(),
      });
      void RPC.call("kick", { targetId: playerId }, RPC.Mode.ALL);
      void Promise.resolve(target.kick()).catch(() => {
        // Best effort only; the RPC above is what actually removes the player.
      });
    },
    leave: () => {
      leavingOnPurpose = true;
      const room = (getState("room") as RoomState | undefined) ?? emptyRoom();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        try {
          myPlayer().leaveRoom();
        } catch {
          /* ignore */
        }
        window.location.assign(window.location.origin + "/");
      };
      // The host closes the listing on the way out. If others remain, the next host's first
      // heartbeat (triggered by the host-name change) re-registers it within seconds.
      if (isHost() && room.directoryToken) {
        void closeRoom(roomCode, room.directoryToken).finally(finish);
        window.setTimeout(finish, 1500);
      } else {
        finish();
      }
    },
  };
}

function makeLocalPlayer(id: string, name: string, ox = 0, oz = 0): SessionPlayer {
  const store: Record<string, unknown> = {
    name,
    ready: true,
    x: 4.2 + ox,
    y: 0,
    z: 3.4 + oz,
    yaw: 0,
    pose: "stand",
    fill: WHITE,
    blobs: [],
    camoScore: 0,
    presenceAt: Date.now(),
    role: "hider",
    alive: true,
  };
  return {
    id,
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
    },
  };
}

export function createPractice(nickname: string): Session {
  const id = "local-me";
  const me = makeLocalPlayer(id, nickname);
  const bots = BOT_NAMES.map((n, i) => makeLocalPlayer(`bot-${i}`, `${n}·AI`, (i % 3) * 1.4, Math.floor(i / 3) * 1.6));
  const everyone = [me, ...bots];
  let room = emptyRoom();
  room.mode = "normal";
  room.hunterCount = 1;
  room.hunterMode = "ai";
  room.hunterPlayerId = id;
  const shotListeners = new Set<(hunterId: string, targetId: string) => void>();
  const doorListeners = new Set<(doorId: string, actorId?: string) => void>();
  const lastShotSeq = new Map<string, number>();
  const lastShotAt = new Map<string, number>();
  return {
    kind: "practice",
    roomCode: "",
    myId: () => id,
    isHost: () => true,
    getRoom: () => room,
    setRoom: (r) => {
      room = sanitizeRoom(r);
    },
    patchRoom: (roomPatch) => {
      room = patchRoom(room, roomPatch);
    },
    players: () => everyone,
    me: () => me,
    callShot: (targetId, hunterId, shotSeq) => {
      const now = Date.now();
      if (shotSeq !== undefined) {
        const sourceId = hunterId ?? id;
        const previous = lastShotSeq.get(sourceId) ?? 0;
        if (!Number.isSafeInteger(shotSeq) || shotSeq <= previous) return;
        if (now - (lastShotAt.get(sourceId) ?? 0) < SHOT_COOLDOWN - 80) return;
        lastShotSeq.set(sourceId, shotSeq);
        lastShotAt.set(sourceId, now);
      }
      shotListeners.forEach((cb) => cb(hunterId ?? id, targetId));
    },
    onShot: (cb) => {
      shotListeners.add(cb);
      return () => shotListeners.delete(cb);
    },
    callDoor: (doorId) => doorListeners.forEach((cb) => cb(doorId, id)),
    onDoor: (cb) => {
      doorListeners.add(cb);
      return () => doorListeners.delete(cb);
    },
    kick: () => {},
    sendChat: (text) => {
      const clean = text.trim().slice(0, 120);
      if (!clean) return;
      const message: ChatMessage = {
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: id,
        senderName: nickname,
        text: clean,
        at: Date.now(),
      };
      room = { ...room, chat: [...(room.chat ?? []), message].slice(-60) };
    },
    leave: () => {
      window.location.assign(window.location.origin + "/");
    },
  };
}
