"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { APP_NAME, MAX_PLAYERS, NICK_KEY, ROOMS_PER_SERVER, SERVERS, makeRoomCode } from "@/lib/config";
import { MAPS } from "@/lib/maps";
import { connectOnline, createPractice, type Session } from "@/lib/session";
import { GameView } from "./GameView";

type Screen =
  | { t: "home" }
  | { t: "servers" }
  | { t: "rooms"; serverId: string }
  | { t: "connecting"; serverId: string; room: number }
  | { t: "play"; serverId: string; room: number }
  | { t: "practice" };

export default function GameApp() {
  const [nick, setNick] = useState(() => sessionStorage.getItem(NICK_KEY) ?? "");
  const [screen, setScreen] = useState<Screen>({ t: "home" });
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [howto, setHowto] = useState(false);

  const goServers = () => {
    const name = nick.trim().slice(0, 12);
    if (name.length < 2) {
      setError("닉네임은 2~12자");
      return;
    }
    sessionStorage.setItem(NICK_KEY, name);
    setNick(name);
    setError("");
    setScreen({ t: "servers" });
  };

  const joinRoom = async (serverId: string, room: number) => {
    setError("");
    setScreen({ t: "connecting", serverId, room });
    try {
      const s = await connectOnline({
        roomCode: makeRoomCode(serverId, room),
        nickname: nick,
      });
      setSession(s);
      setScreen({ t: "play", serverId, room });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "접속 실패";
      setError(msg.includes("ROOM_LIMIT") || msg.includes("full") ? "방이 가득 찼습니다" : msg);
      setScreen({ t: "rooms", serverId });
    }
  };

  const startPractice = () => {
    const name = nick.trim().slice(0, 12);
    if (name.length < 2) {
      setError("닉네임은 2~12자");
      return;
    }
    sessionStorage.setItem(NICK_KEY, name);
    setNick(name);
    setSession(createPractice(name));
    setScreen({ t: "practice" });
  };

  if ((screen.t === "play" || screen.t === "practice") && session) {
    const server = SERVERS.find((s) => screen.t === "play" && s.id === screen.serverId);
    return (
      <GameView
        session={session}
        serverName={screen.t === "practice" ? "AI 매치" : server?.name || "서버"}
        roomLabel={screen.t === "practice" ? "호스트 + AI 7인" : `방 ${screen.room}`}
      />
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-moss text-paper">
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
            onPlay={goServers}
            onPractice={startPractice}
          />
        )}
        {screen.t === "servers" && (
          <ServerPick
            nick={nick}
            onBack={() => setScreen({ t: "home" })}
            onPick={(id) => setScreen({ t: "rooms", serverId: id })}
          />
        )}
        {screen.t === "rooms" && (
          <RoomPick
            nick={nick}
            serverId={screen.serverId}
            error={error}
            onBack={() => setScreen({ t: "servers" })}
            onJoin={(room) => void joinRoom(screen.serverId, room)}
          />
        )}
        {screen.t === "connecting" && (
          <div className="flex flex-1 flex-col items-center justify-center">
            <Image src="/mascot.jpg" alt="" width={96} height={96} className="h-24 w-24 animate-pulse rounded-3xl object-cover" />
            <p className="mt-4 font-display text-2xl">방 입장 중...</p>
            <p className="text-white/60">같은 서버·같은 방을 고른 사람과 만납니다</p>
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
  return (
    <main className="flex flex-1 flex-col items-start justify-center gap-8 py-10 md:flex-row md:items-center md:justify-between">
      <div className="max-w-xl">
        <p className="text-sm text-lime">IO 숨바꼭질 · 페인트 위장</p>
        <h1 className="mt-2 font-display text-5xl leading-tight md:text-7xl">
          흰 몸으로 들어가
          <br />
          배경이 되어 나와라
        </h1>
        <p className="mt-4 text-base text-white/75">
          닉네임을 정하고 서버를 고른 뒤 방에 들어갑니다. 라운드마다 술래와 카멜레온이 무작위로
          나뉩니다. 스포이드로 색을 찍고, 자세를 맞추고, 술래의 눈을 속이세요.
        </p>
        <form
          className="mt-8 flex w-full max-w-md flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onPlay();
          }}
        >
          <label className="text-xs tracking-wide text-white/60">닉네임</label>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={12}
            placeholder="예: 초록커튼"
            className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-lg outline-none ring-lime/40 focus:ring-2"
          />
          {error && <p className="text-sm text-pink">{error}</p>}
          <button type="submit" className="rounded-full bg-lime py-3 font-display text-xl text-black">
            서버 선택
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
        className="mx-auto h-56 w-56 rounded-[2.2rem] object-cover shadow-2xl ring-4 ring-lime/30 md:h-72 md:w-72"
      />
    </main>
  );
}

function ServerPick({
  nick,
  onBack,
  onPick,
}: {
  nick: string;
  onBack: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <main className="flex flex-1 flex-col py-8">
      <button type="button" onClick={onBack} className="self-start text-sm text-white/60">
        ← 닉네임
      </button>
      <h1 className="mt-4 font-display text-4xl">서버 선택</h1>
      <p className="mt-1 text-white/65">
        안녕, <span className="text-lime">{nick}</span>. 같은 서버의 같은 방으로 모이세요.
      </p>
      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {SERVERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="group rounded-3xl border border-white/10 bg-black/35 p-5 text-left transition hover:border-lime/50 hover:bg-black/50"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-2xl">{s.name}</div>
                <div className="text-sm text-white/60">
                  {s.city} · {s.flavor}
                </div>
              </div>
              <span className="rounded-full bg-lime/15 px-2 py-1 text-xs text-lime">{s.ping}</span>
            </div>
            <div className="mt-4 text-sm text-white/50">방 {ROOMS_PER_SERVER}개 · 방당 {MAX_PLAYERS}명</div>
          </button>
        ))}
      </div>
    </main>
  );
}

function RoomPick({
  nick,
  serverId,
  error,
  onBack,
  onJoin,
}: {
  nick: string;
  serverId: string;
  error: string;
  onBack: () => void;
  onJoin: (room: number) => void;
}) {
  const server = SERVERS.find((s) => s.id === serverId);
  const rooms = useMemo(() => Array.from({ length: ROOMS_PER_SERVER }, (_, i) => i + 1), []);
  return (
    <main className="flex flex-1 flex-col py-8">
      <button type="button" onClick={onBack} className="self-start text-sm text-white/60">
        ← 서버
      </button>
      <h1 className="mt-4 font-display text-4xl">{server?.name} 방</h1>
      <p className="mt-1 text-white/65">
        {nick} · 친구와 같은 번호를 고르면 바로 만납니다. 방 인원은 입장 후 확인됩니다.
      </p>
      {error && <p className="mt-3 text-pink">{error}</p>}
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {rooms.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onJoin(n)}
            className="rounded-3xl border border-white/10 bg-black/35 p-5 text-left hover:border-lime/60"
          >
            <div className="text-xs text-white/50">ROOM</div>
            <div className="font-display text-3xl">{n}</div>
            <div className="mt-2 text-sm text-lime">입장</div>
            <div className="text-xs text-white/45">최대 {MAX_PLAYERS}인</div>
          </button>
        ))}
      </div>
    </main>
  );
}

function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/75 p-4" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-3xl bg-[#142019] p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-3xl">메챠 카멜레온 룰</h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/80">
          <p>
            파티형 숨바꼭질입니다. 숨는 쪽은 새하얀 몸을 <b className="text-lime">직접 칠해서</b> 배경에
            녹아들고, 술래는 색온도·윤곽·자세가 어색한 지점을 찾아 태그합니다.
          </p>
          <p>
            <b>1. 역할</b> — 라운드 시작 시 술래와 카멜레온이 랜덤 배정됩니다.
          </p>
          <p>
            <b>2. 위장 시간</b> — 술래는 맵에 들어올 수 없습니다. 화면을 클릭해 마우스로 둘러보고 WASD로
            걷습니다. 스포이드로 3D 벽·가구 색을 찍고, 내 캐릭터를 클릭해 칠하고, 자세를 맞춥니다.
          </p>
          <p>
            <b>3. 수색</b> — 술래가 입장합니다. 가까이 가서 클릭하면 태그. 노말은 아웃, 감염 모드는 술래가
            됩니다. 카멜레온끼리는 수색 중 서로 보이지 않습니다.
          </p>
          <p>
            <b>4. 승리</b> — 제한 시간 안에 전원 발견이면 술래 승. 한 명이라도 남으면 카멜레온 승.
          </p>
          <p>
            맵: {MAPS.map((m) => m.name).join(" / ")}
          </p>
        </div>
        <button type="button" onClick={onClose} className="mt-6 w-full rounded-full bg-lime py-2 font-display text-black">
          알겠어요
        </button>
      </div>
    </div>
  );
}
