"use client";

import { getMap } from "@/lib/maps";
import { hasOpenSlot, type RoomListing } from "@/lib/rooms/listing";
import { LobbyChat } from "./LobbyChat";
import type { LobbyChatState } from "./useLobbyChat";
import type { RoomListState } from "./useRoomList";

interface RoomBrowserProps {
  channelName: string;
  nickname: string;
  list: RoomListState;
  chat: LobbyChatState & { send: (text: string) => Promise<boolean>; remove: (messageId: string, adminKey: string) => Promise<boolean>; refresh: () => void };
  busy: boolean;
  error: string;
  onRefresh: () => void;
  onJoin: (room: RoomListing) => void;
  onQuickJoin: () => void;
  onCreate: () => void;
  onJoinByCode: () => void;
  onBack: () => void;
}

const PHASE_LABEL: Record<RoomListing["phase"], string> = {
  lobby: "대기 중",
  prepare: "게임 중",
  hide: "게임 중",
  hunt: "게임 중",
  reveal: "게임 중",
  result: "게임 중",
};

const mapName = (mapId: string) => getMap(mapId).name;

export function RoomBrowser({ channelName, nickname, list, chat, busy, error, onRefresh, onJoin, onQuickJoin, onCreate, onJoinByCode, onBack }: RoomBrowserProps) {
  const openRooms = list.rooms.filter((room) => room.phase === "lobby" && hasOpenSlot(room)).length;

  return (
    <main id="main-content" className="flex min-w-0 flex-1 flex-col gap-5 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-lime">{channelName}</p>
          <h1 className="text-wrap-balance font-display text-4xl md:text-5xl">방 목록</h1>
          <p className="mt-1 text-sm text-white/65">
            {list.loading && list.fetchedAt === 0
              ? "방을 불러오는 중…"
              : `열린 방 ${list.rooms.length}개 · 바로 들어갈 수 있는 방 ${openRooms}개`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onBack} className="h-10 w-28 rounded-full border border-white/20 text-sm">
            닉네임 변경
          </button>
          <button type="button" onClick={onRefresh} disabled={list.loading} className="h-10 w-28 rounded-full border border-white/20 text-sm disabled:opacity-50">
            새로고침
          </button>
        </div>
      </div>

      <div className="grid w-full min-w-0 grid-cols-3 gap-2" role="group" aria-label="방 참가 방법">
        <button
          type="button"
          onClick={onQuickJoin}
          disabled={busy}
          className="h-14 min-w-0 w-full truncate rounded-2xl bg-lime px-2 font-display text-lg text-black disabled:opacity-50 sm:text-xl"
        >
          빠른 참가
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="h-14 min-w-0 w-full truncate rounded-2xl border border-lime/40 bg-lime/10 px-2 font-display text-lg text-lime disabled:opacity-50 sm:text-xl"
        >
          방 만들기
        </button>
        <button
          type="button"
          onClick={onJoinByCode}
          disabled={busy}
          className="h-14 min-w-0 w-full truncate rounded-2xl border border-white/15 bg-white/5 px-2 font-display text-lg disabled:opacity-50 sm:text-xl"
        >
          코드로 참가
        </button>
      </div>

      {(error || list.error) && (
        <p className="rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink" role="alert">
          {error || list.error}
        </p>
      )}

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_calc((100%_-_1rem)/3)] lg:items-start">
        <section aria-label="공개 방 목록" className="flex min-w-0 w-full flex-col gap-2">
          {list.rooms.length === 0 && !list.loading && (
            <div className="rounded-3xl border border-dashed border-white/15 px-6 py-12 text-center">
              <p className="font-display text-2xl">아직 열린 방이 없어요</p>
              <p className="mt-1 text-sm text-white/60">첫 방을 만들면 다른 플레이어에게 바로 보입니다.</p>
            </div>
          )}
          {list.rooms.map((room) => {
            const full = !hasOpenSlot(room);
            const playing = room.phase !== "lobby";
            return (
              <article
                key={room.code}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-display text-xl">{room.name}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${playing ? "bg-pink/20 text-pink" : "bg-lime/20 text-lime"}`}>
                      {PHASE_LABEL[room.phase]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/60">
                    방장 {room.hostName} · {mapName(room.mapId)} · {room.mode === "infection" ? "감염" : "기본"} · 코드 {room.code}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-display text-2xl tabular-nums ${full ? "text-pink" : "text-lime"}`}>
                    {room.players}/{room.maxPlayers}
                  </span>
                  <button
                    type="button"
                    onClick={() => onJoin(room)}
                    disabled={busy || full}
                    className="rounded-full bg-white/10 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {full ? "가득 참" : playing ? "관전 입장" : "입장"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
        <LobbyChat nickname={nickname} chat={chat} />
      </div>
    </main>
  );
}
