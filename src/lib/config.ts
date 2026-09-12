export const APP_NAME = "카멜론";
export const MAX_PLAYERS = 10;
export const ROOMS_PER_SERVER = 8;
export const PLAYER_SPEED = 5.6;
export const RUN_SPEED = 9.4;
export const SNEAK_SPEED = 3.2;
export const PAINT_SPEED = 2.0;
export const JUMP_SPEED = 8.4;
export const GRAVITY = 22;
export const PLAYER_RADIUS = 0.32;
export const LOOK_SENS = 0.003;
export const TAG_RANGE = 8;
export const SHOT_COOLDOWN = 900;
export const DEFAULT_AMMO = 6;
export const TAUNT_COOLDOWN = 8000;
export const FORCED_TAUNT = 22000;
export const MAX_BLOBS = 140;
export const SYNC_HZ = 14;
export const DEFAULT_HIDE = 60;
export const DEFAULT_HUNT = 180;
export const WHITE = "#f3f1ea";
export const SCORE_TAG = 80;
export const SCORE_SURVIVE = 150;
export const SCORE_HUNT_WIN = 40;

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

export const BOT_NAMES = ["미호", "준혁", "하늘", "소윤", "태민", "리안", "고은"];
