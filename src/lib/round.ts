import { DEFAULT_HIDE, DEFAULT_HUNT, TAG_RANGE } from "./config";
import type { PlayerSnap, RoomState } from "./types";

export function emptyRoom(): RoomState {
  return {
    phase: "lobby",
    mode: "normal",
    mapId: "mansion",
    round: 0,
    phaseEndsAt: 0,
    hunterIds: [],
    caughtIds: [],
    scores: {},
    hideTime: DEFAULT_HIDE,
    huntTime: DEFAULT_HUNT,
    hunterCount: 1,
    taunts: [],
  };
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function hunterCountFor(n: number, requested: number) {
  if (n <= 1) return 0;
  return Math.max(1, Math.min(requested, Math.max(1, Math.floor(n / 4)), n - 1));
}

export function beginRound(
  prev: RoomState,
  playerIds: string[],
  now: number,
): RoomState {
  const ids = shuffle(playerIds);
  const hc = hunterCountFor(ids.length, prev.hunterCount || 1);
  const hunterIds = ids.slice(0, hc);
  const scores = { ...prev.scores };
  for (const id of ids) scores[id] ??= 0;
  return {
    ...prev,
    phase: "hide",
    round: prev.round + 1,
    phaseEndsAt: now + prev.hideTime * 1000,
    hunterIds,
    caughtIds: [],
    winner: undefined,
    lastTag: undefined,
    taunts: [],
    scores,
  };
}

export function roleOf(room: RoomState, id: string): PlayerSnap["role"] {
  if (room.phase === "lobby") return "spectator";
  if (room.hunterIds.includes(id)) return "hunter";
  if (room.caughtIds.includes(id) && room.mode === "normal") return "spectator";
  if (room.caughtIds.includes(id) && room.mode === "infection") return "hunter";
  return "hider";
}

export function isHunter(room: RoomState, id: string) {
  if (room.hunterIds.includes(id)) return true;
  return room.mode === "infection" && room.caughtIds.includes(id);
}

export function hiderAlive(room: RoomState, id: string) {
  if (isHunter(room, id)) return false;
  return !room.caughtIds.includes(id);
}

export function processShot(
  room: RoomState,
  players: PlayerSnap[],
  hunterId: string,
  targetId: string,
  now: number,
): { room: RoomState; tagged?: PlayerSnap } {
  if (room.phase !== "hunt") return { room };
  if (!isHunter(room, hunterId)) return { room };
  const hunter = players.find((p) => p.id === hunterId);
  const best = players.find((p) => p.id === targetId);
  if (!hunter || !best) return { room };
  if (!hiderAlive(room, best.id)) return { room };
  if (Math.hypot(best.x - hunter.x, best.z - hunter.z) > TAG_RANGE) return { room };

  const caughtIds = room.caughtIds.includes(best.id)
    ? room.caughtIds
    : [...room.caughtIds, best.id];
  const scores = { ...room.scores };
  scores[hunterId] = (scores[hunterId] ?? 0) + 80;
  let next: RoomState = {
    ...room,
    caughtIds,
    scores,
    lastTag: { id: best.id, by: hunterId, name: best.name, at: now },
  };

  const hidersLeft = players.filter((p) => hiderAlive(next, p.id)).length;
  if (hidersLeft === 0) {
    next = finishRound(next, "hunters", players, now);
  }
  return { room: next, tagged: best };
}

export function finishRound(
  room: RoomState,
  winner: "hunters" | "hiders",
  players: PlayerSnap[],
  now: number,
): RoomState {
  const scores = { ...room.scores };
  if (winner === "hiders") {
    for (const p of players) {
      if (hiderAlive(room, p.id)) scores[p.id] = (scores[p.id] ?? 0) + 150;
    }
  } else {
    for (const id of room.hunterIds) scores[id] = (scores[id] ?? 0) + 40;
  }
  return {
    ...room,
    phase: "result",
    winner,
    phaseEndsAt: now + 12000,
    scores,
  };
}

export function tickRoom(room: RoomState, players: PlayerSnap[], now: number): RoomState {
  if (room.phase === "hide" && now >= room.phaseEndsAt) {
    return { ...room, phase: "hunt", phaseEndsAt: now + room.huntTime * 1000 };
  }
  if (room.phase === "hunt" && now >= room.phaseEndsAt) {
    const any = players.some((p) => hiderAlive(room, p.id));
    return finishRound(room, any ? "hiders" : "hunters", players, now);
  }
  if (room.phase === "result" && now >= room.phaseEndsAt) {
    return { ...room, phase: "lobby", winner: undefined, hunterIds: [], caughtIds: [] };
  }
  const taunts = room.taunts.filter((t) => now - t.at < 1600);
  if (taunts.length !== room.taunts.length) return { ...room, taunts };
  return room;
}

export function remaining(room: RoomState, now: number) {
  return Math.max(0, Math.ceil((room.phaseEndsAt - now) / 1000));
}
