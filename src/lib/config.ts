export const APP_NAME = "카멜론";
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const ROOM_NAME_MAX = 20;
/** Heartbeat cadence and TTL are tuned to stay inside the Upstash free tier (500K commands/month). */
export const DIRECTORY_HEARTBEAT_MS = 10000;
export const DIRECTORY_TTL_S = 25;
export const DIRECTORY_POLL_MS = 5000;
export const RECONNECT_GRACE_MS = 20000;
/** Chat/system retention keeps the synced room state a few KB in practice (≤ ~24KB worst case). */
export const CHAT_MESSAGE_MAX = 32;
export const CHAT_TEXT_MAX = 100;
export const SYSTEM_MESSAGE_MAX = 20;
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
/** Original rules: 5 rounds, miss -1, hit +1, shots at a running hider are free. */
export const DEFAULT_AMMO = 5;
export const AMMO_MIN = 1;
export const AMMO_MAX = 99;
export const TAUNT_COOLDOWN = 5000;
/** Host-adjustable forced taunt interval (seconds). */
export const DEFAULT_FORCED_TAUNT_SEC = 45;
export const FORCED_TAUNT_MIN_SEC = 15;
export const FORCED_TAUNT_MAX_SEC = 90;
export const MAX_BLOBS = 140;
export const SYNC_HZ = 14;
export const DEFAULT_PREPARE = 8;
export const DEFAULT_HIDE = 60;
export const DEFAULT_HUNT = 180;
export const REVEAL_TIME = 30;
export const WHITE = "#f3f1ea";
export const SCORE_TAG = 80;
/** Survival pays less now that Missed Spot points reward fooling the hunter up close. */
export const SCORE_SURVIVE = 60;
export const MISSED_FLUSH_MS = 3000;
export const MISSED_SHOWN_MS = 30000;
export const SCORE_HUNT_WIN = 40;


export const NICK_KEY = "camelon-nick";
export const LEAVE_REASON_KEY = "camelon-leave";

export const BOT_NAMES = ["미호", "준혁", "하늘", "소윤", "태민", "리안", "고은"];
