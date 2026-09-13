"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { APP_NAME, DEFAULT_ROOM_CODE, MAX_PLAYERS, NICK_KEY, SERVERS } from "@/lib/config";
import { MAPS } from "@/lib/maps";
import { requestMobileLandscape } from "@/lib/mobile";
import { connectOnline, createPractice, type Session } from "@/lib/session";
import { AccessibleModal } from "./AccessibleModal";
import { GameView } from "./GameView";

type Screen =
  | { t: "home" }
  | { t: "connecting" }
  | { t: "play" }
  | { t: "practice" };

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

export default function GameApp() {
  const [nick, setNick] = useState(readStoredNickname);
  const [screen, setScreen] = useState<Screen>({ t: "home" });
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [howto, setHowto] = useState(false);

  const joinGame = async () => {
    const name = nick.trim().slice(0, 12);
    if (name.length < 2) {
      setError("닉네임은 2~12자로 입력해 주세요.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
      return;
    }
    storeNickname(name);
    setNick(name);
    setError("");
    setScreen({ t: "connecting" });
    void requestMobileLandscape().catch(() => false);
    try {
      const s = await withTimeout(
        connectOnline({
          roomCode: DEFAULT_ROOM_CODE,
          nickname: name,
        }),
        15000,
      );
      setSession(s);
      setScreen({ t: "play" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("ROOM_LIMIT") || msg.includes("full")
          ? `통합 룸이 가득 찼습니다 (최대 ${MAX_PLAYERS}인). 잠시 후 다시 시도해 주세요.`
          : msg === "CONNECT_TIMEOUT"
            ? "서버 응답이 늦습니다. 네트워크를 확인하고 다시 입장해 주세요."
            : /SecurityError|QuotaExceeded|storage/i.test(msg)
              ? "브라우저 저장소 접근이 제한되어 있습니다. Safari 설정을 확인한 뒤 다시 시도해 주세요."
          : "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      setScreen({ t: "home" });
    }
  };

  const startPractice = () => {
    const name = nick.trim().slice(0, 12);
    if (name.length < 2) {
      setError("닉네임은 2~12자로 입력해 주세요.");
      return;
    }
    setError("");
    storeNickname(name);
    setNick(name);
    void requestMobileLandscape().catch(() => false);
    setSession(createPractice(name));
    setScreen({ t: "practice" });
  };

  if ((screen.t === "play" || screen.t === "practice") && session) {
    return (
      <GameView
        session={session}
        serverName={screen.t === "practice" ? "AI 매치" : SERVERS[0].name}
        roomLabel={screen.t === "practice" ? "호스트 + AI 7인" : `통합 룸 · 최대 ${MAX_PLAYERS}인`}
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
          <button type="button" className="text-sm text-white/70" onClick={() => setHowto(true)}>
            룰
          </button>
        </header>

        {screen.t === "home" && (
          <Home
            nick={nick}
            setNick={setNick}
            error={error}
            onPlay={() => void joinGame()}
            onPractice={startPractice}
          />
        )}
        {screen.t === "connecting" && (
          <div className="flex flex-1 flex-col items-center justify-center" role="status" aria-live="polite" aria-busy="true">
            <Image src="/mascot.jpg" alt="" width={96} height={96} priority className="h-24 w-24 animate-pulse rounded-3xl object-cover" />
            <p className="mt-4 font-display text-2xl">방 입장 중…</p>
            <p className="text-white/60">한국 서버 통합 룸에 접속하고 있습니다</p>
          </div>
        )}
      </div>

      {howto && <HowTo onClose={() => setHowto(false)} />}
    </div>
  );
}

function Home({
  nick,
  setNick,
  error,
  onPlay,
  onPractice,
}: {
  nick: string;
  setNick: (v: string) => void;
  error: string;
  onPlay: () => void;
  onPractice: () => void;
}) {
  const nicknameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) nicknameRef.current?.focus();
  }, [error]);

  return (
    <main id="main-content" className="flex flex-1 flex-col items-start justify-center gap-8 py-10 md:flex-row md:items-center md:justify-between">
      <div className="max-w-xl">
        <p className="text-sm text-lime">IO 숨바꼭질 · 페인트 위장</p>
        <h1 className="text-wrap-balance mt-2 font-display text-5xl leading-tight md:text-7xl">
          흰 몸으로 들어가
          <br />
          배경이 되어 나와라
        </h1>
        <p className="mt-4 text-base text-white/75">
          닉네임만 정하면 한국 서버 통합 룸에 바로 입장합니다. 최대 8명이 한 공간에서 만나 라운드마다
          술래와 카멜레온으로 나뉩니다. 배경에서 색을 찍고, 몸을 칠하고, 자세를 맞춰 술래의 눈을 속이세요.
        </p>
        <form
          className="mt-8 flex w-full max-w-md flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onPlay();
          }}
        >
          <label htmlFor="nickname" className="text-xs tracking-wide text-white/60">
            닉네임
          </label>
          <input
            ref={nicknameRef}
            id="nickname"
            name="nickname"
            type="text"
            inputMode="text"
            autoComplete="nickname"
            spellCheck={false}
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={12}
            placeholder="예: 초록커튼…"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "nickname-error" : undefined}
            className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-lg outline-none ring-lime/40 focus-visible:ring-2"
          />
          {error && (
            <p id="nickname-error" className="text-sm text-pink" aria-live="polite">
              {error}
            </p>
          )}
          <button type="submit" className="rounded-full bg-lime py-3 font-display text-xl text-black">
            한국 서버 입장
          </button>
          <button
            type="button"
            onClick={onPractice}
            className="rounded-full border border-white/20 py-3 text-sm"
          >
            AI와 플레이 (나 + AI 7인)
          </button>
        </form>
      </div>
      <Image
        src="/mascot.jpg"
        alt="카멜론"
        width={288}
        height={288}
        priority
        className="mx-auto h-56 w-56 rounded-[2.2rem] object-cover shadow-2xl ring-4 ring-lime/30 md:h-72 md:w-72"
      />
    </main>
  );
}

function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <AccessibleModal titleId="howto-title" onClose={onClose} panelClassName="max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl bg-[#142019] p-6 shadow-2xl">
      <h2 id="howto-title" className="text-wrap-balance font-display text-3xl">
        메챠 카멜레온 룰
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/80">
        <p>
          파티형 숨바꼭질입니다. 숨는 쪽은 새하얀 몸을 <b className="text-lime">직접 칠해서</b> 배경에
          녹아들고, 술래는 색온도·윤곽·자세가 어색한 지점을 찾아 태그합니다.
        </p>
        <p>
          <b>1. 역할</b> — 라운드 시작 시 술래와 카멜레온이 랜덤 배정됩니다.
        </p>
        <p>
          <b>2. 역할 확인·위장</b> — 술래는 수색 시작 전 대기합니다. 카멜레온은 3D 맵을 돌아다니며
          스포이드로 벽·가구 색을 찍고, 몸을 칠하고, 자세를 맞춥니다.
        </p>
        <p>
          <b>3. 수색</b> — 술래가 입장합니다. 색·윤곽·자세가 어색한 곳을 직접 조사하고 가까이 조준해
          발견합니다. 기본 모드에서는 발견된 카멜레온이 관전 상태가 됩니다.
        </p>
        <p>
          <b>4. 승리</b> — 제한 시간 안에 전원 발견이면 술래 승. 한 명이라도 남으면 카멜레온 승.
        </p>
        <p>
          <b>조작</b> — PC는 WASD·마우스, 화면 버튼으로 자세·페인트를 사용합니다. 모바일은 가로 화면에서
          왼쪽 조이스틱과 오른쪽 시야 패드를 사용하세요. 감염·탄약 제한은 방 옵션입니다.
        </p>
        <p>맵: {MAPS.map((m) => m.name).join(" / ")}</p>
      </div>
      <button type="button" onClick={onClose} className="mt-6 w-full rounded-full bg-lime py-2 font-display text-black">
        알겠어요
      </button>
    </AccessibleModal>
  );
}
