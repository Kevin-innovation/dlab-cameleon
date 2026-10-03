import { sortListings, validateListing } from "./listing";
import { parseRoomCode } from "./code";
import { cleanLobbyChatName, cleanLobbyChatText, type LobbyChatMessage } from "./chat";
import { isLobbyAdminKey, isLobbyAdminName } from "./admin";
import type { RoomDirectoryStore } from "./store";

export type ApiResult = { status: number; body: { ok: true; data: unknown } | { ok: false; error: string } };

const MAX_BODY_BYTES = 2048;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const CHANNEL_PATTERN = /^[a-z0-9-]{1,16}$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

const ok = (data: unknown, status = 200): ApiResult => ({ status, body: { ok: true, data } });
const fail = (status: number, error: string): ApiResult => ({ status, body: { ok: false, error } });

function parseBody(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; result: ApiResult } {
  if (raw.length > MAX_BODY_BYTES) return { ok: false, result: fail(413, "body too large") };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, result: fail(400, "body must be an object") };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, result: fail(400, "body is not valid JSON") };
  }
}

function readToken(value: unknown): string | null {
  return typeof value === "string" && TOKEN_PATTERN.test(value) ? value : null;
}

export async function handleHeartbeat(store: RoomDirectoryStore, rawBody: string, now: number): Promise<ApiResult> {
  const parsed = parseBody(rawBody);
  if (!parsed.ok) return parsed.result;
  const token = readToken(parsed.value.token);
  if (!token) return fail(400, "token is invalid");
  const validation = validateListing(parsed.value.listing);
  if (!validation.ok) return fail(400, validation.error);
  const outcome = await store.upsert(validation.listing, token, now);
  if (outcome === "forbidden") return fail(401, "token does not own this room");
  if (outcome === "too_fast") return fail(429, "heartbeat too frequent");
  return ok({ updatedAt: now });
}

export async function handleListRooms(store: RoomDirectoryStore, channelId: string, now: number): Promise<ApiResult> {
  if (!CHANNEL_PATTERN.test(channelId)) return fail(400, "channel is invalid");
  const rooms = await store.list(channelId, now);
  return ok({ rooms: sortListings(rooms.filter((room) => !room.isPrivate)).slice(0, 50), now });
}

export async function handleGetRoom(store: RoomDirectoryStore, rawCode: string, now: number): Promise<ApiResult> {
  const code = parseRoomCode(rawCode);
  if (!code) return fail(400, "code is invalid");
  const room = await store.get(code, now);
  if (!room) return fail(404, "room not found");
  return ok({ room });
}

export async function handleCloseRoom(store: RoomDirectoryStore, rawCode: string, rawBody: string): Promise<ApiResult> {
  const code = parseRoomCode(rawCode);
  if (!code) return fail(400, "code is invalid");
  const parsed = parseBody(rawBody);
  if (!parsed.ok) return parsed.result;
  const token = readToken(parsed.value.token);
  if (!token) return fail(400, "token is invalid");
  const outcome = await store.remove(code, token);
  if (outcome === "missing") return fail(404, "room not found");
  if (outcome === "forbidden") return fail(401, "token does not own this room");
  return ok({ removed: code });
}

function readChannel(value: unknown): string | null {
  return typeof value === "string" && CHANNEL_PATTERN.test(value) ? value : null;
}

function readMessageId(value: unknown): string | null {
  return typeof value === "string" && MESSAGE_ID_PATTERN.test(value) ? value : null;
}

export async function handleListChat(store: RoomDirectoryStore, channelId: string, after: number, now: number): Promise<ApiResult> {
  if (!readChannel(channelId)) return fail(400, "channel is invalid");
  if (!Number.isSafeInteger(after) || after < 0) return fail(400, "after is invalid");
  return ok({ messages: await store.listChat(channelId, after, now), now });
}

export async function handleSendChat(store: RoomDirectoryStore, rawBody: string, now: number): Promise<ApiResult> {
  const parsed = parseBody(rawBody);
  if (!parsed.ok) return parsed.result;
  const channelId = readChannel(parsed.value.channelId);
  const name = cleanLobbyChatName(parsed.value.name);
  const text = cleanLobbyChatText(parsed.value.text);
  if (!channelId) return fail(400, "channel is invalid");
  if (!name) return fail(400, "name is invalid");
  if (!text) return fail(400, "text is invalid");
  const message: LobbyChatMessage = {
    id: `lobby-${now}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    text,
    at: now,
  };
  await store.appendChat(channelId, message, now);
  return ok({ message }, 201);
}

export async function handleDeleteChat(store: RoomDirectoryStore, rawBody: string, now: number, expectedAdminKey: string | null): Promise<ApiResult> {
  const parsed = parseBody(rawBody);
  if (!parsed.ok) return parsed.result;
  const channelId = readChannel(parsed.value.channelId);
  const messageId = readMessageId(parsed.value.messageId);
  const name = cleanLobbyChatName(parsed.value.name);
  if (!channelId) return fail(400, "channel is invalid");
  if (!name) return fail(400, "name is invalid");
  if (!isLobbyAdminName(name) || !isLobbyAdminKey(parsed.value.adminKey, expectedAdminKey)) return fail(403, "admin authorization required");
  if (parsed.value.all === true) return ok({ removed: await store.clearChat(channelId, now), all: true });
  if (!messageId) return fail(400, "message id is invalid");
  const outcome = await store.deleteChat(channelId, messageId, now);
  if (outcome === "missing") return fail(404, "chat message not found");
  return ok({ removed: messageId });
}
