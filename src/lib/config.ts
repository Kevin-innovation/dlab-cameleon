export const APP_NAME = "카멜론";
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const ROOM_NAME_MAX = 20;
/** Heartbeat cadence and TTL are tuned to stay inside the Upstash free tier (500K commands/month). */
export const DIRECTORY_HEARTBEAT_MS = 10000;
export const DIRECTORY_TTL_S = 25;
export const DIRECTORY_POLL_MS = 5000;
export const RECONNECT_GRACE_MS = 20000;
export const SYSTEM_MESSAGE_MAX = 30;
export const DEFAULT_CHANNEL_ID = "kr1";
export const CHANNELS = [{ id: DEFAULT_CHANNEL_ID, name: "한국 서버", city: "서울" }] as const;
export type ChannelId = (typeof CHANNELS)[number]["id"];

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
export const DEFAULT_PREPARE = 8;
export const DEFAULT_HIDE = 60;
export const DEFAULT_HUNT = 180;
export const REVEAL_TIME = 30;
export const WHITE = "#f3f1ea";
export const SCORE_TAG = 80;
export const SCORE_SURVIVE = 150;
export const SCORE_HUNT_WIN = 40;


export const NICK_KEY = "camelon-nick";
export const LEAVE_REASON_KEY = "camelon-leave";

export const BOT_NAMES = ["미호", "준혁", "하늘", "소윤", "태민", "리안", "고은"];
