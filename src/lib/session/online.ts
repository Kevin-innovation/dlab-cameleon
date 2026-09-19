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
import type { PlayerState } from "playroomkit";
import {
  CHAT_MESSAGE_MAX,
  CHAT_TEXT_MAX,
  DEFAULT_CHANNEL_ID,
  MAX_PLAYERS,
  RECONNECT_GRACE_MS,
  ROOM_NAME_MAX,
  SHOT_COOLDOWN,
  SYSTEM_MESSAGE_MAX,
  WHITE,
} from "../config";
import { uniqueNickname } from "../nickname";
import { closeRoom, generateDirectoryToken } from "../rooms/client";
import { emptyRoom, patchRoom, sanitizeRoom } from "../round";
import type { ChatMessage, RoomState, SystemMessage } from "../types";
import { writeLeaveRecord } from "./leave";
import type { RoomMeta, Session, SessionPlayer } from "./types";

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
    const text = String(payload?.text ?? "").trim().slice(0, CHAT_TEXT_MAX);
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
    setState("room", sanitizeRoom({ ...room, chat: [...(room.chat ?? []), message].slice(-CHAT_MESSAGE_MAX) }), true);
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
      void RPC.call("chat", { text: text.slice(0, CHAT_TEXT_MAX) }, RPC.Mode.HOST);
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
