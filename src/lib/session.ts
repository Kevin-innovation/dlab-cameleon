import {
  insertCoin,
  isHost,
  myPlayer,
  onPlayerJoin,
  RPC,
  setState,
  getState,
  getParticipants,
} from "playroomkit";
import { BOT_NAMES, MAX_PLAYERS, WHITE } from "./config";
import { emptyRoom, patchRoom, sanitizeRoom, type RoomConfigPatch } from "./round";
import type { ChatMessage, PaintBlob, PlayerSnap, Pose, Role, RoomState } from "./types";

export type SessionPlayer = {
  id: string;
  get: (key: string) => unknown;
  set: (key: string, value: unknown, reliable?: boolean) => void;
};

export type Session = {
  kind: "online" | "practice";
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
  onDoor: (cb: (id: string) => void) => () => void;
  sendChat: (text: string) => void;
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

const joined = new Map<string, { id: string; get: SessionPlayer["get"]; set: SessionPlayer["set"] }>();

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
}): Promise<Session> {
  joined.clear();
  await insertCoin({
    skipLobby: true,
    roomCode: opts.roomCode,
    maxPlayersPerRoom: MAX_PLAYERS,
    reconnectGracePeriod: 4000,
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
  me.setState("name", opts.nickname, true);
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

  if (isHost() && !getState("room")) {
    setState("room", emptyRoom(), true);
  }

  const shotListeners = new Set<(hunterId: string, targetId: string) => void>();
  const doorListeners = new Set<(id: string) => void>();
  const lastShotSeq = new Map<string, number>();
  RPC.register("shot", async (payload, sender) => {
    const targetId = String(payload?.targetId ?? "");
    const sequence = Number(payload?.sequence ?? 0);
    if (!Number.isSafeInteger(sequence) || sequence < 1) return;
    const previous = lastShotSeq.get(sender.id) ?? 0;
    if (isHost() && sequence <= previous) return;
    lastShotSeq.set(sender.id, sequence);
    shotListeners.forEach((cb) => cb(sender.id, targetId));
  });
  RPC.register("door", async (payload) => {
    const id = String(payload?.id ?? "");
    if (!id) return;
    doorListeners.forEach((cb) => cb(id));
  });
  RPC.register("chat", async (payload, sender) => {
    if (!isHost()) return;
    const text = String(payload?.text ?? "").trim().slice(0, 120);
    if (!text) return;
    const message: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: sender.id,
      senderName: String(sender.getState("name") ?? "손님").trim().slice(0, 12) || "손님",
      text,
      at: Date.now(),
    };
    const room = sanitizeRoom((getState("room") as RoomState) || emptyRoom());
    setState("room", sanitizeRoom({ ...room, chat: [...(room.chat ?? []), message].slice(-60) }), true);
  });

  return {
    kind: "online",
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
        const participants = getParticipants();
        const activeIds = new Set(Object.keys(participants));
        for (const id of joined.keys()) {
          if (!activeIds.has(id)) joined.delete(id);
        }
        for (const player of Object.values(participants)) registerPlayer(player);
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
    leave: () => {
      try {
        myPlayer().leaveRoom();
      } catch {
        /* ignore */
      }
      window.location.assign(window.location.origin + "/");
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
  const doorListeners = new Set<(doorId: string) => void>();
  const lastShotSeq = new Map<string, number>();
  return {
    kind: "practice",
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
      if (shotSeq !== undefined) {
        const sourceId = hunterId ?? id;
        const previous = lastShotSeq.get(sourceId) ?? 0;
        if (!Number.isSafeInteger(shotSeq) || shotSeq <= previous) return;
        lastShotSeq.set(sourceId, shotSeq);
      }
      shotListeners.forEach((cb) => cb(hunterId ?? id, targetId));
    },
    onShot: (cb) => {
      shotListeners.add(cb);
      return () => shotListeners.delete(cb);
    },
    callDoor: (doorId) => doorListeners.forEach((cb) => cb(doorId)),
    onDoor: (cb) => {
      doorListeners.add(cb);
      return () => doorListeners.delete(cb);
    },
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
