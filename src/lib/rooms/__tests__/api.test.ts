import { describe, expect, it } from "vitest";
import { handleCloseRoom, handleDeleteChat, handleGetRoom, handleHeartbeat, handleListChat, handleListRooms, handleSendChat } from "../api";
import { MemoryRoomDirectoryStore } from "../store";

const NOW = 1_700_000_000_000;
const TOKEN = "a".repeat(32);

function payload(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

const body = (listing: Record<string, unknown>, token: string = TOKEN) => JSON.stringify({ listing, token });

describe("handleHeartbeat", () => {
  it("stores a valid listing", async () => {
    const store = new MemoryRoomDirectoryStore();
    const res = await handleHeartbeat(store, body(payload()), NOW);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { updatedAt: NOW } });
    expect((await store.get("KR7F3K9Q", NOW))?.name).toBe("미호의 방");
  });

  it("rejects malformed JSON, oversized bodies and bad listings with 400", async () => {
    const store = new MemoryRoomDirectoryStore();
    expect((await handleHeartbeat(store, "{nope", NOW)).status).toBe(400);
    expect((await handleHeartbeat(store, JSON.stringify({ listing: payload(), token: TOKEN, pad: "x".repeat(3000) }), NOW)).status).toBe(413);
    const bad = await handleHeartbeat(store, body(payload({ phase: "party" })), NOW);
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ ok: false, error: "phase is invalid" });
  });

  it("requires a well-formed token", async () => {
    const store = new MemoryRoomDirectoryStore();
    expect((await handleHeartbeat(store, body(payload(), "short"), NOW)).status).toBe(400);
    expect((await handleHeartbeat(store, JSON.stringify({ listing: payload() }), NOW)).status).toBe(400);
  });

  it("maps store outcomes to 401 and 429", async () => {
    const store = new MemoryRoomDirectoryStore();
    await handleHeartbeat(store, body(payload()), NOW);
    expect((await handleHeartbeat(store, body(payload(), "b".repeat(32)), NOW + 3000)).status).toBe(401);
    expect((await handleHeartbeat(store, body(payload()), NOW + 500)).status).toBe(429);
  });
});

describe("handleListRooms", () => {
  it("returns public rooms of the channel, sorted, and hides private ones", async () => {
    const store = new MemoryRoomDirectoryStore();
    await handleHeartbeat(store, body(payload({ code: "KRPUBLIC", players: 2 })), NOW);
    await handleHeartbeat(store, body(payload({ code: "KRSECRET", isPrivate: true }), "c".repeat(32)), NOW);
    await handleHeartbeat(store, body(payload({ code: "KRFULLER", players: 6 }), "d".repeat(32)), NOW);
    const res = await handleListRooms(store, "kr1", NOW);
    expect(res.status).toBe(200);
    const codes = (res.body as { data: { rooms: { code: string }[] } }).data.rooms.map((r) => r.code);
    expect(codes).toEqual(["KRFULLER", "KRPUBLIC"]);
  });

  it("rejects an invalid channel id", async () => {
    const store = new MemoryRoomDirectoryStore();
    expect((await handleListRooms(store, "", NOW)).status).toBe(400);
    expect((await handleListRooms(store, "x".repeat(40), NOW)).status).toBe(400);
  });
});

describe("lobby chat", () => {
  const ADMIN_KEY = "k".repeat(32);

  it("stores a nickname-labelled message and returns it to the channel", async () => {
    const store = new MemoryRoomDirectoryStore();
    const sent = await handleSendChat(store, JSON.stringify({ channelId: "kr1", name: " 미호 ", text: "안녕\n방 찾는 중" }), NOW);
    expect(sent.status).toBe(201);
    const message = (sent.body as { data: { message: { name: string; text: string } } }).data.message;
    expect(message).toMatchObject({ name: "미호", text: "안녕 방 찾는 중" });

    const listed = await handleListChat(store, "kr1", 0, NOW + 1);
    expect(listed.status).toBe(200);
    expect((listed.body as { data: { messages: { id: string }[] } }).data.messages).toHaveLength(1);
  });

  it("rejects invalid chat input", async () => {
    const store = new MemoryRoomDirectoryStore();
    expect((await handleSendChat(store, JSON.stringify({ channelId: "kr1", name: "미호", text: "" }), NOW)).status).toBe(400);
    expect((await handleListChat(store, "bad channel", 0, NOW)).status).toBe(400);
  });

  it("lets only Kevin with the server key remove a message", async () => {
    const store = new MemoryRoomDirectoryStore();
    const sent = await handleSendChat(store, JSON.stringify({ channelId: "kr1", name: "미호", text: "삭제 대상" }), NOW);
    const messageId = (sent.body as { data: { message: { id: string } } }).data.message.id;

    expect((await handleDeleteChat(store, JSON.stringify({ channelId: "kr1", messageId, name: "미호", adminKey: ADMIN_KEY }), NOW + 1, ADMIN_KEY)).status).toBe(403);
    expect((await handleDeleteChat(store, JSON.stringify({ channelId: "kr1", messageId, name: "Kevin", adminKey: "wrong" }), NOW + 1, ADMIN_KEY)).status).toBe(403);
    expect((await handleDeleteChat(store, JSON.stringify({ channelId: "kr1", messageId, name: "Kevin", adminKey: ADMIN_KEY }), NOW + 1, ADMIN_KEY)).status).toBe(200);
    expect((await handleListChat(store, "kr1", 0, NOW + 2)).body).toEqual({ ok: true, data: { messages: [], now: NOW + 2 } });
  });

  it("lets Kevin clear the whole channel", async () => {
    const store = new MemoryRoomDirectoryStore();
    await handleSendChat(store, JSON.stringify({ channelId: "kr1", name: "미호", text: "첫 번째" }), NOW);
    await handleSendChat(store, JSON.stringify({ channelId: "kr1", name: "준혁", text: "두 번째" }), NOW + 1);
    const cleared = await handleDeleteChat(store, JSON.stringify({ channelId: "kr1", name: "Kevin", adminKey: ADMIN_KEY, all: true }), NOW + 2, ADMIN_KEY);
    expect(cleared).toEqual({ status: 200, body: { ok: true, data: { removed: 2, all: true } } });
    expect((await handleListChat(store, "kr1", 0, NOW + 3)).body).toEqual({ ok: true, data: { messages: [], now: NOW + 3 } });
  });
});

describe("handleGetRoom", () => {
  it("returns private rooms too when the exact code is known", async () => {
    const store = new MemoryRoomDirectoryStore();
    await handleHeartbeat(store, body(payload({ code: "KRSECRET", isPrivate: true })), NOW);
    const res = await handleGetRoom(store, "krsecret", NOW);
    expect(res.status).toBe(200);
    expect((res.body as { data: { room: { code: string } } }).data.room.code).toBe("KRSECRET");
  });

  it("returns 404 for unknown codes and 400 for malformed ones", async () => {
    const store = new MemoryRoomDirectoryStore();
    expect((await handleGetRoom(store, "KRNOPE99", NOW)).status).toBe(404);
    expect((await handleGetRoom(store, "!!", NOW)).status).toBe(400);
  });
});

describe("handleCloseRoom", () => {
  it("removes the room with the right token", async () => {
    const store = new MemoryRoomDirectoryStore();
    await handleHeartbeat(store, body(payload()), NOW);
    expect((await handleCloseRoom(store, "KR7F3K9Q", JSON.stringify({ token: "z".repeat(32) }))).status).toBe(401);
    expect((await handleCloseRoom(store, "KR7F3K9Q", JSON.stringify({ token: TOKEN }))).status).toBe(200);
    expect((await handleCloseRoom(store, "KR7F3K9Q", JSON.stringify({ token: TOKEN }))).status).toBe(404);
  });
});
