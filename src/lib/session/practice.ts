import { BOT_NAMES, CHAT_MESSAGE_MAX, CHAT_TEXT_MAX, SHOT_COOLDOWN, WHITE } from "../config";
import { emptyRoom, patchRoom, sanitizeRoom } from "../round";
import type { ChatMessage } from "../types";
import type { Session, SessionPlayer } from "./types";

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
    callDoor: (doorId, actorId) => doorListeners.forEach((cb) => cb(doorId, actorId ?? id)),
    onDoor: (cb) => {
      doorListeners.add(cb);
      return () => doorListeners.delete(cb);
    },
    kick: () => {},
    sendChat: (text) => {
      const clean = text.trim().slice(0, CHAT_TEXT_MAX);
      if (!clean) return;
      const message: ChatMessage = {
        id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: id,
        senderName: nickname,
        text: clean,
        at: Date.now(),
      };
      room = { ...room, chat: [...(room.chat ?? []), message].slice(-CHAT_MESSAGE_MAX) };
    },
    leave: () => {
      window.location.assign(window.location.origin + "/");
    },
  };
}
