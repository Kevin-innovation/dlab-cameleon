export const NICKNAME_MAX = 12;
const FALLBACK = "손님";

function normalize(name: string) {
  return name.trim().toLowerCase();
}

/** Returns `base`, or `base#n` with the lowest n ≥ 2 that no one else in `taken` uses. */
export function uniqueNickname(base: string, taken: readonly string[], max: number = NICKNAME_MAX): string {
  const clean = base.trim().slice(0, max) || FALLBACK;
  const used = new Set(taken.map(normalize));
  if (!used.has(normalize(clean))) return clean;
  for (let n = 2; n < 100; n++) {
    const suffix = `#${n}`;
    const candidate = `${clean.slice(0, max - suffix.length)}${suffix}`;
    if (!used.has(normalize(candidate))) return candidate;
  }
  return `${clean.slice(0, max - 3)}#99`;
}
