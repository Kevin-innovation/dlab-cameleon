import { describe, expect, it } from "vitest";
import { closeRoom, fetchRoom, fetchRooms, generateDirectoryToken, sendHeartbeat } from "../client";
import type { RoomListing } from "../listing";

const NOW = 1_700_000_000_000;

function listing(): RoomListing {
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
    createdAt: NOW,
    updatedAt: NOW,
  };
}

type Call = { url: string; init?: RequestInit };

function fakeFetch(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

describe("fetchRooms", () => {
  it("returns the room list on success", async () => {
    const calls: Call[] = [];
    const result = await fetchRooms("kr1", fakeFetch(200, { ok: true, data: { rooms: [listing()], now: NOW } }, calls));
    expect(result.ok && result.value.rooms[0].code).toBe("KR7F3K9Q");
    expect(calls[0].url).toBe("/api/rooms?channel=kr1");
  });

  it("surfaces server errors and network failures without throwing", async () => {
    const failed = await fetchRooms("kr1", fakeFetch(503, { ok: false, error: "room directory unavailable" }));
    expect(failed).toEqual({ ok: false, status: 503, error: "room directory unavailable" });
    const broken = await fetchRooms("kr1", (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch);
    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.status).toBe(0);
  });

  it("treats a non-JSON body as a failure", async () => {
    const weird = (async () => new Response("<html>", { status: 200 })) as typeof fetch;
    const result = await fetchRooms("kr1", weird);
    expect(result.ok).toBe(false);
  });
});

describe("fetchRoom", () => {
  it("normalizes the code and returns the room", async () => {
    const calls: Call[] = [];
    const result = await fetchRoom("kr7f-3k9q", fakeFetch(200, { ok: true, data: { room: listing() } }, calls));
    expect(result.ok && result.value.room.code).toBe("KR7F3K9Q");
    expect(calls[0].url).toBe("/api/rooms/KR7F3K9Q");
  });

  it("rejects an unparsable code locally", async () => {
    const result = await fetchRoom("!!", fakeFetch(200, {}));
    expect(result).toEqual({ ok: false, status: 400, error: "code is invalid" });
  });
});

describe("sendHeartbeat / closeRoom", () => {
  it("posts the listing and token as JSON", async () => {
    const calls: Call[] = [];
    const result = await sendHeartbeat(listing(), "t".repeat(32), fakeFetch(200, { ok: true, data: { updatedAt: NOW } }, calls));
    expect(result.ok).toBe(true);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ token: "t".repeat(32), listing: { code: "KR7F3K9Q" } });
  });

  it("uses DELETE with the token for closeRoom", async () => {
    const calls: Call[] = [];
    await closeRoom("KR7F3K9Q", "t".repeat(32), fakeFetch(200, { ok: true, data: { removed: "KR7F3K9Q" } }, calls));
    expect(calls[0].url).toBe("/api/rooms/KR7F3K9Q");
    expect(calls[0].init?.method).toBe("DELETE");
  });
});

describe("generateDirectoryToken", () => {
  it("produces a 32-char url-safe token", () => {
    const token = generateDirectoryToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(generateDirectoryToken()).not.toBe(token);
  });
});
