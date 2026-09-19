import { describe, expect, it } from "vitest";
import {
  DEFAULT_AMMO,
  DEFAULT_PREPARE,
  REVEAL_TIME,
  SCORE_HUNT_WIN,
  SCORE_SURVIVE,
  SCORE_TAG,
  TAG_RANGE,
} from "../config";
import {
  beginRound,
  canStartRound,
  claimHost,
  emptyRoom,
  finishRound,
  hiderAlive,
  hunterCountFor,
  isGhost,
  isHunter,
  isParticipant,
  patchRoom,
  processFire,
  reconcileRoomPlayers,
  remaining,
  roleOf,
  sanitizeRoom,
  tickRoom,
} from "../round";
import type { PlayerSnap, RoomState } from "../types";

const NOW = 1_700_000_000_000;

function snap(id: string, overrides: Partial<PlayerSnap> = {}): PlayerSnap {
  return {
    id,
    name: id,
    ready: true,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pose: "stand",
    fill: "#fff",
    blobs: [],
    camoScore: 0,
    role: "hider",
    alive: true,
    shootSeq: 0,
    ...overrides,
  };
}

function huntRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    ...emptyRoom(),
    phase: "hunt",
    round: 1,
    hunterIds: ["h1"],
    participantIds: ["h1", "s1", "t1", "t2", "c", "c1", "s"],
    phaseEndsAt: NOW + 60_000,
    ...overrides,
  };
}

describe("hunterCountFor", () => {
  it("returns 0 for a solo lobby", () => {
    expect(hunterCountFor(1, 1)).toBe(0);
    expect(hunterCountFor(0, 3)).toBe(0);
  });

  it("gives exactly one hunter for 2 to 7 players regardless of request", () => {
    expect(hunterCountFor(2, 3)).toBe(1);
    expect(hunterCountFor(4, 3)).toBe(1);
    expect(hunterCountFor(7, 3)).toBe(1);
  });

  it("allows two hunters at 8 players when requested", () => {
    expect(hunterCountFor(8, 3)).toBe(2);
    expect(hunterCountFor(8, 1)).toBe(1);
  });
});

describe("sanitizeRoom", () => {
  it("falls back to defaults for invalid enums", () => {
    const room = sanitizeRoom({ ...emptyRoom(), phase: "bogus" as RoomState["phase"], mode: "x" as RoomState["mode"] });
    expect(room.phase).toBe("lobby");
    expect(room.mode).toBe("normal");
    expect(room.hunterMode).toBe("random");
  });

  it("clamps numeric settings to their allowed ranges", () => {
    const room = sanitizeRoom({
      ...emptyRoom(),
      prepareTime: 999,
      hideTime: 1,
      huntTime: 10_000,
      hunterCount: 9,
      ammoCount: -5,
    });
    expect(room.prepareTime).toBe(20);
    expect(room.hideTime).toBe(30);
    expect(room.huntTime).toBe(300);
    expect(room.hunterCount).toBe(3);
    expect(room.ammoCount).toBe(3);
  });

  it("drops malformed chat messages and keeps only the last 60", () => {
    const valid = Array.from({ length: 70 }, (_, i) => ({
      id: `m${i}`,
      senderId: "p1",
      senderName: "p1",
      text: `hi ${i}`,
      at: NOW + i,
    }));
    const broken = { id: 1, senderId: "p1", senderName: "p1", text: "x", at: NOW } as unknown as RoomState["chat"][number];
    const room = sanitizeRoom({ ...emptyRoom(), chat: [broken, ...valid] });
    expect(room.chat).toHaveLength(60);
    expect(room.chat[0].id).toBe("m10");
  });

  it("normalizes room metadata fields", () => {
    const room = sanitizeRoom({
      ...emptyRoom(),
      channelId: "",
      roomName: "  이름이 아주아주 길어서 스무 글자를 넘기는 방 이름  ",
      maxPlayers: 1,
      isPrivate: "yes" as unknown as boolean,
      hostId: 42 as unknown as string,
      participantIds: ["a", "a", "b"],
    });
    expect(room.channelId).toBe("kr1");
    expect(room.roomName).toHaveLength(20);
    expect(room.maxPlayers).toBe(2);
    expect(room.isPrivate).toBe(true);
    expect(room.hostId).toBe("");
    expect(room.participantIds).toEqual(["a", "b"]);
    expect(sanitizeRoom({ ...emptyRoom(), maxPlayers: 99 }).maxPlayers).toBe(8);
  });

  it("drops malformed system messages and keeps the last 30", () => {
    const valid = Array.from({ length: 35 }, (_, i) => ({
      id: `s${i}`,
      kind: "host" as const,
      text: `host ${i}`,
      at: NOW + i,
    }));
    const broken = { id: "x", kind: "nope", text: "x", at: NOW } as unknown as RoomState["system"][number];
    const room = sanitizeRoom({ ...emptyRoom(), system: [broken, ...valid] });
    expect(room.system).toHaveLength(30);
    expect(room.system[0].id).toBe("s5");
  });

  it("dedupes and caps id lists", () => {
    const room = sanitizeRoom({ ...emptyRoom(), hunterIds: ["a", "a", "b", "c", "d"], caughtIds: ["x", "x"] });
    expect(room.hunterIds).toEqual(["a", "b", "c"]);
    expect(room.caughtIds).toEqual(["x"]);
  });
});

describe("patchRoom", () => {
  it("applies config patches only in the lobby", () => {
    const lobby = patchRoom(emptyRoom(), { mapId: "farm", hunterCount: 2 });
    expect(lobby.mapId).toBe("farm");
    expect(lobby.hunterCount).toBe(2);
    const hunting = patchRoom(huntRoom(), { mapId: "farm" });
    expect(hunting.mapId).toBe("mansion");
  });
});

describe("canStartRound", () => {
  it("needs a lobby with at least two ready players", () => {
    expect(canStartRound(emptyRoom(), [snap("a")])).toBe(false);
    expect(canStartRound(emptyRoom(), [snap("a"), snap("b", { ready: false })])).toBe(false);
    expect(canStartRound(emptyRoom(), [snap("a"), snap("b")])).toBe(true);
    expect(canStartRound(huntRoom(), [snap("a"), snap("b")])).toBe(false);
  });
});

describe("beginRound", () => {
  it("does nothing with fewer than two players", () => {
    const room = emptyRoom();
    expect(beginRound(room, ["a"], NOW)).toBe(room);
  });

  it("moves to prepare, bumps the round and assigns one hunter", () => {
    const room = beginRound(emptyRoom(), ["a", "b", "c"], NOW);
    expect(room.phase).toBe("prepare");
    expect(room.round).toBe(1);
    expect(room.phaseEndsAt).toBe(NOW + DEFAULT_PREPARE * 1000);
    expect(room.hunterIds).toHaveLength(1);
    expect(["a", "b", "c"]).toContain(room.hunterIds[0]);
    expect(room.caughtIds).toEqual([]);
    expect(Object.keys(room.scores).sort()).toEqual(["a", "b", "c"]);
  });

  it("respects a fixed human hunter", () => {
    const room = beginRound({ ...emptyRoom(), hunterMode: "human", hunterPlayerId: "b" }, ["a", "b", "c"], NOW);
    expect(room.hunterIds).toEqual(["b"]);
  });

  it("keeps the fixed player out of the hunter slot in ai mode", () => {
    for (let i = 0; i < 20; i++) {
      const room = beginRound({ ...emptyRoom(), hunterMode: "ai", hunterPlayerId: "b" }, ["a", "b", "c"], NOW);
      expect(room.hunterIds).not.toContain("b");
    }
  });

  it("loads ammo for hunters only when the option is on", () => {
    const off = beginRound(emptyRoom(), ["a", "b"], NOW);
    expect(off.ammo).toEqual({});
    const on = beginRound({ ...emptyRoom(), ammoEnabled: true, ammoCount: 5 }, ["a", "b"], NOW);
    expect(on.ammo[on.hunterIds[0]]).toBe(5);
  });
});

describe("roleOf / isHunter / hiderAlive", () => {
  it("treats everyone as spectator in the lobby", () => {
    expect(roleOf(emptyRoom(), "a")).toBe("spectator");
  });

  it("maps hunters, caught hiders and survivors in normal mode", () => {
    const room = huntRoom({ caughtIds: ["c"] });
    expect(roleOf(room, "h1")).toBe("hunter");
    expect(roleOf(room, "c")).toBe("spectator");
    expect(roleOf(room, "s")).toBe("hider");
    expect(hiderAlive(room, "s")).toBe(true);
    expect(hiderAlive(room, "c")).toBe(false);
    expect(hiderAlive(room, "h1")).toBe(false);
  });

  it("converts caught hiders into hunters in infection mode", () => {
    const room = huntRoom({ mode: "infection", caughtIds: ["c"] });
    expect(roleOf(room, "c")).toBe("hunter");
    expect(isHunter(room, "c")).toBe(true);
  });

  describe("B1: players who join after the round started", () => {
    const room = huntRoom({ participantIds: ["h1", "s1"] });

    it("are spectators and never counted as live hiders", () => {
      expect(isParticipant(room, "late")).toBe(false);
      expect(roleOf(room, "late")).toBe("spectator");
      expect(hiderAlive(room, "late")).toBe(false);
      expect(isHunter(room, "late")).toBe(false);
    });

    it("do not block a hunter win", () => {
      const players = [snap("h1"), snap("s1", { x: 2 }), snap("late", { x: 2.5 })];
      const { room: next } = processFire(room, players, "h1", "s1", NOW);
      expect(next.phase).toBe("reveal");
      expect(next.winner).toBe("hunters");
    });

    it("cannot be tagged", () => {
      const players = [snap("h1"), snap("s1", { x: 20 }), snap("late", { x: 2 })];
      const { room: next, tagged } = processFire(room, players, "h1", "late", NOW);
      expect(tagged).toBeUndefined();
      expect(next.caughtIds).toEqual([]);
    });

    it("earn no survival score", () => {
      const players = [snap("h1"), snap("s1"), snap("late")];
      const next = finishRound(room, "hiders", players, NOW);
      expect(next.scores).toEqual({ s1: SCORE_SURVIVE });
    });

    it("are ghosts until the lobby returns", () => {
      expect(isGhost(room, "late")).toBe(true);
      expect(isGhost({ ...room, phase: "prepare" }, "late")).toBe(true);
      expect(isGhost({ ...room, phase: "reveal" }, "late")).toBe(true);
      expect(isGhost({ ...room, phase: "lobby" }, "late")).toBe(false);
      expect(isGhost(room, "s1")).toBe(false);
    });

    it("become participants when the next round begins", () => {
      const next = beginRound({ ...room, phase: "lobby" }, ["h1", "s1", "late"], NOW);
      expect(next.participantIds.sort()).toEqual(["h1", "late", "s1"]);
      expect(roleOf(next, "late")).not.toBe("spectator");
    });
  });

  it("marks caught hiders as ghosts only during the hunt in normal mode", () => {
    const room = huntRoom({ caughtIds: ["c"] });
    expect(isGhost(room, "c")).toBe(true);
    expect(isGhost({ ...room, phase: "reveal" }, "c")).toBe(false);
    expect(isGhost({ ...room, mode: "infection" }, "c")).toBe(false);
    expect(isGhost(room, "h1")).toBe(false);
  });

  it("treats everyone in the lobby as a participant-to-be", () => {
    expect(isParticipant(emptyRoom(), "anyone")).toBe(true);
  });
});

describe("processFire", () => {
  const players = [snap("h1", { x: 0, z: 0 }), snap("t1", { x: 3, z: 0 }), snap("t2", { x: 30, z: 0 })];

  it("ignores shots outside the hunt phase or from non-hunters", () => {
    const lobby = emptyRoom();
    expect(processFire(lobby, players, "h1", "t1", NOW).room).toBe(lobby);
    const room = huntRoom();
    expect(processFire(room, players, "t1", "t2", NOW).room).toBe(room);
  });

  it("tags a hider inside tag range and awards the hunter", () => {
    const { room, tagged } = processFire(huntRoom(), players, "h1", "t1", NOW);
    expect(tagged?.id).toBe("t1");
    expect(room.caughtIds).toEqual(["t1"]);
    expect(room.scores.h1).toBe(SCORE_TAG);
    expect(room.feed).toHaveLength(1);
    expect(room.lastTag?.id).toBe("t1");
    expect(room.phase).toBe("hunt");
  });

  it("misses when the target is out of range or out of sight", () => {
    const far = processFire(huntRoom(), players, "h1", "t2", NOW);
    expect(far.tagged).toBeUndefined();
    expect(far.room.caughtIds).toEqual([]);
    const blocked = processFire(huntRoom(), players, "h1", "t1", NOW, false);
    expect(blocked.tagged).toBeUndefined();
  });

  it("shrinks tag range with camouflage", () => {
    const edge = TAG_RANGE * (1 - 0.32) + 0.1;
    const camo = [snap("h1"), snap("t1", { x: edge, z: 0, camoScore: 100 })];
    expect(processFire(huntRoom(), camo, "h1", "t1", NOW).tagged).toBeUndefined();
    const plain = [snap("h1"), snap("t1", { x: edge, z: 0, camoScore: 0 })];
    expect(processFire(huntRoom(), plain, "h1", "t1", NOW).tagged?.id).toBe("t1");
  });

  it("consumes ammo on every shot", () => {
    const room = huntRoom({ ammoEnabled: true, ammoCount: 3, ammo: { h1: 2 } });
    const { room: next } = processFire(room, players, "h1", "", NOW);
    expect(next.ammo.h1).toBe(1);
    expect(next.phase).toBe("hunt");
  });

  it("reports an empty magazine without changing the room", () => {
    const room = huntRoom({ ammoEnabled: true, ammoCount: 3, ammo: { h1: 0 } });
    const result = processFire(room, players, "h1", "t1", NOW);
    expect(result.empty).toBe(true);
    expect(result.room).toBe(room);
  });

  it("ends the round for hunters when the last hider is caught", () => {
    const two = [snap("h1"), snap("t1", { x: 2 })];
    const { room } = processFire(huntRoom(), two, "h1", "t1", NOW);
    expect(room.phase).toBe("reveal");
    expect(room.winner).toBe("hunters");
    expect(room.scores.h1).toBe(SCORE_TAG + SCORE_HUNT_WIN);
  });

  it("ends the round for hiders when every hunter runs dry", () => {
    const room = huntRoom({ ammoEnabled: true, ammoCount: 3, ammo: { h1: 1 } });
    const { room: next } = processFire(room, players, "h1", "", NOW);
    expect(next.phase).toBe("reveal");
    expect(next.winner).toBe("hiders");
    expect(next.scores.t1).toBe(SCORE_SURVIVE);
    expect(next.scores.t2).toBe(SCORE_SURVIVE);
  });

  it("hands ammo to a newly infected hunter", () => {
    const room = huntRoom({ mode: "infection", ammoEnabled: true, ammoCount: 4, ammo: { h1: 4 } });
    const { room: next } = processFire(room, players, "h1", "t1", NOW);
    expect(next.ammo.t1).toBe(4);
    expect(isHunter(next, "t1")).toBe(true);
  });
});

describe("finishRound", () => {
  it("awards survivors on a hider win and hunters on a hunter win", () => {
    const players = [snap("h1"), snap("s1"), snap("c1")];
    const room = huntRoom({ caughtIds: ["c1"] });
    const hiders = finishRound(room, "hiders", players, NOW);
    expect(hiders.scores).toEqual({ s1: SCORE_SURVIVE });
    expect(hiders.phaseEndsAt).toBe(NOW + REVEAL_TIME * 1000);
    const hunters = finishRound(room, "hunters", players, NOW);
    expect(hunters.scores).toEqual({ h1: SCORE_HUNT_WIN });
  });
});

describe("tickRoom", () => {
  const players = [snap("h1"), snap("s1")];

  it("advances prepare -> hide -> hunt on timers", () => {
    const prepare = { ...huntRoom(), phase: "prepare" as const, phaseEndsAt: NOW };
    const hide = tickRoom(prepare, players, NOW);
    expect(hide.phase).toBe("hide");
    expect(hide.phaseEndsAt).toBe(NOW + hide.hideTime * 1000);
    const hunt = tickRoom({ ...hide, phaseEndsAt: NOW }, players, NOW);
    expect(hunt.phase).toBe("hunt");
    expect(hunt.phaseEndsAt).toBe(NOW + hunt.huntTime * 1000);
  });

  it("gives hiders the win when the hunt timer expires with survivors", () => {
    const room = tickRoom(huntRoom({ phaseEndsAt: NOW }), players, NOW);
    expect(room.phase).toBe("reveal");
    expect(room.winner).toBe("hiders");
  });

  it("gives hiders the win immediately when every hunter has left", () => {
    const room = tickRoom(huntRoom(), [snap("s1")], NOW);
    expect(room.phase).toBe("reveal");
    expect(room.winner).toBe("hiders");
  });

  it("gives hunters the win when no live hider remains", () => {
    const room = tickRoom(huntRoom({ caughtIds: ["s1"] }), players, NOW);
    expect(room.winner).toBe("hunters");
  });

  it("walks reveal -> result -> lobby and clears round-scoped state (B6)", () => {
    const reveal = huntRoom({
      phase: "reveal",
      phaseEndsAt: NOW,
      winner: "hiders",
      caughtIds: ["s1"],
      ammo: { h1: 2 },
      doors: { d1: true },
      lastTag: { id: "s1", by: "h1", name: "s1", byName: "h1", at: NOW },
      feed: [{ id: "s1", by: "h1", name: "s1", byName: "h1", at: NOW }],
      taunts: [{ id: "s1", x: 0, y: 0, at: NOW }],
      scores: { h1: 10 },
    });
    const result = tickRoom(reveal, players, NOW);
    expect(result.phase).toBe("result");
    const lobby = tickRoom({ ...result, phaseEndsAt: NOW }, players, NOW);
    expect(lobby.phase).toBe("lobby");
    expect(lobby.hunterIds).toEqual([]);
    expect(lobby.caughtIds).toEqual([]);
    expect(lobby.participantIds).toEqual([]);
    expect(lobby.winner).toBeUndefined();
    expect(lobby.ammo).toEqual({});
    expect(lobby.doors).toEqual({});
    expect(lobby.lastTag).toBeUndefined();
    expect(lobby.feed).toEqual([]);
    expect(lobby.taunts).toEqual([]);
    expect(lobby.scores).toEqual({ h1: 10 });
  });

  it("prunes expired taunts without touching anything else", () => {
    const room = huntRoom({
      taunts: [
        { id: "a", x: 0, y: 0, at: NOW - 5000 },
        { id: "b", x: 0, y: 0, at: NOW - 100 },
      ],
    });
    const next = tickRoom(room, players, NOW);
    expect(next.taunts.map((t) => t.id)).toEqual(["b"]);
    expect(next.phase).toBe("hunt");
  });

  it("returns the same object when nothing changes", () => {
    const room = huntRoom();
    expect(tickRoom(room, players, NOW)).toBe(room);
  });
});

describe("reconcileRoomPlayers", () => {
  it("drops ids that are no longer present", () => {
    const room = huntRoom({ hunterIds: ["h1", "gone"], caughtIds: ["gone"], ammo: { h1: 2, gone: 1 } });
    const next = reconcileRoomPlayers(room, [snap("h1"), snap("s1")]);
    expect(next.hunterIds).toEqual(["h1"]);
    expect(next.caughtIds).toEqual([]);
    expect(next.ammo).toEqual({ h1: 2 });
  });

  it("returns the same object when everyone is present", () => {
    const room = huntRoom({ ammo: { h1: DEFAULT_AMMO } });
    expect(reconcileRoomPlayers(room, [snap("h1"), snap("s1")])).toBe(room);
  });
});

describe("claimHost", () => {
  it("records the first host without announcing a takeover", () => {
    const room = claimHost(emptyRoom(), "p1", "민수", NOW);
    expect(room.hostId).toBe("p1");
    expect(room.hostName).toBe("민수");
    expect(room.system).toEqual([]);
  });

  it("announces a host change with a system message", () => {
    const first = claimHost(emptyRoom(), "p1", "민수", NOW);
    const second = claimHost(first, "p2", "지우", NOW + 1);
    expect(second.hostId).toBe("p2");
    expect(second.system).toHaveLength(1);
    expect(second.system[0]).toMatchObject({ kind: "host", at: NOW + 1 });
    expect(second.system[0].text).toContain("지우");
  });

  it("returns the same object when the host is unchanged", () => {
    const room = claimHost(emptyRoom(), "p1", "민수", NOW);
    expect(claimHost(room, "p1", "민수", NOW + 5)).toBe(room);
  });

  it("keeps only the newest system messages", () => {
    let room = emptyRoom();
    for (let i = 0; i < 40; i++) room = claimHost(room, `p${i}`, `n${i}`, NOW + i);
    expect(room.system).toHaveLength(30);
    expect(room.system.at(-1)?.text).toContain("n39");
  });
});

describe("remaining", () => {
  it("rounds up to whole seconds and never goes negative", () => {
    expect(remaining({ ...emptyRoom(), phaseEndsAt: NOW + 1500 }, NOW)).toBe(2);
    expect(remaining({ ...emptyRoom(), phaseEndsAt: NOW - 10 }, NOW)).toBe(0);
  });
});
