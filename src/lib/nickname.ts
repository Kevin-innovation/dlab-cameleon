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

const NICK_ADJECTIVES = ["초록", "노란", "빨간", "파란", "보라", "분홍", "은빛", "졸린", "조용한", "재빠른", "수줍은", "용감한"];
const NICK_NOUNS = ["커튼", "소파", "벽지", "카펫", "책장", "화분", "타일", "파이프", "건초", "액자", "램프", "상자"];

/** A playful room-safe nickname such as "초록커튼"; `random` defaults to Math.random for tests. */
export function randomNickname(random: () => number = Math.random): string {
  const pick = <T,>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  return `${pick(NICK_ADJECTIVES)}${pick(NICK_NOUNS)}`.slice(0, NICKNAME_MAX);
}

