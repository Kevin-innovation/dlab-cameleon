import { describe, expect, it } from "vitest";
import { generateRoomCode, isValidRoomCode, parseRoomCode, ROOM_CODE_ALPHABET } from "../code";

describe("generateRoomCode", () => {
  it("produces an 8-char uppercase code with the channel prefix", () => {
    const code = generateRoomCode("kr1");
    expect(code).toMatch(/^KR[A-Z2-9]{6}$/);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it("never uses ambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode("kr1");
      expect(code).not.toMatch(/[0O1IL]/);
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[0O1IL]/);
  });

  it("is practically unique", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateRoomCode("kr1")));
    expect(codes.size).toBe(500);
  });
});

describe("parseRoomCode", () => {
  it("accepts a bare code, lowercase, whitespace and a #r= hash", () => {
    expect(parseRoomCode("KR7F3K9Q")).toBe("KR7F3K9Q");
    expect(parseRoomCode("  kr7f3k9q ")).toBe("KR7F3K9Q");
    expect(parseRoomCode("#r=KR7F3K9Q")).toBe("KR7F3K9Q");
    expect(parseRoomCode("https://example.com/#r=kr7f3k9q")).toBe("KR7F3K9Q");
  });

  it("drops the extra leading R that Playroom adds to its own hash", () => {
    expect(parseRoomCode("#r=RKR7F3K9Q")).toBe("KR7F3K9Q");
    expect(parseRoomCode("https://example.com/#r=RKR7F3K9Q")).toBe("KR7F3K9Q");
    expect(parseRoomCode("RKR7F3K9Q")).toBe("RKR7F3K9Q");
  });

  it("strips separators people type between groups", () => {
    expect(parseRoomCode("KR7F-3K9Q")).toBe("KR7F3K9Q");
    expect(parseRoomCode("KR7F 3K9Q")).toBe("KR7F3K9Q");
  });

  it("rejects codes that are too short, too long or non-alphanumeric", () => {
    expect(parseRoomCode("")).toBeNull();
    expect(parseRoomCode("AB")).toBeNull();
    expect(parseRoomCode("A".repeat(17))).toBeNull();
    expect(parseRoomCode("한글코드")).toBeNull();
  });
});

describe("isValidRoomCode", () => {
  it("accepts 4-16 uppercase alphanumerics only", () => {
    expect(isValidRoomCode("ABCD")).toBe(true);
    expect(isValidRoomCode("DLABCMKR11")).toBe(true);
    expect(isValidRoomCode("abcd")).toBe(false);
    expect(isValidRoomCode("ABC")).toBe(false);
    expect(isValidRoomCode("A-BCD")).toBe(false);
  });
});
