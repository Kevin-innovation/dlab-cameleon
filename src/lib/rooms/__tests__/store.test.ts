import { describe, expect, it } from "vitest";
import type { RoomListing } from "../listing";
import { MemoryRoomDirectoryStore, RedisRoomDirectoryStore, type DirectoryRedis, type RoomDirectoryStore } from "../store";

const NOW = 1_700_000_000_000;
const OPTS = { ttlMs: 12_000, minIntervalMs: 2_000 };

function listing(overrides: Partial<RoomListing> = {}): RoomListing {
  return {
    code: "KR7F3K9Q",
    channelId: "kr1",
    name: "미호의 방",
    hostName: "미호",
    players: 3,
    maxPlayers: 8,
    phase: "lobby",
    mapId: "mansion",
    mode: "normal",
    isPrivate: false,
    createdAt: NOW - 60_000,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Minimal in-memory stand-in for the Upstash client, with key expiry. */
function fakeRedis(): DirectoryRedis & { clock: { now: number } } {
  const clock = { now: NOW };
  const kv = new Map<string, { value: unknown; expiresAt: number }>();
  const sets = new Map<string, Set<string>>();
  const live = (key: string) => {
    const entry = kv.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= clock.now) {
      kv.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    clock,
    async get(key) {
      return (live(key)?.value ?? null) as never;
    },
    async set(key, value, opts) {
      if (opts?.nx && live(key)) return null;
      kv.set(key, { value, expiresAt: opts?.ex ? clock.now + opts.ex * 1000 : Number.POSITIVE_INFINITY });
      return "OK";
    },
    async del(...keys) {
      let n = 0;
      for (const key of keys) if (kv.delete(key)) n++;
      return n;
    },
    async sadd(key, ...members) {
      const set = sets.get(key) ?? new Set<string>();
      for (const m of members) set.add(m);
      sets.set(key, set);
      return members.length;
    },
    async srem(key, ...members) {
      const set = sets.get(key);
      if (!set) return 0;
      let n = 0;
      for (const m of members) if (set.delete(m)) n++;
      return n;
    },
    async smembers(key) {
      return [...(sets.get(key) ?? [])];
    },
    async mget(...keys) {
      return keys.map((key) => (live(key)?.value ?? null) as never);
    },
  };
}

function suite(name: string, make: () => { store: RoomDirectoryStore; advance: (ms: number) => void }) {
  describe(name, () => {
    it("registers a room on first heartbeat and lists it", async () => {
      const { store } = make();
      expect(await store.upsert(listing(), "tok-a", NOW)).toBe("ok");
      const rooms = await store.list("kr1", NOW);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].code).toBe("KR7F3K9Q");
      expect(rooms[0].updatedAt).toBe(NOW);
    });

    it("rejects a heartbeat with the wrong token", async () => {
      const { store } = make();
      await store.upsert(listing(), "tok-a", NOW);
      expect(await store.upsert(listing({ players: 8 }), "tok-b", NOW + 3000)).toBe("forbidden");
      expect((await store.get("KR7F3K9Q", NOW + 3000))?.players).toBe(3);
    });

    it("rejects heartbeats that arrive too fast", async () => {
      const { store } = make();
      await store.upsert(listing(), "tok-a", NOW);
      expect(await store.upsert(listing({ players: 4 }), "tok-a", NOW + 500)).toBe("too_fast");
      expect(await store.upsert(listing({ players: 4 }), "tok-a", NOW + 2500)).toBe("ok");
      expect((await store.get("KR7F3K9Q", NOW + 2500))?.players).toBe(4);
    });

    it("drops rooms whose host stopped sending heartbeats", async () => {
      const { store, advance } = make();
      await store.upsert(listing(), "tok-a", NOW);
      advance(13_000);
      expect(await store.list("kr1", NOW + 13_000)).toEqual([]);
      expect(await store.get("KR7F3K9Q", NOW + 13_000)).toBeNull();
    });

    it("lets a new token claim a code after the old one expired", async () => {
      const { store, advance } = make();
      await store.upsert(listing(), "tok-a", NOW);
      advance(13_000);
      expect(await store.upsert(listing(), "tok-b", NOW + 13_000)).toBe("ok");
    });

    it("lists per channel only", async () => {
      const { store } = make();
      await store.upsert(listing(), "tok-a", NOW);
      await store.upsert(listing({ code: "JPAAAAAA", channelId: "jp1" }), "tok-b", NOW);
      expect((await store.list("kr1", NOW)).map((r) => r.code)).toEqual(["KR7F3K9Q"]);
      expect((await store.list("jp1", NOW)).map((r) => r.code)).toEqual(["JPAAAAAA"]);
    });

    it("removes a room only with its token", async () => {
      const { store } = make();
      await store.upsert(listing(), "tok-a", NOW);
      expect(await store.remove("KR7F3K9Q", "tok-b")).toBe("forbidden");
      expect(await store.remove("KR7F3K9Q", "tok-a")).toBe("ok");
      expect(await store.remove("KR7F3K9Q", "tok-a")).toBe("missing");
      expect(await store.list("kr1", NOW)).toEqual([]);
    });
  });
}

suite("MemoryRoomDirectoryStore", () => {
  const store = new MemoryRoomDirectoryStore(OPTS);
  return { store, advance: () => {} };
});

suite("RedisRoomDirectoryStore", () => {
  const redis = fakeRedis();
  const store = new RedisRoomDirectoryStore(redis, OPTS);
  return { store, advance: (ms) => (redis.clock.now += ms) };
});

describe("RedisRoomDirectoryStore command budget", () => {
  function counting() {
    const redis = fakeRedis();
    const counts = { total: 0 };
    const wrapped = new Proxy(redis, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          counts.total += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as typeof redis;
    return { redis: wrapped, raw: redis, counts };
  }

  it("prunes expired codes from the channel index while listing", async () => {
    const { redis, raw } = counting();
    const store = new RedisRoomDirectoryStore(redis, OPTS);
    await store.upsert(listing(), "tok-a", NOW);
    raw.clock.now += 13_000;
    await store.list("kr1", NOW + 13_000);
    expect(await raw.smembers("cm:rooms:kr1")).toEqual([]);
  });

  it("spends three commands to register, then two per heartbeat, two per list, one per get", async () => {
    const { redis, counts } = counting();
    const store = new RedisRoomDirectoryStore(redis, OPTS);
    await store.upsert(listing(), "tok-a", NOW);
    expect(counts.total).toBe(3);
    await store.upsert(listing({ players: 4 }), "tok-a", NOW + 3000);
    expect(counts.total).toBe(5);
    await store.list("kr1", NOW + 3000);
    expect(counts.total).toBe(7);
    await store.get("KR7F3K9Q", NOW + 3000);
    expect(counts.total).toBe(8);
  });
});
