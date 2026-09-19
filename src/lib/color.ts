/** Hex ↔ HSV helpers for the camouflage colour wheel. Hue 0‥360, s/v 0‥1. */

export type Hsv = { h: number; s: number; v: number };

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(hex: string): string | null {
  const m = HEX_RE.exec(hex.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

export function hexToHsv(hex: string): Hsv {
  const clean = normalizeHex(hex) ?? "#000000";
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const vv = Math.max(0, Math.min(1, v));
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  const [r, g, b] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export const RECENT_COLORS_MAX = 8;

/** Most-recent-first palette; re-picking a colour moves it to the front instead of duplicating it. */
export function pushRecentColor(recent: readonly string[], hex: string): string[] {
  const clean = normalizeHex(hex);
  if (!clean) return [...recent];
  return [clean, ...recent.filter((c) => c !== clean)].slice(0, RECENT_COLORS_MAX);
}
