import { MAX_PLAYERS, MIN_PLAYERS, ROOM_NAME_MAX } from "../config";
import { NICKNAME_MAX } from "../nickname";
import type { Mode, Phase } from "../types";
import { isValidRoomCode } from "./code";

/** What the directory knows about a room; written by its host, read by the room browser. */
export type RoomListing = {
  code: string;
  channelId: string;
  name: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  phase: Phase;
  mapId: string;
  mode: Mode;
  isPrivate: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ListingValidation = { ok: true; listing: RoomListing } | { ok: false; error: string };

const PHASES: Phase[] = ["lobby", "prepare", "hide", "hunt", "reveal", "result"];
const MODES: Mode[] = ["normal", "infection"];
const CHANNEL_ID_MAX = 16;
const MAP_ID_MAX = 32;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length <= max ? clean : null;
}

function integer(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

function timestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function validateListing(input: unknown): ListingValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "listing must be an object" };
  const raw = input as Record<string, unknown>;

  const code = typeof raw.code === "string" ? raw.code.toUpperCase() : "";
  if (!isValidRoomCode(code)) return { ok: false, error: "code is invalid" };
  const channelId = text(raw.channelId, CHANNEL_ID_MAX);
  if (!channelId) return { ok: false, error: "channelId is invalid" };
  const hostName = text(raw.hostName, NICKNAME_MAX);
  if (!hostName) return { ok: false, error: "hostName is invalid" };
  const rawName = text(raw.name, ROOM_NAME_MAX);
  if (rawName === null) return { ok: false, error: "name is invalid" };
  const name = rawName || `${hostName}의 방`;
  const maxPlayers = integer(raw.maxPlayers, MIN_PLAYERS, MAX_PLAYERS);
  if (maxPlayers === null) return { ok: false, error: "maxPlayers is invalid" };
  const players = integer(raw.players, 0, MAX_PLAYERS);
  if (players === null) return { ok: false, error: "players is invalid" };
  if (!PHASES.includes(raw.phase as Phase)) return { ok: false, error: "phase is invalid" };
  if (!MODES.includes(raw.mode as Mode)) return { ok: false, error: "mode is invalid" };
  const mapId = text(raw.mapId, MAP_ID_MAX);
  if (!mapId) return { ok: false, error: "mapId is invalid" };
  const createdAt = timestamp(raw.createdAt);
  if (createdAt === null) return { ok: false, error: "createdAt is invalid" };
  const updatedAt = timestamp(raw.updatedAt) ?? createdAt;

  return {
    ok: true,
    listing: {
      code,
      channelId,
      name,
      hostName,
      players,
      maxPlayers,
      phase: raw.phase as Phase,
      mapId,
      mode: raw.mode as Mode,
      isPrivate: Boolean(raw.isPrivate),
      createdAt,
      updatedAt,
    },
  };
}

export function isStale(listing: RoomListing, now: number, ttlMs: number): boolean {
  return now - listing.updatedAt > ttlMs;
}

export function hasOpenSlot(listing: RoomListing): boolean {
  return listing.players < listing.maxPlayers;
}

/** Lobbies first (joinable now), then fuller rooms, then the ones that have waited longest. */
export function sortListings(listings: readonly RoomListing[]): RoomListing[] {
  return [...listings].sort((a, b) => {
    const lobbyA = a.phase === "lobby" ? 0 : 1;
    const lobbyB = b.phase === "lobby" ? 0 : 1;
    if (lobbyA !== lobbyB) return lobbyA - lobbyB;
    if (a.players !== b.players) return b.players - a.players;
    return a.createdAt - b.createdAt;
  });
}
