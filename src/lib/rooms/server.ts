import "server-only";
import { Redis } from "@upstash/redis";
import { MemoryRoomDirectoryStore, RedisRoomDirectoryStore, type DirectoryRedis, type RoomDirectoryStore } from "./store";

/**
 * Resolves the room directory backend once per server instance.
 * Upstash credentials come from the Vercel Marketplace integration (KV_REST_API_*)
 * or a hand-configured UPSTASH_REDIS_REST_* pair. Without them, local development
 * falls back to an in-memory store; production refuses to start the directory.
 */
export class DirectoryUnavailableError extends Error {
  constructor() {
    super("Room directory is not configured: set KV_REST_API_URL and KV_REST_API_TOKEN");
    this.name = "DirectoryUnavailableError";
  }
}

let cached: RoomDirectoryStore | null = null;
let warned = false;

function readCredentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function getRoomDirectoryStore(): RoomDirectoryStore {
  if (cached) return cached;
  const credentials = readCredentials();
  if (credentials) {
    const redis = new Redis({ url: credentials.url, token: credentials.token });
    cached = new RedisRoomDirectoryStore(redis as unknown as DirectoryRedis);
    return cached;
  }
  if (process.env.VERCEL_ENV === "production") throw new DirectoryUnavailableError();
  if (!warned) {
    warned = true;
    console.warn("[rooms] Redis credentials missing; using in-memory room directory (development only).");
  }
  cached = new MemoryRoomDirectoryStore();
  return cached;
}

export function jsonResponse(result: { status: number; body: unknown }): Response {
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function directoryErrorResponse(error: unknown): Response {
  const unavailable = error instanceof DirectoryUnavailableError;
  if (!unavailable) console.error("[rooms] directory request failed", error);
  return jsonResponse({
    status: unavailable ? 503 : 500,
    body: { ok: false, error: unavailable ? "room directory unavailable" : "internal error" },
  });
}
