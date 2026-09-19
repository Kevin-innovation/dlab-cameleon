import { parseRoomCode } from "./code";
import type { RoomListing } from "./listing";

/** Browser-side access to the room directory. Never throws; network errors come back as status 0. */
export type DirectoryResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const TOKEN_LENGTH = 32;

export function generateDirectoryToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

async function request<T>(url: string, init: RequestInit | undefined, fetchImpl: typeof fetch): Promise<DirectoryResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, cache: "no-store" });
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : "network error" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status, error: "invalid response" };
  }
  const envelope = body as { ok?: boolean; data?: T; error?: string } | null;
  if (!response.ok || !envelope || envelope.ok !== true || envelope.data === undefined) {
    return { ok: false, status: response.status, error: envelope?.error ?? `request failed (${response.status})` };
  }
  return { ok: true, value: envelope.data };
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export function fetchRooms(channelId: string, fetchImpl: typeof fetch = fetch) {
  return request<{ rooms: RoomListing[]; now: number }>(`/api/rooms?channel=${encodeURIComponent(channelId)}`, undefined, fetchImpl);
}

export async function fetchRoom(rawCode: string, fetchImpl: typeof fetch = fetch): Promise<DirectoryResult<{ room: RoomListing }>> {
  const code = parseRoomCode(rawCode);
  if (!code) return { ok: false, status: 400, error: "code is invalid" };
  return request<{ room: RoomListing }>(`/api/rooms/${code}`, undefined, fetchImpl);
}

export function sendHeartbeat(listing: RoomListing, token: string, fetchImpl: typeof fetch = fetch) {
  return request<{ updatedAt: number }>("/api/rooms/heartbeat", json("POST", { listing, token }), fetchImpl);
}

export function closeRoom(code: string, token: string, fetchImpl: typeof fetch = fetch) {
  return request<{ removed: string }>(`/api/rooms/${code}`, json("DELETE", { token }), fetchImpl);
}
