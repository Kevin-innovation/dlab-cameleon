import { DIRECTORY_TTL_S } from "../config";
import { isStale, type RoomListing } from "./listing";

export type UpsertResult = "ok" | "forbidden" | "too_fast";
export type RemoveResult = "ok" | "forbidden" | "missing";

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
}

type MemoryEntry = { listing: RoomListing; token: string };

export class MemoryRoomDirectoryStore implements RoomDirectoryStore {
  private readonly rooms = new Map<string, MemoryEntry>();

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
}

const KEY_PREFIX = "cm";
const roomKey = (code: string) => `${KEY_PREFIX}:room:${code}`;
const indexKey = (channelId: string) => `${KEY_PREFIX}:rooms:${channelId}`;

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
}
