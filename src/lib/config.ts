export const APP_NAME = "카멜론";
export const MAX_PLAYERS = 8;
export const ROOMS_PER_SERVER = 1;
export const DEFAULT_SERVER_ID = "kr1";
export const DEFAULT_ROOM_NUMBER = 1;
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
export const REVEAL_TIME = 30;
export const WHITE = "#f3f1ea";
export const SCORE_TAG = 80;
export const SCORE_SURVIVE = 150;
export const SCORE_HUNT_WIN = 40;

export const SERVERS = [
  { id: DEFAULT_SERVER_ID, name: "한국 서버", city: "서울", ping: "9ms", flavor: "통합 플레이 룸" },
] as const;

export type ServerId = (typeof SERVERS)[number]["id"];

export function makeRoomCode(serverId: string, roomIndex: number) {
  const raw = `DLABCM${serverId}${roomIndex}`.toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

export const DEFAULT_ROOM_CODE = makeRoomCode(DEFAULT_SERVER_ID, DEFAULT_ROOM_NUMBER);

export const NICK_KEY = "camelon-nick";

export const BOT_NAMES = ["미호", "준혁", "하늘", "소윤", "태민", "리안", "고은"];
