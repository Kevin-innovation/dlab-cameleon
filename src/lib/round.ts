import {
  DEFAULT_AMMO,
  DEFAULT_HIDE,
  DEFAULT_HUNT,
  DEFAULT_PREPARE,
  REVEAL_TIME,
  SCORE_HUNT_WIN,
  SCORE_SURVIVE,
  SCORE_TAG,
} from "./config";
import { tagRangeForCamouflage } from "./camouflage";
import type { PlayerSnap, RoomState } from "./types";

export function emptyRoom(): RoomState {
  return {
    phase: "lobby",
    mode: "normal",
    mapId: "mansion",
    round: 0,
    phaseEndsAt: 0,
    hunterIds: [],
    hunterMode: "random",
    caughtIds: [],
    scores: {},
    prepareTime: DEFAULT_PREPARE,
    hideTime: DEFAULT_HIDE,
    huntTime: DEFAULT_HUNT,
    hunterCount: 1,
    ammoEnabled: false,
    ammoCount: DEFAULT_AMMO,
    ammo: {},
    feed: [],
    taunts: [],
    doors: {},
    chat: [],
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
  let hunterIds = ids.slice(0, hc);
  const fixedHunter = prev.hunterPlayerId && playerIds.includes(prev.hunterPlayerId) ? prev.hunterPlayerId : undefined;
  if (fixedHunter && prev.hunterMode === "human") {
    hunterIds = [fixedHunter, ...ids.filter((id) => id !== fixedHunter)].slice(0, hc);
  } else if (fixedHunter && prev.hunterMode === "ai") {
    hunterIds = ids.filter((id) => id !== fixedHunter).slice(0, hc);
    if (hunterIds.length < hc) hunterIds.push(fixedHunter);
  }
  const scores = { ...prev.scores };
  for (const id of ids) scores[id] ??= 0;
  const mag = prev.ammoCount || DEFAULT_AMMO;
  const ammo: Record<string, number> = {};
  if (prev.ammoEnabled) {
    for (const id of hunterIds) ammo[id] = mag;
  }
  return {
    ...prev,
    phase: "prepare",
    round: prev.round + 1,
    phaseEndsAt: now + (prev.prepareTime || DEFAULT_PREPARE) * 1000,
    hunterIds,
    caughtIds: [],
    winner: undefined,
    lastTag: undefined,
    feed: [],
    taunts: [],
    doors: {},
    scores,
    ammoCount: prev.ammoEnabled ? mag : prev.ammoCount || DEFAULT_AMMO,
    ammo,
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

export function huntersHaveAmmo(room: RoomState, players: PlayerSnap[]) {
  if (!room.ammoEnabled) return true;
  return players.some((p) => isHunter(room, p.id) && (room.ammo[p.id] ?? 0) > 0);
}

export function processFire(
  room: RoomState,
  players: PlayerSnap[],
  hunterId: string,
  targetId: string,
  now: number,
): { room: RoomState; tagged?: PlayerSnap; empty?: boolean } {
  if (room.phase !== "hunt") return { room };
  if (!isHunter(room, hunterId)) return { room };
  const left = room.ammo[hunterId] ?? 0;
  if (room.ammoEnabled && left <= 0) return { room, empty: true };

  const ammo = room.ammoEnabled ? { ...room.ammo, [hunterId]: left - 1 } : room.ammo;
  let next: RoomState = { ...room, ammo };
  let tagged: PlayerSnap | undefined;

  if (targetId) {
    const hunter = players.find((p) => p.id === hunterId);
    const best = players.find((p) => p.id === targetId);
    if (
      hunter &&
      best &&
      hiderAlive(next, best.id) &&
      Math.hypot(best.x - hunter.x, best.z - hunter.z) <= tagRangeForCamouflage(best.camoScore)
    ) {
      const caughtIds = next.caughtIds.includes(best.id)
        ? next.caughtIds
        : [...next.caughtIds, best.id];
      const scores = { ...next.scores };
      scores[hunterId] = (scores[hunterId] ?? 0) + SCORE_TAG;
      tagged = best;
      const entry = {
        id: best.id,
        by: hunterId,
        name: best.name,
        byName: hunter.name,
        at: now,
      };
      next = {
        ...next,
        caughtIds,
        scores,
        lastTag: entry,
        feed: [...(next.feed ?? []), entry].slice(-10),
      };
      if (next.mode === "infection" && next.ammoEnabled) {
        next.ammo = { ...next.ammo, [best.id]: next.ammoCount || DEFAULT_AMMO };
      }
    }
  }

  const hidersLeft = players.filter((p) => hiderAlive(next, p.id)).length;
  if (hidersLeft === 0) {
    next = finishRound(next, "hunters", players, now);
  } else if (!huntersHaveAmmo(next, players)) {
    next = finishRound(next, "hiders", players, now);
  }
  return { room: next, tagged };
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
      if (hiderAlive(room, p.id)) scores[p.id] = (scores[p.id] ?? 0) + SCORE_SURVIVE;
    }
  } else {
    for (const id of room.hunterIds) scores[id] = (scores[id] ?? 0) + SCORE_HUNT_WIN;
  }
  return {
    ...room,
    phase: "reveal",
    winner,
    phaseEndsAt: now + REVEAL_TIME * 1000,
    scores,
  };
}

export function tickRoom(room: RoomState, players: PlayerSnap[], now: number): RoomState {
  if (room.phase === "prepare" && now >= room.phaseEndsAt) {
    return { ...room, phase: "hide", phaseEndsAt: now + room.hideTime * 1000 };
  }
  if (room.phase === "hide" && now >= room.phaseEndsAt) {
    return { ...room, phase: "hunt", phaseEndsAt: now + room.huntTime * 1000 };
  }
  if (room.phase === "hunt" && now >= room.phaseEndsAt) {
    const any = players.some((p) => hiderAlive(room, p.id));
    return finishRound(room, any ? "hiders" : "hunters", players, now);
  }
  if (room.phase === "hunt" && !huntersHaveAmmo(room, players)) {
    const any = players.some((p) => hiderAlive(room, p.id));
    if (any) return finishRound(room, "hiders", players, now);
  }
  if (room.phase === "reveal" && now >= room.phaseEndsAt) {
    return { ...room, phase: "result", phaseEndsAt: now + 12000 };
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
