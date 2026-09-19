import { describe, expect, it } from "vitest";
import { uniqueNickname } from "../nickname";

describe("uniqueNickname", () => {
  it("keeps a name nobody else uses", () => {
    expect(uniqueNickname("미호", ["준혁", "하늘"])).toBe("미호");
  });

  it("appends the lowest free suffix", () => {
    expect(uniqueNickname("미호", ["미호"])).toBe("미호#2");
    expect(uniqueNickname("미호", ["미호", "미호#2"])).toBe("미호#3");
    expect(uniqueNickname("미호", ["미호", "미호#3"])).toBe("미호#2");
  });

  it("compares case- and whitespace-insensitively", () => {
    expect(uniqueNickname("Miho", [" miho "])).toBe("Miho#2");
  });

  it("trims the base so the suffix still fits the limit", () => {
    const long = "열두글자짜리닉네임이다";
    expect(long).toHaveLength(11);
    expect(uniqueNickname(long, [long], 12)).toBe("열두글자짜리닉네임이#2");
    expect(uniqueNickname(long, [long], 12)).toHaveLength(12);
  });

  it("falls back to 손님 for an empty base", () => {
    expect(uniqueNickname("   ", [])).toBe("손님");
  });
});
