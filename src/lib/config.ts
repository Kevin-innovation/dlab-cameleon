export const APP_NAME = "카멜론";
export const MAX_PLAYERS = 8;
export const ROOMS_PER_SERVER = 8;
export const PLAYER_SPEED = 240;
export const SNEAK_SPEED = 110;
export const PAINT_SPEED = 90;
export const TAG_RADIUS = 28;
export const TAG_RANGE = 170;
export const SHOT_COOLDOWN = 700;
export const TAUNT_COOLDOWN = 8000;
export const FORCED_TAUNT = 22000;
export const MAX_BLOBS = 70;
export const SYNC_HZ = 14;
export const DEFAULT_HIDE = 70;
export const DEFAULT_HUNT = 150;
export const WHITE = "#f3f1ea";

export const SERVERS = [
  { id: "kr1", name: "한국 1", city: "서울", ping: "9ms", flavor: "제일 붐빔" },
  { id: "kr2", name: "한국 2", city: "부산", ping: "14ms", flavor: "대기 짧음" },
  { id: "jp1", name: "일본", city: "오사카", ping: "38ms", flavor: "원정 서버" },
  { id: "as1", name: "아시아", city: "싱가포르", ping: "72ms", flavor: "국제전" },
  { id: "us1", name: "미주", city: "LA", ping: "160ms", flavor: "심야 인원" },
] as const;

export type ServerId = (typeof SERVERS)[number]["id"];

export function makeRoomCode(serverId: string, roomIndex: number) {
  const raw = `DLABCM${serverId}${roomIndex}`.toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

export const NICK_KEY = "camelon-nick";
