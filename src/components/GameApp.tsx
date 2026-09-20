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

function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <AccessibleModal titleId="howto-title" onClose={onClose} panelClassName="max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl bg-[#142019] p-6 shadow-2xl">
      <h2 id="howto-title" className="text-wrap-balance font-display text-3xl">
        카멜론 룰
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/80">
        <p>
          파티형 숨바꼭질입니다. 카멜레온은 새하얀 몸을 <b className="text-lime">직접 칠해서</b> 배경에 녹아들고,
          술래는 색·재질·윤곽·자세가 어색한 지점을 찾아 태그합니다.
        </p>
        <p>
          <b>1. 술래 결정</b> — 라운드가 시작되면 전원이 중립 지점에 모이고 룰렛이 술래를 뽑습니다.
        </p>
        <p>
          <b>2. 위장</b> — 카멜레온은 맵을 돌아다니며 스포이드로 벽·가구의 색과 재질을 찍고(<b>F</b> 페인트),
          자세 11가지(<b>1~9, 0, -</b>)로 실루엣을 맞춥니다. 벽 앞에서 <b>Space</b>로 붙고 <b>E/Q</b>로 오르내립니다.
          대기실에서 고른 몸 크기(쁘띠·보통·통통)는 눈에 띄는 정도와 점수 배율을 바꿉니다.
        </p>
        <p>
          <b>3. 수색</b> — 술래는 1인칭으로 수색하고(우클릭 3인칭) 가까이 조준해 좌클릭으로 발견합니다.
          탄약 제한을 켜면 기본 {DEFAULT_AMMO}발: 빗나가면 −1, 맞히면 +1, 달아나는 상대에게 쏜 건 무료입니다.
          카멜레온은 <b>T</b>로 휘파람을 불어 술래를 속일 수 있고, 일정 시간마다 강제로 불게 됩니다.
        </p>
        <p>
          <b>4. 점수</b> — 발견 +{SCORE_TAG} · 생존 +{SCORE_SURVIVE} · 술래 승리 +{SCORE_HUNT_WIN} ·
          술래 눈앞에서 가만히 속이면 초당 최대 10점(가까울수록 큼). 발견된 카멜레온은 관전으로 넘어갑니다(감염 모드는 술래 합류).
        </p>
        <p>
          <b>5. 승리</b> — 제한 시간 안에 전원 발견이면 술래 승, 한 명이라도 남으면 카멜레온 승. <b>Tab</b>으로 현황.
        </p>
        <p>
          <b>조작</b> — PC는 WASD·마우스와 우측 하단 버튼, 모바일은 가로 화면에서 왼쪽 조이스틱과 오른쪽 시야 패드를 씁니다.
        </p>
        <p>맵: {MAPS.map((m) => m.name).join(" / ")}</p>
      </div>
      <button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-full bg-lime font-display text-black transition hover:brightness-110 active:scale-[0.98]">
        알겠어요
      </button>
    </AccessibleModal>
  );
}
