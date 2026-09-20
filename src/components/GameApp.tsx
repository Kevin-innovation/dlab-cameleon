"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_NAME, CHANNELS, DEFAULT_AMMO, DEFAULT_CHANNEL_ID, MAX_PLAYERS, NICK_KEY, SCORE_HUNT_WIN, SCORE_SURVIVE, SCORE_TAG } from "@/lib/config";
import { MAPS } from "@/lib/maps";
import { requestMobileLandscape } from "@/lib/mobile";
import { generateRoomCode, parseRoomCode } from "@/lib/rooms/code";
import { fetchRoom } from "@/lib/rooms/client";
import { hasOpenSlot, type RoomListing } from "@/lib/rooms/listing";
import { connectOnline, createPractice, readLeaveRecord, type RoomMeta, type Session } from "@/lib/session";
import { AccessibleModal } from "./AccessibleModal";
import { GameView } from "./GameView";
import { CreateRoomModal, type CreateRoomInput } from "./screens/CreateRoomModal";
import { Home } from "./screens/Home";
import { JoinByCodeModal } from "./screens/JoinByCodeModal";
import { RoomBrowser } from "./screens/RoomBrowser";
import { useRoomList } from "./screens/useRoomList";

type Screen =
  | { t: "home" }
  | { t: "rooms" }
  | { t: "connecting"; label: string }
  | { t: "play" }
  | { t: "practice" };

type Modal = "none" | "create" | "code";

const CHANNEL = CHANNELS[0];
const CONNECT_TIMEOUT_MS = 15000;

function readStoredNickname() {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(NICK_KEY) ?? window.localStorage.getItem(NICK_KEY) ?? "";
  } catch {
    try {
      return window.localStorage.getItem(NICK_KEY) ?? "";
    } catch {
      return "";
    }
  }
}

function storeNickname(name: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(NICK_KEY, name);
  } catch {
    // iOS private browsing and embedded browsers can deny session storage.
  }
  try {
    window.localStorage.setItem(NICK_KEY, name);
  } catch {
    // Nickname persistence is optional and must not block a room join.
  }
}

/** Playroom keeps `#r=CODE` in the URL while in a room; a reload lands here with it. */
function roomCodeFromHash() {
  if (typeof window === "undefined") return null;
  return parseRoomCode(window.location.hash);
}

function clearRoomHash() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("CONNECT_TIMEOUT")), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        window.clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

function describeConnectError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("ROOM_LIMIT") || msg.includes("full")) return `방이 가득 찼습니다 (최대 ${MAX_PLAYERS}인). 다른 방을 골라 주세요.`;
  if (msg === "CONNECT_TIMEOUT") return "서버 응답이 늦습니다. 네트워크를 확인하고 다시 입장해 주세요.";
  if (/SecurityError|QuotaExceeded|storage/i.test(msg)) return "브라우저 저장소 접근이 제한되어 있습니다. Safari 설정을 확인한 뒤 다시 시도해 주세요.";
  return "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function validNickname(raw: string) {
  const name = raw.trim().slice(0, 12);
  return name.length >= 2 ? name : null;
}

type ConnectTarget = { roomCode: string; maxPlayers: number; meta?: Partial<RoomMeta>; label: string };

type LeaveNotice = { notice: string; rejoinCode: string };
let leaveNoticeCache: LeaveNotice | null = null;

/**
 * A kick or a lost connection redirects here with a record. Reading it consumes it,
 * and StrictMode invokes state initializers twice, so the first read is memoized.
 */
function readLeaveNotice(): LeaveNotice {
  if (typeof window === "undefined") return { notice: "", rejoinCode: "" };
  if (leaveNoticeCache) return leaveNoticeCache;
  leaveNoticeCache = computeLeaveNotice();
  return leaveNoticeCache;
}

function computeLeaveNotice(): LeaveNotice {
  const left = readLeaveRecord();
  if (!left) return { notice: "", rejoinCode: "" };
  clearRoomHash();
  if (left.reason === "kicked") return { notice: "방장이 당신을 방에서 내보냈습니다.", rejoinCode: "" };
  return { notice: "방과의 연결이 끊겼습니다. 네트워크를 확인한 뒤 다시 입장할 수 있습니다.", rejoinCode: left.code };
}

export default function GameApp() {
  const [nick, setNick] = useState(readStoredNickname);
  const [screen, setScreen] = useState<Screen>({ t: "home" });
  const [modal, setModal] = useState<Modal>("none");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [leaveNotice] = useState(readLeaveNotice);
  const [notice, setNotice] = useState(leaveNotice.notice);
  const [rejoinCode, setRejoinCode] = useState(leaveNotice.rejoinCode);
  const [busy, setBusy] = useState(false);
  const [howto, setHowto] = useState(false);
  const reconnectAttempted = useRef(false);
  const roomList = useRoomList(DEFAULT_CHANNEL_ID, screen.t === "rooms");

  const connect = useCallback(
    async (name: string, target: ConnectTarget) => {
      setError("");
      setBusy(true);
      setScreen({ t: "connecting", label: target.label });
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setError("인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
        setScreen({ t: "rooms" });
        setBusy(false);
        return;
      }
      void requestMobileLandscape().catch(() => false);
      try {
        const s = await withTimeout(
          connectOnline({ roomCode: target.roomCode, nickname: name, maxPlayers: target.maxPlayers, meta: target.meta }),
          CONNECT_TIMEOUT_MS,
        );
        setSession(s);
        setModal("none");
        setScreen({ t: "play" });
      } catch (e) {
        setError(describeConnectError(e));
        clearRoomHash();
        setScreen({ t: "rooms" });
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // Reload inside a room: rejoin the same code within Playroom's reconnect grace period.
  // A kick or a lost connection lands here too; then we explain instead of auto-rejoining.
  useEffect(() => {
    if (reconnectAttempted.current) return;
    reconnectAttempted.current = true;
    if (leaveNotice.notice) return;
    const code = roomCodeFromHash();
    if (!code) return;
    const saved = validNickname(readStoredNickname());
    if (!saved) {
      clearRoomHash();
      return;
    }
    window.setTimeout(() => void connect(saved, { roomCode: code, maxPlayers: MAX_PLAYERS, label: "이전 방으로 돌아가는 중" }), 0);
  }, [connect, leaveNotice.notice]);

  const requireNick = () => {
    const name = validNickname(nick);
    if (!name) {
      setError("닉네임은 2~12자로 입력해 주세요.");
      return null;
    }
    storeNickname(name);
    setNick(name);
    setError("");
    return name;
  };

  const enterRooms = () => {
    if (!requireNick()) return;
    setNotice("");
    setRejoinCode("");
    setScreen({ t: "rooms" });
  };

  const rejoin = () => {
    const name = requireNick();
    if (!name || !rejoinCode) return;
    const code = rejoinCode;
    setNotice("");
    setRejoinCode("");
    void connect(name, { roomCode: code, maxPlayers: MAX_PLAYERS, label: "이전 방으로 돌아가는 중" });
  };

  const startPractice = () => {
    const name = requireNick();
    if (!name) return;
    void requestMobileLandscape().catch(() => false);
    setSession(createPractice(name));
    setScreen({ t: "practice" });
  };

  const joinListing = (room: RoomListing) => {
    const name = requireNick();
    if (!name) return;
    void connect(name, { roomCode: room.code, maxPlayers: room.maxPlayers, label: `${room.name}에 입장하는 중` });
  };

  const createRoom = (input: CreateRoomInput) => {
    const name = requireNick();
    if (!name) return;
    const meta: RoomMeta = { ...input, channelId: DEFAULT_CHANNEL_ID };
    void connect(name, { roomCode: generateRoomCode(DEFAULT_CHANNEL_ID), maxPlayers: input.maxPlayers, meta, label: "방을 만드는 중" });
  };

  const quickJoin = () => {
    const open = roomList.rooms.find((room) => room.phase === "lobby" && hasOpenSlot(room));
    if (open) {
      joinListing(open);
      return;
    }
    createRoom({ roomName: `${nick.trim()}의 방`, maxPlayers: MAX_PLAYERS, isPrivate: false });
  };

  const joinByCode = async (code: string) => {
    const name = requireNick();
    if (!name) return;
    setBusy(true);
    setError("");
    const lookup = await fetchRoom(code);
    setBusy(false);
    if (lookup.ok) {
      const room = lookup.value.room;
      if (!hasOpenSlot(room)) {
        setError(`${room.name}은(는) 가득 찼습니다 (${room.players}/${room.maxPlayers}).`);
        return;
      }
      void connect(name, { roomCode: room.code, maxPlayers: room.maxPlayers, label: `${room.name}에 입장하는 중` });
      return;
    }
    if (lookup.status === 404) {
      setError("그 코드의 방을 찾을 수 없습니다. 코드를 다시 확인해 주세요.");
      return;
    }
    // Directory unreachable: still try the code directly so a friend's room stays joinable.
    void connect(name, { roomCode: code, maxPlayers: MAX_PLAYERS, label: `${code} 방에 입장하는 중` });
  };

  if ((screen.t === "play" || screen.t === "practice") && session) {
    return (
      <GameView
        session={session}
        serverName={screen.t === "practice" ? "AI 매치" : CHANNEL.name}
        roomLabel={screen.t === "practice" ? "호스트 + AI 7인" : `코드 ${session.roomCode}`}
      />
    );
  }

  return (
    <div className="safe-screen relative min-h-dvh overflow-x-hidden bg-moss text-paper">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-lime focus:px-3 focus:py-2 focus:text-sm focus:text-black"
      >
        본문으로 건너뛰기
      </a>
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "url(/hero.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-moss/70 via-moss/85 to-[#070b08]" />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6">
        <header className="flex items-center justify-between">
          <button type="button" onClick={() => setScreen({ t: "home" })} className="flex items-center gap-3">
            <Image src="/mascot.jpg" alt="" width={48} height={48} className="h-12 w-12 rounded-2xl object-cover ring-2 ring-lime/60" />
            <div>
              <div className="font-display text-2xl leading-none">{APP_NAME}</div>
              <div className="text-[11px] tracking-wide text-lime/80">몸에 색을 칠해 숨는다</div>
            </div>
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={howto}
            onClick={() => setHowto(true)}
            className="h-10 rounded-full border border-lime/40 bg-black/30 px-4 text-sm font-semibold text-lime transition hover:border-lime hover:bg-lime/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime active:scale-95"
          >
            카멜론 룰
          </button>
        </header>

        {screen.t === "home" && (
          <Home
            nick={nick}
            setNick={setNick}
            error={error}
            notice={notice}
            rejoinCode={rejoinCode}
            onRejoin={rejoin}
            onEnter={enterRooms}
            onPractice={startPractice}
          />
        )}
        {screen.t === "rooms" && (
          <RoomBrowser
            channelName={CHANNEL.name}
            list={roomList}
            busy={busy}
            error={error}
            onRefresh={roomList.refresh}
            onJoin={joinListing}
            onQuickJoin={quickJoin}
            onCreate={() => {
              setError("");
              setModal("create");
            }}
            onJoinByCode={() => {
              setError("");
              setModal("code");
            }}
            onBack={() => setScreen({ t: "home" })}
          />
        )}
        {screen.t === "connecting" && (
          <div className="flex flex-1 flex-col items-center justify-center" role="status" aria-live="polite" aria-busy="true">
            <Image src="/mascot.jpg" alt="" width={96} height={96} priority className="h-24 w-24 animate-pulse rounded-3xl object-cover" />
            <p className="mt-4 font-display text-2xl">{screen.label}…</p>
            <p className="text-white/60">{CHANNEL.name}에 접속하고 있습니다</p>
          </div>
        )}
      </div>

      {modal === "create" && <CreateRoomModal nick={nick.trim()} busy={busy} onClose={() => setModal("none")} onCreate={createRoom} />}
      {modal === "code" && (
        <JoinByCodeModal busy={busy} error={error} onClose={() => setModal("none")} onJoin={(code) => void joinByCode(code)} />
      )}
      {howto && <HowTo onClose={() => setHowto(false)} />}
    </div>
  );
}

const HOWTO_STEPS: { icon: string; title: string; body: string; accent: string }[] = [
  { icon: "🎰", title: "술래 뽑기", body: "모두 한자리에 모이면 룰렛이 술래를 정해요.", accent: "from-pink/30 to-pink/5" },
  { icon: "🎨", title: "몸 칠하기", body: "스포이드로 벽·가구 색을 찍고 몸에 발라요. 자세와 몸 크기로 실루엣까지 맞추면 완벽!", accent: "from-lime/30 to-lime/5" },
  { icon: "🔦", title: "수색", body: "술래는 1인칭으로 돌아다니며 어색한 곳을 조준해 찾아내요. 카멜레온은 휘파람으로 속일 수 있어요.", accent: "from-sky-300/30 to-sky-300/5" },
  { icon: "🏆", title: "승리", body: "시간 안에 전원 발견되면 술래 승! 한 명이라도 남으면 카멜레온 승!", accent: "from-amber-300/30 to-amber-300/5" },
];

const HOWTO_KEYS: { key: string; label: string }[] = [
  { key: "WASD", label: "이동" },
  { key: "F", label: "페인트" },
  { key: "1~0 -", label: "자세" },
  { key: "Space", label: "벽 붙기" },
  { key: "E / Q", label: "오르기 · 내려가기" },
  { key: "T", label: "휘파람" },
  { key: "V", label: "관전" },
  { key: "Tab", label: "현황" },
];

function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <AccessibleModal titleId="howto-title" onClose={onClose} panelClassName="max-h-[90dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-3xl bg-[#142019] p-6 shadow-2xl">
      <div className="flex items-center gap-3">
        <Image src="/mascot.jpg" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl object-cover ring-2 ring-lime/60" />
        <div>
          <h2 id="howto-title" className="font-display text-3xl leading-none">카멜론 룰</h2>
          <p className="mt-1 text-sm text-lime/90">하얀 몸에 색을 칠해 배경이 되자 — 술래를 속이면 이긴다!</p>
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="게임 순서">
        {HOWTO_STEPS.map((step, index) => (
          <li key={step.title} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${step.accent} p-4`}>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-black/50 font-display text-sm text-lime" aria-hidden="true">{index + 1}</span>
              <span className="text-2xl" aria-hidden="true">{step.icon}</span>
              <span className="font-display text-lg">{step.title}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/85">{step.body}</p>
          </li>
        ))}
      </ol>

      <section className="mt-4 rounded-2xl bg-black/30 p-4" aria-labelledby="howto-keys">
        <h3 id="howto-keys" className="text-xs font-semibold tracking-wide text-white/60">조작 (PC)</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {HOWTO_KEYS.map((entry) => (
            <li key={entry.key} className="flex items-center gap-1.5 rounded-lg bg-white/8 px-2 py-1 text-xs">
              <kbd className="rounded-md border border-lime/50 bg-black/60 px-1.5 py-0.5 font-mono text-[11px] font-bold text-lime">{entry.key}</kbd>
              <span className="text-white/85">{entry.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-white/55">모바일은 가로 화면에서 왼쪽 조이스틱 · 오른쪽 시야 패드 · 화면 버튼을 써요.</p>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4" aria-label="점수">
        {[
          ["발견", `+${SCORE_TAG}`],
          ["생존", `+${SCORE_SURVIVE}`],
          ["술래 승리", `+${SCORE_HUNT_WIN}`],
          ["눈앞에서 속이기", "초당 최대 10"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white/6 px-2 py-2">
            <div className="font-display text-lg text-lime">{value}</div>
            <div className="text-[11px] text-white/65">{label}</div>
          </div>
        ))}
      </section>

      <p className="mt-3 text-center text-xs text-white/55">
        탄약 제한(기본 {DEFAULT_AMMO}발: 빗나가면 −1, 맞히면 +1)과 감염 모드는 방 옵션 · 맵 {MAPS.map((m) => m.name).join(" / ")}
      </p>

      <button type="button" onClick={onClose} className="mt-5 h-12 w-full rounded-full bg-lime font-display text-lg text-black transition hover:brightness-110 active:scale-[0.98]">
        알겠어요, 해볼게요!
      </button>
    </AccessibleModal>
  );
}
