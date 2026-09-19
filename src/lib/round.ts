import {
  AMMO_MAX,
  AMMO_MIN,
  CHAT_MESSAGE_MAX,
  CHAT_TEXT_MAX,
  DEFAULT_AMMO,
  DEFAULT_CHANNEL_ID,
  DEFAULT_FORCED_TAUNT_SEC,
  FORCED_TAUNT_MAX_SEC,
  FORCED_TAUNT_MIN_SEC,
  DEFAULT_HIDE,
  DEFAULT_HUNT,
  DEFAULT_PREPARE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_TIME,
  ROOM_NAME_MAX,
  SYSTEM_MESSAGE_MAX,
  SCORE_HUNT_WIN,
  SCORE_SURVIVE,
  SCORE_TAG,
} from "./config";
import { tagRangeForCamouflage } from "./camouflage";
import type { PlayerSnap, RoomState, SystemMessage } from "./types";

export function emptyRoom(): RoomState {
  return {
    channelId: DEFAULT_CHANNEL_ID,
    roomName: "",
    maxPlayers: MAX_PLAYERS,
    isPrivate: false,
    hostId: "",
    hostName: "",
    directoryToken: "",
    createdAt: 0,
    participantIds: [],
    system: [],
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
    revealTime: REVEAL_TIME,
    forcedTauntSec: DEFAULT_FORCED_TAUNT_SEC,
    hunterTps: true,
    listWhilePlaying: true,
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

export type RoomConfigPatch = Partial<
  Pick<
    RoomState,
    | "mapId"
    | "mode"
    | "hunterMode"
    | "hunterPlayerId"
    | "hunterCount"
    | "prepareTime"
    | "hideTime"
    | "huntTime"
    | "revealTime"
    | "forcedTauntSec"
    | "hunterTps"
    | "listWhilePlaying"
    | "ammoEnabled"
    | "ammoCount"
  >
>;

const PHASES: RoomState["phase"][] = ["lobby", "prepare", "hide", "hunt", "reveal", "result"];
const SYSTEM_KINDS: SystemMessage["kind"][] = ["host", "join", "leave", "kick", "info"];
const MODES: RoomState["mode"][] = ["normal", "infection"];
const HUNTER_MODES: RoomState["hunterMode"][] = ["random", "human", "ai"];

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function safeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeIds(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, max);
}

export function sanitizeRoom(input: RoomState): RoomState {
  const defaults = emptyRoom();
  const source = input || defaults;
  const phase = PHASES.includes(source.phase) ? source.phase : defaults.phase;
  const mode = MODES.includes(source.mode) ? source.mode : defaults.mode;
  const hunterMode = HUNTER_MODES.includes(source.hunterMode) ? source.hunterMode : defaults.hunterMode;
  const chat = Array.isArray(source.chat)
    ? source.chat
        .filter(
          (message) =>
            message &&
            typeof message.id === "string" &&
            typeof message.senderId === "string" &&
            typeof message.senderName === "string" &&
            typeof message.text === "string" &&
            Number.isFinite(message.at),
        )
        .map((message) => (message.text.length > CHAT_TEXT_MAX ? { ...message, text: message.text.slice(0, CHAT_TEXT_MAX) } : message))
        .slice(-CHAT_MESSAGE_MAX)
    : [];
  const system = Array.isArray(source.system)
    ? source.system
        .filter(
          (message): message is SystemMessage =>
            !!message &&
            typeof message.id === "string" &&
            SYSTEM_KINDS.includes(message.kind) &&
            typeof message.text === "string" &&
            Number.isFinite(message.at),
        )
        .slice(-SYSTEM_MESSAGE_MAX)
    : [];
  return {
    ...defaults,
    ...source,
    channelId: safeText(source.channelId, 16) || defaults.channelId,
    roomName: safeText(source.roomName, ROOM_NAME_MAX),
    maxPlayers: Math.floor(bounded(source.maxPlayers, defaults.maxPlayers, MIN_PLAYERS, MAX_PLAYERS)),
    isPrivate: Boolean(source.isPrivate),
    hostId: safeText(source.hostId, 80),
    hostName: safeText(source.hostName, 12),
    directoryToken: safeText(source.directoryToken, 64),
    createdAt: bounded(source.createdAt, defaults.createdAt, 0, Number.MAX_SAFE_INTEGER),
    participantIds: safeIds(source.participantIds, MAX_PLAYERS),
    system,
    phase,
    mode,
    hunterMode,
    mapId: typeof source.mapId === "string" && source.mapId.length > 0 ? source.mapId.slice(0, 32) : defaults.mapId,
    round: Math.floor(bounded(source.round, defaults.round, 0, 999999)),
    phaseEndsAt: bounded(source.phaseEndsAt, defaults.phaseEndsAt, 0, Number.MAX_SAFE_INTEGER),
    hunterIds: safeIds(source.hunterIds, 3),
    hunterPlayerId: typeof source.hunterPlayerId === "string" ? source.hunterPlayerId.slice(0, 80) : undefined,
    caughtIds: safeIds(source.caughtIds, 8),
    scores: source.scores && typeof source.scores === "object" ? source.scores : {},
    prepareTime: Math.floor(bounded(source.prepareTime, defaults.prepareTime, 3, 20)),
    hideTime: Math.floor(bounded(source.hideTime, defaults.hideTime, 30, 180)),
    huntTime: Math.floor(bounded(source.huntTime, defaults.huntTime, 60, 300)),
    revealTime: Math.floor(bounded(source.revealTime, defaults.revealTime, 10, 60)),
    forcedTauntSec: Math.floor(bounded(source.forcedTauntSec, defaults.forcedTauntSec, FORCED_TAUNT_MIN_SEC, FORCED_TAUNT_MAX_SEC)),
    hunterTps: source.hunterTps !== false,
    listWhilePlaying: source.listWhilePlaying !== false,
    hunterCount: Math.floor(bounded(source.hunterCount, defaults.hunterCount, 1, 3)),
    ammoEnabled: Boolean(source.ammoEnabled),
    ammoCount: Math.floor(bounded(source.ammoCount, defaults.ammoCount, AMMO_MIN, AMMO_MAX)),
    ammo: source.ammo && typeof source.ammo === "object" ? source.ammo : {},
    feed: Array.isArray(source.feed) ? source.feed.slice(-10) : [],
    taunts: Array.isArray(source.taunts) ? source.taunts.slice(-12) : [],
    doors: source.doors && typeof source.doors === "object" ? source.doors : {},
    chat,
    winner: source.winner === "hunters" || source.winner === "hiders" ? source.winner : undefined,
  };
}

export function patchRoom(prev: RoomState, patch: RoomConfigPatch) {
  if (prev.phase !== "lobby") return prev;
  return sanitizeRoom({ ...prev, ...patch });
}

/** Host writes its own id into the room so every client can show who is in charge. */
export function claimHost(room: RoomState, hostId: string, hostName: string, now: number): RoomState {
  if (room.hostId === hostId && room.hostName === hostName) return room;
  const takeover = room.hostId !== "" && room.hostId !== hostId;
  const system = takeover
    ? [
        ...room.system,
        {
          id: `sys-${now}-${hostId.slice(0, 8)}`,
          kind: "host" as const,
          text: `${hostName}님이 방장이 되었습니다`,
          at: now,
        },
      ].slice(-SYSTEM_MESSAGE_MAX)
    : room.system;
  return { ...room, hostId, hostName, system };
}

export function reconcileRoomPlayers(room: RoomState, players: PlayerSnap[]) {
  const active = new Set(players.map((player) => player.id));
  const hunterIds = room.hunterIds.filter((id) => active.has(id));
  const caughtIds = room.caughtIds.filter((id) => active.has(id));
  const ammo = Object.fromEntries(Object.entries(room.ammo ?? {}).filter(([id]) => active.has(id)));
  if (
    hunterIds.length === room.hunterIds.length &&
    caughtIds.length === room.caughtIds.length &&
    Object.keys(ammo).length === Object.keys(room.ammo ?? {}).length
  ) {
    return room;
  }
  return { ...room, hunterIds, caughtIds, ammo };
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

export function canStartRound(room: RoomState, players: PlayerSnap[]) {
  return room.phase === "lobby" && players.length >= 2 && players.every((player) => player.ready);
}

export function beginRound(
  prev: RoomState,
  playerIds: string[],
  now: number,
): RoomState {
  if (playerIds.length < 2) return prev;
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
    participantIds: ids,
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

/** In the lobby everyone is a participant-to-be; once a round starts only the locked-in ids play. */
export function isParticipant(room: RoomState, id: string) {
  if (room.phase === "lobby") return true;
  return room.participantIds.includes(id);
}

export function roleOf(room: RoomState, id: string): PlayerSnap["role"] {
  if (room.phase === "lobby") return "spectator";
  if (!isParticipant(room, id)) return "spectator";
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
  if (!isParticipant(room, id)) return false;
  if (isHunter(room, id)) return false;
  return !room.caughtIds.includes(id);
}

/** Ghosts drift through walls, are translucent and cannot be tagged: late joiners and caught hiders. */
export function isGhost(room: RoomState, id: string) {
  if (room.phase === "lobby") return false;
  if (!isParticipant(room, id)) return true;
  return room.phase === "hunt" && room.mode === "normal" && room.caughtIds.includes(id) && !isHunter(room, id);
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
  lineOfSight = true,
): { room: RoomState; tagged?: PlayerSnap; empty?: boolean } {
  if (room.phase !== "hunt") return { room };
  if (!isHunter(room, hunterId)) return { room };
  const left = room.ammo[hunterId] ?? 0;
  if (room.ammoEnabled && left <= 0) return { room, empty: true };

  let next: RoomState = { ...room };
  let tagged: PlayerSnap | undefined;
  const target = targetId ? players.find((p) => p.id === targetId) : undefined;

  if (targetId) {
    const hunter = players.find((p) => p.id === hunterId);
    const best = target;
    if (
      hunter &&
      best &&
      hiderAlive(next, best.id) &&
      lineOfSight &&
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

  if (room.ammoEnabled) {
    // Original rules: a hit restores a round, a miss costs one, and shooting at a
    // running hider is free either way (chasing must not be punished).
    const magazine = room.ammoCount || DEFAULT_AMMO;
    const delta = tagged ? 1 : target?.moving ? 0 : -1;
    next = { ...next, ammo: { ...next.ammo, [hunterId]: Math.max(0, Math.min(magazine, left + delta)) } };
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
    phaseEndsAt: now + (room.revealTime || REVEAL_TIME) * 1000,
    scores,
  };
}

export function tickRoom(room: RoomState, players: PlayerSnap[], now: number): RoomState {
  if ((room.phase === "prepare" || room.phase === "hide" || room.phase === "hunt") && !players.some((p) => isHunter(room, p.id))) {
    return finishRound(room, "hiders", players, now);
  }
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
  if (room.phase === "hunt" && !players.some((p) => hiderAlive(room, p.id))) {
    return finishRound(room, "hunters", players, now);
  }
  if (room.phase === "hunt" && !huntersHaveAmmo(room, players)) {
    const any = players.some((p) => hiderAlive(room, p.id));
    if (any) return finishRound(room, "hiders", players, now);
  }
  if (room.phase === "reveal" && now >= room.phaseEndsAt) {
    return { ...room, phase: "result", phaseEndsAt: now + 12000 };
  }
  if (room.phase === "result" && now >= room.phaseEndsAt) {
    return {
      ...room,
      phase: "lobby",
      winner: undefined,
      hunterIds: [],
      caughtIds: [],
      participantIds: [],
      ammo: {},
      doors: {},
      lastTag: undefined,
      feed: [],
      taunts: [],
    };
  }
  const taunts = room.taunts.filter((t) => now - t.at < 1600);
  if (taunts.length !== room.taunts.length) return { ...room, taunts };
  return room;
}

export function remaining(room: RoomState, now: number) {
  return Math.max(0, Math.ceil((room.phaseEndsAt - now) / 1000));
}
