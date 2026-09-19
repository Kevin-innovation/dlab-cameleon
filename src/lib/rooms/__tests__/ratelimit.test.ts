import { describe, expect, it } from "vitest";
import { clientKeyFromHeaders, MemoryRateLimiter } from "../ratelimit";

const NOW = 1_700_000_000_000;

describe("MemoryRateLimiter", () => {
  it("allows up to the limit inside a window and rejects after", () => {
    const limiter = new MemoryRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.hit("ip-a", NOW)).toEqual({ allowed: true, remaining: 2 });
    expect(limiter.hit("ip-a", NOW + 1)).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.hit("ip-a", NOW + 2)).toEqual({ allowed: true, remaining: 0 });
    expect(limiter.hit("ip-a", NOW + 3).allowed).toBe(false);
  });

  it("keeps keys independent", () => {
    const limiter = new MemoryRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.hit("ip-a", NOW).allowed).toBe(true);
    expect(limiter.hit("ip-b", NOW).allowed).toBe(true);
    expect(limiter.hit("ip-a", NOW).allowed).toBe(false);
  });

  it("resets once the window has passed", () => {
    const limiter = new MemoryRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.hit("ip-a", NOW).allowed).toBe(true);
    expect(limiter.hit("ip-a", NOW + 999).allowed).toBe(false);
    expect(limiter.hit("ip-a", NOW + 1_000).allowed).toBe(true);
  });

  it("evicts stale keys so memory stays bounded", () => {
    const limiter = new MemoryRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2 });
    limiter.hit("a", NOW);
    limiter.hit("b", NOW);
    limiter.hit("c", NOW + 2_000);
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });
});

describe("clientKeyFromHeaders", () => {
  it("prefers the first x-forwarded-for entry, then x-real-ip, then a fallback", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});
