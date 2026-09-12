import {
  insertCoin,
  isHost,
  myPlayer,
  onPlayerJoin,
  RPC,
  setState,
  getState,
} from "playroomkit";
import { MAX_PLAYERS, WHITE } from "./config";
import { emptyRoom } from "./round";
import type { PaintBlob, PlayerSnap, Pose, Role, RoomState } from "./types";

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
  players: () => SessionPlayer[];
  me: () => SessionPlayer;
  callShot: (targetId: string) => void;
  onShot: (cb: (hunterId: string, targetId: string) => void) => () => void;
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
    role: (p.get("role") as Role) || "spectator",
    alive: p.get("alive") !== false,
    shootSeq: Number(p.get("shootSeq") ?? 0),
  };
}

export function snapsFrom(session: Session): PlayerSnap[] {
  return session.players().map(readSnap);
}

const joined = new Map<string, { id: string; get: SessionPlayer["get"]; set: SessionPlayer["set"] }>();

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
    joined.set(player.id, {
      id: player.id,
      get: (k) => player.getState(k),
      set: (k, v, rel) => player.setState(k, v, rel),
    });
    player.onQuit(() => joined.delete(player.id));
  });

  const me = myPlayer();
  joined.set(me.id, {
    id: me.id,
    get: (k) => me.getState(k),
    set: (k, v, rel) => me.setState(k, v, rel),
  });
  me.setState("name", opts.nickname, true);
  me.setState("ready", false, true);
  me.setState("fill", WHITE, true);
  me.setState("blobs", [], true);
  me.setState("pose", "stand", true);
  me.setState("x", 4.2, true);
  me.setState("y", 0, true);
  me.setState("z", 3.4, true);
  me.setState("yaw", 0, true);

  if (isHost() && !getState("room")) {
    setState("room", emptyRoom(), true);
  }

  const shotListeners = new Set<(hunterId: string, targetId: string) => void>();
  RPC.register("shot", async (payload, sender) => {
    const targetId = String(payload?.targetId ?? "");
    if (!targetId) return;
    shotListeners.forEach((cb) => cb(sender.id, targetId));
  });

  return {
    kind: "online",
    myId: () => myPlayer().id,
    isHost: () => isHost(),
    getRoom: () => (getState("room") as RoomState) || emptyRoom(),
    setRoom: (room) => setState("room", room, true),
    players: () => [...joined.values()],
    me: () => {
      const p = myPlayer();
      return {
        id: p.id,
        get: (k) => p.getState(k),
        set: (k, v, rel) => p.setState(k, v, rel),
      };
    },
    callShot: (targetId) => {
      void RPC.call("shot", { targetId }, RPC.Mode.HOST);
    },
    onShot: (cb) => {
      shotListeners.add(cb);
      return () => shotListeners.delete(cb);
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

export function createPractice(nickname: string): Session {
  const id = "local-me";
  const store: Record<string, unknown> = {
    name: nickname,
    ready: true,
    x: 4.2,
    y: 0,
    z: 3.4,
    yaw: 0,
    pose: "stand",
    fill: WHITE,
    blobs: [],
    role: "hider",
    alive: true,
  };
  let room = emptyRoom();
  const me: SessionPlayer = {
    id,
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
    },
  };
  const shotListeners = new Set<(hunterId: string, targetId: string) => void>();
  return {
    kind: "practice",
    myId: () => id,
    isHost: () => true,
    getRoom: () => room,
    setRoom: (r) => {
      room = r;
    },
    players: () => [me],
    me: () => me,
    callShot: (targetId) => shotListeners.forEach((cb) => cb(id, targetId)),
    onShot: (cb) => {
      shotListeners.add(cb);
      return () => shotListeners.delete(cb);
    },
    leave: () => {
      window.location.assign(window.location.origin + "/");
    },
  };
}
