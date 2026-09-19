"use client";

import { memo, useEffect, useRef, useState, type FormEvent } from "react";
import { CHAT_TEXT_MAX } from "@/lib/config";
import { isParticipant } from "@/lib/round";
import type { Session } from "@/lib/session";
import type { ChatMessage, PlayerSnap, RoomState, SystemMessage } from "@/lib/types";
import { HostCrown } from "./Lobby";

type LogEntry = { kind: "chat"; message: ChatMessage } | { kind: "system"; message: SystemMessage };

/** Chat and system lines share one timeline, newest last. */
export function mergeLog(chat: ChatMessage[], system: SystemMessage[], limit: number): LogEntry[] {
  const entries: LogEntry[] = [
    ...chat.map((message) => ({ kind: "chat" as const, message })),
    ...system.map((message) => ({ kind: "system" as const, message })),
  ];
  return entries.sort((a, b) => a.message.at - b.message.at).slice(-limit);
}

const CHAT_TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
});

export const RoomSocialPanel = memo(function RoomSocialPanel({
  session,
  room,
  people,
  nowTick,
  open,
  onToggle,
}: {
  session: Session;
  room: RoomState;
  people: PlayerSnap[];
  nowTick: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [draft, setDraft] = useState("");
  const messages = mergeLog(room.chat ?? [], room.system ?? [], 30);
  const lastMessageId = messages[messages.length - 1]?.message.id ?? "";
  const chatLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const log = chatLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [open, lastMessageId]);

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    session.sendChat(text);
    setDraft("");
  };

  return (
    <aside className="room-social-shell pointer-events-auto absolute bottom-24 left-3 right-3 top-auto z-30 max-h-[calc(100dvh-11rem)] w-auto overflow-y-auto overscroll-contain md:bottom-auto md:left-auto md:right-3 md:top-[5.5rem] md:w-[min(calc(100vw-1.5rem),320px)] md:max-h-none md:overflow-visible">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="room-social-panel"
        onClick={onToggle}
        className="ml-auto flex items-center gap-2 rounded-full border border-lime/30 bg-[#101a14]/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm"
      >
        <span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_10px_rgba(198,255,74,0.8)]" aria-hidden="true" />
        <span>접속자 {people.length}/{room.maxPlayers}</span>
        <span className="text-white/60">·</span>
        <span>{open ? "패널 닫기" : "채팅 열기"}</span>
      </button>

      {open && (
        <section
          id="room-social-panel"
          aria-labelledby="room-social-title"
          className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#101a14]/95 shadow-2xl backdrop-blur-md"
        >
          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex items-center justify-between">
              <h2 id="room-social-title" className="truncate text-wrap-balance font-display text-lg">{room.roomName || "방"}</h2>
              <span className="shrink-0 text-xs text-lime">최대 {room.maxPlayers}인</span>
            </div>
            <p className="mt-0.5 text-[11px] text-white/60">현재 접속 중인 플레이어</p>
            <ul className="mt-2 grid grid-cols-2 gap-1.5" aria-label="접속자 목록">
              {people.map((person) => {
                const status = presenceStatus(room, person, session.myId(), nowTick, session.kind === "online");
                return (
                  <li
                    key={person.id}
                    className="flex min-w-0 items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-xs"
                    title={`${person.name} · ${status}`}
                  >
                    {room.hostId === person.id ? <HostCrown /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate">{person.name}</span>
                    <span className="shrink-0 text-[10px] text-white/60">{status}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="px-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wide text-white/65">방 채팅</h3>
              <span className="text-[10px] text-white/55">최근 {messages.length}개</span>
            </div>
            <div
              ref={chatLogRef}
              className="mt-1.5 h-40 overflow-y-auto rounded-xl bg-black/25 p-2"
              role="log"
              aria-live="polite"
              aria-label="방 채팅 메시지"
            >
              {messages.length === 0 ? (
                <p className="grid h-full place-items-center text-xs text-white/55">첫 인사를 남겨보세요.</p>
              ) : (
                <ul className="space-y-2">
                  {messages.map((entry) =>
                    entry.kind === "system" ? (
                      <li key={entry.message.id} className="flex items-baseline gap-1.5 text-[11px] leading-snug text-white/55">
                        <span aria-hidden="true">{entry.message.kind === "host" ? "👑" : entry.message.kind === "kick" ? "⛔" : "ℹ"}</span>
                        <span className="italic">{entry.message.text}</span>
                        <time className="ml-auto shrink-0 text-[10px]" dateTime={new Date(entry.message.at).toISOString()}>
                          {CHAT_TIME_FORMAT.format(entry.message.at)}
                        </time>
                      </li>
                    ) : (
                      <li key={entry.message.id} className="text-xs leading-snug">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-lime">{entry.message.senderName}</span>
                          <time className="text-[10px] text-white/55" dateTime={new Date(entry.message.at).toISOString()}>
                            {CHAT_TIME_FORMAT.format(entry.message.at)}
                          </time>
                        </div>
                        <p className="break-words text-white/80">{entry.message.text}</p>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
            <form className="mt-2 flex gap-1.5 pb-3" onSubmit={send}>
              <label className="sr-only" htmlFor="room-chat-input">
                채팅 메시지
              </label>
              <input
                id="room-chat-input"
                name="message"
                autoComplete="off"
                enterKeyHint="send"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={CHAT_TEXT_MAX}
                placeholder="예: 여기로 와!…"
                aria-label="채팅 메시지"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs outline-none focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/40"
              />
              <button type="submit" className="rounded-lg bg-lime px-3 py-2 text-xs font-semibold text-black">
                전송
              </button>
            </form>
          </div>
        </section>
      )}
    </aside>
  );
});

function presenceStatus(room: RoomState, person: PlayerSnap, myId: string, nowTick: number, checkConnection: boolean) {
  if (person.id === myId) return "나";
  if (checkConnection && person.presenceAt && nowTick - person.presenceAt > 4500) return "응답 없음";
  if (room.phase === "lobby") return person.ready ? "준비" : "대기";
  if (!isParticipant(room, person.id)) return "관전";
  if (room.phase === "reveal") return "공개됨";
  if (room.phase === "result") return "결과";
  if (room.mode === "normal" && room.caughtIds.includes(person.id)) return "탈락";
  return "플레이 중";
}
