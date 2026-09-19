import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, normalizeHex, pushRecentColor, RECENT_COLORS_MAX } from "@/lib/color";

describe("hex ↔ hsv", () => {
  it("round-trips primary and mixed colours", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#6b8f71", "#c9bfa8", "#000000", "#ffffff", "#123456"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("maps pure red to hue 0 with full saturation and value", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
  });

  it("treats grey as unsaturated", () => {
    const grey = hexToHsv("#808080");
    expect(grey.s).toBe(0);
    expect(grey.v).toBeCloseTo(0.502, 2);
  });

  it("wraps hue and clamps s/v", () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: -120, s: 2, v: 5 })).toBe("#0000ff");
  });

  it("normalizes hex input", () => {
    expect(normalizeHex(" ABCDEF ")).toBe("#abcdef");
    expect(normalizeHex("#abc")).toBeNull();
    expect(normalizeHex("blue")).toBeNull();
  });
});

describe("recent palette", () => {
  it("keeps most recent first without duplicates", () => {
    const a = pushRecentColor([], "#111111");
    const b = pushRecentColor(a, "#222222");
    const c = pushRecentColor(b, "#111111");
    expect(c).toEqual(["#111111", "#222222"]);
  });

  it("caps the palette length", () => {
    let recent: string[] = [];
    for (let i = 0; i < RECENT_COLORS_MAX + 3; i++) recent = pushRecentColor(recent, `#${String(i).padStart(6, "0")}`);
    expect(recent).toHaveLength(RECENT_COLORS_MAX);
    expect(recent[0]).toBe(`#${String(RECENT_COLORS_MAX + 2).padStart(6, "0")}`);
  });

  it("ignores invalid colours", () => {
    expect(pushRecentColor(["#111111"], "nope")).toEqual(["#111111"]);
  });
});
