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
  callShot: (x: number, y: number) => void;
  onShot: (cb: (hunterId: string, x: number, y: number) => void) => () => void;
  leave: () => void;
};

function readSnap(p: SessionPlayer): PlayerSnap {
  return {
    id: p.id,
    name: String(p.get("name") ?? "손님"),
    ready: Boolean(p.get("ready")),
    x: Number(p.get("x") ?? 400),
    y: Number(p.get("y") ?? 400),
    dir: Number(p.get("dir") ?? 0),
    pose: (p.get("pose") as Pose) || "stand",
    fill: String(p.get("fill") ?? WHITE),
    blobs: (p.get("blobs") as PaintBlob[]) || [],
    role: (p.get("role") as Role) || "spectator",
    alive: p.get("alive") !== false,
    vx: Number(p.get("vx") ?? 0),
    vy: Number(p.get("vy") ?? 0),
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

  if (isHost() && !getState("room")) {
    setState("room", emptyRoom(), true);
  }

  const shotListeners = new Set<(hunterId: string, x: number, y: number) => void>();
  RPC.register("shot", async (payload, sender) => {
    const x = Number(payload?.x);
    const y = Number(payload?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    shotListeners.forEach((cb) => cb(sender.id, x, y));
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
    callShot: (x, y) => {
      void RPC.call("shot", { x, y }, RPC.Mode.HOST);
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
    x: 420,
    y: 520,
    dir: 0,
    pose: "stand",
    fill: WHITE,
    blobs: [],
    role: "hider",
    alive: true,
    vx: 0,
    vy: 0,
  };
  let room = emptyRoom();
  const me: SessionPlayer = {
    id,
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
    },
  };
  const shotListeners = new Set<(hunterId: string, x: number, y: number) => void>();
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
    callShot: (x, y) => shotListeners.forEach((cb) => cb(id, x, y)),
    onShot: (cb) => {
      shotListeners.add(cb);
      return () => shotListeners.delete(cb);
    },
    leave: () => {
      window.location.assign(window.location.origin + "/");
    },
  };
}
