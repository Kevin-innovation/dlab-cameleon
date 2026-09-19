"use client";

import { useEffect, useRef } from "react";
import { DIRECTORY_HEARTBEAT_MS } from "@/lib/config";
import { sendHeartbeat } from "@/lib/rooms/client";
import type { RoomListing } from "@/lib/rooms/listing";
import type { Session } from "@/lib/session";
import type { RoomState } from "@/lib/types";

/** Server rejects heartbeats closer than 2s; keep a margin so a change-triggered send is never wasted. */
const MIN_GAP_MS = 2500;

export function buildListing(session: Session, room: RoomState, playerCount: number): RoomListing | null {
  // hostName is written by the host's first tick; a listing without it would be rejected (400).
  if (session.kind !== "online" || !session.roomCode || !room.directoryToken || !room.hostName) return null;
  return {
    code: session.roomCode,
    channelId: room.channelId,
    name: room.roomName,
    hostName: room.hostName,
    players: playerCount,
    maxPlayers: room.maxPlayers,
    phase: room.phase,
    mapId: room.mapId,
    mode: room.mode,
    isPrivate: room.isPrivate,
    createdAt: room.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

function listingSignature(listing: RoomListing) {
  return [listing.name, listing.hostName, listing.players, listing.maxPlayers, listing.phase, listing.mapId, listing.mode, listing.isPrivate].join("|");
}

/**
 * The host advertises the room to the directory: every DIRECTORY_HEARTBEAT_MS, plus one
 * extra send when something the browser shows (phase, player count, name…) changes.
 */
export function useRoomDirectorySync(session: Session, room: RoomState, playerCount: number) {
  const lastSentAt = useRef(0);
  const lastSignature = useRef("");
  const timer = useRef(0);
  const listing = buildListing(session, room, playerCount);
  const signature = listing ? listingSignature(listing) : "";
  const enabled = listing !== null;
  const latest = useRef({ session, room, playerCount });

  useEffect(() => {
    latest.current = { session, room, playerCount };
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let retry = 0;

    const send = async () => {
      const snapshot = latest.current;
      const current = buildListing(snapshot.session, snapshot.room, snapshot.playerCount);
      if (!current || !snapshot.session.isHost()) return;
      const now = Date.now();
      const wait = MIN_GAP_MS - (now - lastSentAt.current);
      if (wait > 0) {
        // Too soon after the last send: defer instead of dropping, so a change is never lost.
        window.clearTimeout(retry);
        retry = window.setTimeout(() => void send(), wait);
        return;
      }
      lastSentAt.current = now;
      lastSignature.current = listingSignature(current);
      const result = await sendHeartbeat({ ...current, updatedAt: now }, snapshot.room.directoryToken);
      if (cancelled || result.ok) return;
      // 401 means another token owns the code (stale listing from a previous life of this room);
      // nothing to do client-side, the old entry expires within the TTL.
    };

    const schedule = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(async () => {
        await send();
        if (!cancelled) schedule();
      }, DIRECTORY_HEARTBEAT_MS);
    };

    if (signature !== lastSignature.current) void send();
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
      window.clearTimeout(retry);
    };
    // `signature` captures every field the browser displays; the ref carries the latest state.
  }, [enabled, signature, room.directoryToken]);
}
