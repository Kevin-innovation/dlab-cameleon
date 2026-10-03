import { DIRECTORY_TTL_S, LOBBY_CHAT_HISTORY_MAX, LOBBY_CHAT_TTL_S } from "../config";
import type { LobbyChatMessage } from "./chat";
import { isStale, type RoomListing } from "./listing";

export type UpsertResult = "ok" | "forbidden" | "too_fast";
export type RemoveResult = "ok" | "forbidden" | "missing";
export type DeleteChatResult = "removed" | "missing";

export type DirectoryStoreOptions = {
  ttlMs: number;
  /** Minimum gap between two accepted heartbeats for the same code. */
  minIntervalMs: number;
};

export const DEFAULT_STORE_OPTIONS: DirectoryStoreOptions = {
  ttlMs: DIRECTORY_TTL_S * 1000,
  minIntervalMs: 2000,
};

/** Directory of live rooms. The first heartbeat for a code binds it to a token; later writes must match. */
export interface RoomDirectoryStore {
  upsert(listing: RoomListing, token: string, now: number): Promise<UpsertResult>;
  list(channelId: string, now: number): Promise<RoomListing[]>;
  get(code: string, now: number): Promise<RoomListing | null>;
  remove(code: string, token: string): Promise<RemoveResult>;
  listChat(channelId: string, after: number, now: number): Promise<LobbyChatMessage[]>;
  appendChat(channelId: string, message: LobbyChatMessage, now: number): Promise<void>;
  deleteChat(channelId: string, messageId: string, now: number): Promise<DeleteChatResult>;
  clearChat(channelId: string, now: number): Promise<number>;
}

type MemoryEntry = { listing: RoomListing; token: string };
type MemoryChatEntry = { messages: LobbyChatMessage[]; expiresAt: number };

export class MemoryRoomDirectoryStore implements RoomDirectoryStore {
  private readonly rooms = new Map<string, MemoryEntry>();
  private readonly chats = new Map<string, MemoryChatEntry>();

  constructor(private readonly options: DirectoryStoreOptions = DEFAULT_STORE_OPTIONS) {}

  private live(code: string, now: number): MemoryEntry | null {
    const entry = this.rooms.get(code);
    if (!entry) return null;
    if (isStale(entry.listing, now, this.options.ttlMs)) {
      this.rooms.delete(code);
      return null;
    }
    return entry;
  }

  async upsert(listing: RoomListing, token: string, now: number): Promise<UpsertResult> {
    const existing = this.live(listing.code, now);
    if (existing && existing.token !== token) return "forbidden";
    if (existing && now - existing.listing.updatedAt < this.options.minIntervalMs) return "too_fast";
    this.rooms.set(listing.code, { listing: { ...listing, updatedAt: now }, token });
    return "ok";
  }

  async list(channelId: string, now: number): Promise<RoomListing[]> {
    const out: RoomListing[] = [];
    for (const code of [...this.rooms.keys()]) {
      const entry = this.live(code, now);
      if (entry && entry.listing.channelId === channelId) out.push(entry.listing);
    }
    return out;
  }

  async get(code: string, now: number): Promise<RoomListing | null> {
    return this.live(code, now)?.listing ?? null;
  }

  async remove(code: string, token: string): Promise<RemoveResult> {
    const entry = this.rooms.get(code);
    if (!entry) return "missing";
    if (entry.token !== token) return "forbidden";
    this.rooms.delete(code);
    return "ok";
  }

  async listChat(channelId: string, after: number, now: number): Promise<LobbyChatMessage[]> {
    const entry = this.chats.get(channelId);
    if (!entry) return [];
    if (entry.expiresAt <= now) {
      this.chats.delete(channelId);
      return [];
    }
    return entry.messages.filter((message) => message.at > after);
  }

  async appendChat(channelId: string, message: LobbyChatMessage, now: number): Promise<void> {
    const entry = this.chats.get(channelId);
    const messages = entry && entry.expiresAt > now ? entry.messages : [];
    this.chats.set(channelId, {
      messages: [...messages, message].slice(-LOBBY_CHAT_HISTORY_MAX),
      expiresAt: now + LOBBY_CHAT_TTL_S * 1000,
    });
  }

  async deleteChat(channelId: string, messageId: string, now: number): Promise<DeleteChatResult> {
    const entry = this.chats.get(channelId);
    if (!entry || entry.expiresAt <= now) {
      if (entry) this.chats.delete(channelId);
      return "missing";
    }
    const messages = entry.messages.filter((message) => message.id !== messageId);
    if (messages.length === entry.messages.length) return "missing";
    this.chats.set(channelId, { messages, expiresAt: entry.expiresAt });
    return "removed";
  }

  async clearChat(channelId: string, now: number): Promise<number> {
    const entry = this.chats.get(channelId);
    if (!entry || entry.expiresAt <= now) {
      if (entry) this.chats.delete(channelId);
      return 0;
    }
    this.chats.delete(channelId);
    return entry.messages.length;
  }
}

/** The subset of the Upstash client the store relies on; kept narrow so tests can fake it. */
export interface DirectoryRedis {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<"OK" | null>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  mget<T>(...keys: string[]): Promise<(T | null)[]>;
  lpush?: (key: string, ...values: unknown[]) => Promise<number>;
  lrange?: <T>(key: string, start: number, stop: number) => Promise<T[]>;
  lrem?: (key: string, count: number, value: unknown) => Promise<number>;
  ltrim?: (key: string, start: number, stop: number) => Promise<unknown>;
  expire?: (key: string, seconds: number) => Promise<unknown>;
}

const KEY_PREFIX = "cm";
const roomKey = (code: string) => `${KEY_PREFIX}:room:${code}`;
const indexKey = (channelId: string) => `${KEY_PREFIX}:rooms:${channelId}`;
const chatKey = (channelId: string) => `${KEY_PREFIX}:chat:${channelId}`;

/** Token and listing live in one value so a heartbeat costs two Redis commands (Upstash bills per command). */
type RedisEntry = { token: string; listing: RoomListing };

export class RedisRoomDirectoryStore implements RoomDirectoryStore {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: DirectoryRedis,
    private readonly options: DirectoryStoreOptions = DEFAULT_STORE_OPTIONS,
  ) {
    this.ttlSeconds = Math.max(1, Math.ceil(options.ttlMs / 1000));
  }

  async upsert(listing: RoomListing, token: string, now: number): Promise<UpsertResult> {
    const entry: RedisEntry = { token, listing: { ...listing, updatedAt: now } };
    const existing = await this.redis.get<RedisEntry>(roomKey(listing.code));
    if (existing) {
      if (existing.token !== token) return "forbidden";
      if (now - existing.listing.updatedAt < this.options.minIntervalMs) return "too_fast";
      await this.redis.set(roomKey(listing.code), entry, { ex: this.ttlSeconds });
      return "ok";
    }
    // New code: NX guards the (unlikely) race where two hosts pick the same code at once.
    const claimed = await this.redis.set(roomKey(listing.code), entry, { ex: this.ttlSeconds, nx: true });
    if (claimed !== "OK") return "forbidden";
    await this.redis.sadd(indexKey(listing.channelId), listing.code);
    return "ok";
  }

  async list(channelId: string, now: number): Promise<RoomListing[]> {
    const codes = await this.redis.smembers(indexKey(channelId));
    if (codes.length === 0) return [];
    const rows = await this.redis.mget<RedisEntry>(...codes.map(roomKey));
    const live: RoomListing[] = [];
    const dead: string[] = [];
    rows.forEach((row, i) => {
      if (row && !isStale(row.listing, now, this.options.ttlMs)) live.push(row.listing);
      else dead.push(codes[i]);
    });
    if (dead.length) await this.redis.srem(indexKey(channelId), ...dead);
    return live;
  }

  async get(code: string, now: number): Promise<RoomListing | null> {
    const row = await this.redis.get<RedisEntry>(roomKey(code));
    if (!row || isStale(row.listing, now, this.options.ttlMs)) return null;
    return row.listing;
  }

  async remove(code: string, token: string): Promise<RemoveResult> {
    const row = await this.redis.get<RedisEntry>(roomKey(code));
    if (!row) return "missing";
    if (row.token !== token) return "forbidden";
    await this.redis.del(roomKey(code));
    await this.redis.srem(indexKey(row.listing.channelId), code);
    return "ok";
  }

  async listChat(channelId: string, after: number, now: number): Promise<LobbyChatMessage[]> {
    void now; // Redis applies the chat TTL server-side.
    if (this.redis.lrange) {
      const rows = await this.redis.lrange<unknown>(chatKey(channelId), 0, LOBBY_CHAT_HISTORY_MAX - 1);
      return rows
        .map((row) => {
          if (typeof row === "string") {
            try {
              return JSON.parse(row) as LobbyChatMessage;
            } catch {
              return null;
            }
          }
          return row as LobbyChatMessage;
        })
        .filter((message): message is LobbyChatMessage => Boolean(message && message.at > after))
        .reverse();
    }
    const messages = (await this.redis.get<LobbyChatMessage[]>(chatKey(channelId))) ?? [];
    return messages.filter((message) => message.at > after);
  }

  async appendChat(channelId: string, message: LobbyChatMessage, now: number): Promise<void> {
    void now; // Redis applies the chat TTL server-side.
    const key = chatKey(channelId);
    if (this.redis.lpush && this.redis.lrange && this.redis.ltrim && this.redis.expire) {
      await this.redis.lpush(key, JSON.stringify(message));
      await this.redis.ltrim(key, 0, LOBBY_CHAT_HISTORY_MAX - 1);
      await this.redis.expire(key, LOBBY_CHAT_TTL_S);
      return;
    }
    const messages = (await this.redis.get<LobbyChatMessage[]>(key)) ?? [];
    await this.redis.set(key, [...messages, message].slice(-LOBBY_CHAT_HISTORY_MAX), { ex: LOBBY_CHAT_TTL_S });
  }

  async deleteChat(channelId: string, messageId: string, now: number): Promise<DeleteChatResult> {
    void now;
    const key = chatKey(channelId);
    if (this.redis.lrange) {
      const rows = await this.redis.lrange<unknown>(key, 0, LOBBY_CHAT_HISTORY_MAX - 1);
      const row = rows.find((candidate) => {
        const message = parseChatRow(candidate);
        return message?.id === messageId;
      });
      if (row === undefined) return "missing";
      const serialized = typeof row === "string" ? row : JSON.stringify(row);
      if (this.redis.lrem) return (await this.redis.lrem(key, 1, serialized)) > 0 ? "removed" : "missing";

      // Compatibility fallback for a test adapter or an older Redis shape.
      const remaining = rows.filter((candidate) => {
        const message = parseChatRow(candidate);
        return message?.id !== messageId;
      });
      await this.redis.del(key);
      if (remaining.length && this.redis.lpush) {
        await this.redis.lpush(key, ...remaining.slice().reverse().map((candidate) => typeof candidate === "string" ? candidate : JSON.stringify(candidate)));
        if (this.redis.ltrim) await this.redis.ltrim(key, 0, LOBBY_CHAT_HISTORY_MAX - 1);
        if (this.redis.expire) await this.redis.expire(key, LOBBY_CHAT_TTL_S);
      }
      return "removed";
    }

    const messages = (await this.redis.get<LobbyChatMessage[]>(key)) ?? [];
    const remaining = messages.filter((message) => message.id !== messageId);
    if (remaining.length === messages.length) return "missing";
    await this.redis.set(key, remaining, { ex: LOBBY_CHAT_TTL_S });
    return "removed";
  }

  async clearChat(channelId: string, now: number): Promise<number> {
    void now;
    const key = chatKey(channelId);
    if (this.redis.lrange) {
      const rows = await this.redis.lrange<unknown>(key, 0, LOBBY_CHAT_HISTORY_MAX - 1);
      if (rows.length === 0) return 0;
      await this.redis.del(key);
      return rows.length;
    }
    const messages = (await this.redis.get<LobbyChatMessage[]>(key)) ?? [];
    if (messages.length === 0) return 0;
    await this.redis.del(key);
    return messages.length;
  }
}

function parseChatRow(row: unknown): LobbyChatMessage | null {
  if (typeof row === "string") {
    try {
      return JSON.parse(row) as LobbyChatMessage;
    } catch {
      return null;
    }
  }
  return row && typeof row === "object" ? row as LobbyChatMessage : null;
}
