import { describe, expect, it } from "vitest";
import { hasOpenSlot, isStale, sortListings, validateListing, type RoomListing } from "../listing";

const NOW = 1_700_000_000_000;

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

describe("validateListing", () => {
  it("accepts a well-formed listing and normalizes strings", () => {
    const result = validateListing({ ...listing(), name: "  미호의 방  ", code: "kr7f3k9q" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.name).toBe("미호의 방");
    expect(result.listing.code).toBe("KR7F3K9Q");
  });

  it("falls back to '{host}의 방' when the name is empty", () => {
    const result = validateListing({ ...listing(), name: "" });
    expect(result.ok && result.listing.name).toBe("미호의 방");
  });

  it("rejects non-objects and missing codes", () => {
    expect(validateListing(null).ok).toBe(false);
    expect(validateListing("x").ok).toBe(false);
    expect(validateListing({ ...listing(), code: "ab" }).ok).toBe(false);
  });

  it("rejects out-of-range player counts", () => {
    expect(validateListing({ ...listing(), maxPlayers: 1 }).ok).toBe(false);
    expect(validateListing({ ...listing(), maxPlayers: 9 }).ok).toBe(false);
    expect(validateListing({ ...listing(), players: 9 }).ok).toBe(false);
    expect(validateListing({ ...listing(), players: -1 }).ok).toBe(false);
    expect(validateListing({ ...listing(), players: 2.5 }).ok).toBe(false);
  });

  it("rejects unknown phases, modes and overlong strings", () => {
    expect(validateListing({ ...listing(), phase: "party" }).ok).toBe(false);
    expect(validateListing({ ...listing(), mode: "chaos" }).ok).toBe(false);
    expect(validateListing({ ...listing(), name: "x".repeat(21) }).ok).toBe(false);
    expect(validateListing({ ...listing(), hostName: "x".repeat(13) }).ok).toBe(false);
    expect(validateListing({ ...listing(), mapId: "x".repeat(33) }).ok).toBe(false);
    expect(validateListing({ ...listing(), channelId: "" }).ok).toBe(false);
  });

  it("coerces isPrivate to a boolean and requires finite timestamps", () => {
    const result = validateListing({ ...listing(), isPrivate: 1 });
    expect(result.ok && result.listing.isPrivate).toBe(true);
    expect(validateListing({ ...listing(), createdAt: "now" }).ok).toBe(false);
    expect(validateListing({ ...listing(), createdAt: Number.NaN }).ok).toBe(false);
  });

  it("names the failing field", () => {
    const result = validateListing({ ...listing(), phase: "party" });
    expect(!result.ok && result.error).toContain("phase");
  });
});

describe("isStale", () => {
  it("expires a listing after the ttl", () => {
    expect(isStale(listing({ updatedAt: NOW - 11_000 }), NOW, 12_000)).toBe(false);
    expect(isStale(listing({ updatedAt: NOW - 13_000 }), NOW, 12_000)).toBe(true);
  });
});

describe("hasOpenSlot", () => {
  it("is true only when players < maxPlayers", () => {
    expect(hasOpenSlot(listing({ players: 7 }))).toBe(true);
    expect(hasOpenSlot(listing({ players: 8 }))).toBe(false);
  });
});

describe("sortListings", () => {
  it("puts lobbies first, then fuller rooms, then older rooms", () => {
    const rooms = [
      listing({ code: "HUNT", phase: "hunt", players: 8 }),
      listing({ code: "SMALL", players: 2, createdAt: NOW - 10 }),
      listing({ code: "OLD", players: 2, createdAt: NOW - 500 }),
      listing({ code: "BIG", players: 6 }),
    ];
    expect(sortListings(rooms).map((r) => r.code)).toEqual(["BIG", "OLD", "SMALL", "HUNT"]);
  });

  it("does not mutate the input", () => {
    const rooms = [listing({ code: "B", players: 1 }), listing({ code: "A", players: 5 })];
    sortListings(rooms);
    expect(rooms[0].code).toBe("B");
  });
});
