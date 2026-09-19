/** Room codes: `{2-letter channel prefix}{6 random}`; ambiguous glyphs (0 O 1 I L) are excluded. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_RANDOM_LENGTH = 6;
const ROOM_CODE_MIN = 4;
const ROOM_CODE_MAX = 16;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

function randomIndices(count: number): number[] {
  const out: number[] = [];
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(count);
    cryptoApi.getRandomValues(bytes);
    for (const byte of bytes) out.push(byte % ROOM_CODE_ALPHABET.length);
    return out;
  }
  for (let i = 0; i < count; i++) out.push(Math.floor(Math.random() * ROOM_CODE_ALPHABET.length));
  return out;
}

function channelPrefix(channelId: string): string {
  const letters = channelId.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters || "RM").slice(0, 2).padEnd(2, "R");
}

export function generateRoomCode(channelId: string): string {
  const body = randomIndices(ROOM_CODE_RANDOM_LENGTH)
    .map((i) => ROOM_CODE_ALPHABET[i])
    .join("");
  return `${channelPrefix(channelId)}${body}`;
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}

/**
 * Accepts what people paste: lowercase, spaces/dashes, or a full URL with `#r=CODE`.
 * Playroom writes its own hash as `#r=R{code}` (one extra leading R), which is stripped here.
 */
export function parseRoomCode(input: string): string | null {
  const hashMatch = input.match(/#r=([^&\s]+)/i);
  const raw = hashMatch ? hashMatch[1].replace(/^R(?=[A-Za-z0-9]{4,})/, "") : input;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < ROOM_CODE_MIN || code.length > ROOM_CODE_MAX) return null;
  return isValidRoomCode(code) ? code : null;
}
