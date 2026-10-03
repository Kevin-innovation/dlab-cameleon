"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CHAT_TEXT_MAX } from "@/lib/config";
import { isLobbyAdminName } from "@/lib/rooms/admin";
import type { LobbyChatState } from "./useLobbyChat";

const TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" });

export function LobbyChat({ nickname, chat }: { nickname: string; chat: LobbyChatState & { send: (text: string) => Promise<boolean>; remove: (messageId: string, adminKey: string) => Promise<boolean>; clear: (adminKey: string) => Promise<boolean>; refresh: () => void } }) {
  const [draft, setDraft] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const lastMessageId = chat.messages[chat.messages.length - 1]?.id ?? "";
  const isAdmin = isLobbyAdminName(nickname);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lastMessageId]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void chat.send(text).then((sent) => {
      if (sent) setDraft("");
    });
  };

  return (
    <section aria-labelledby="lobby-chat-title" className="min-w-0 w-full rounded-3xl border border-lime/20 bg-[#101a14]/85 p-4 shadow-xl backdrop-blur-sm lg:sticky lg:top-6 lg:self-start">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-lime">한국 서버 로비</p>
          <h2 id="lobby-chat-title" className="whitespace-nowrap font-display text-2xl leading-tight">실시간 채팅</h2>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("한국 서버 채팅을 모두 삭제할까요?")) void chat.clear(adminKey);
              }}
              disabled={!adminKey.trim() || chat.clearing || chat.deletingId !== ""}
              className="h-9 w-20 shrink-0 whitespace-nowrap rounded-full border border-pink/30 px-2 text-[10px] leading-none text-pink transition hover:border-pink/60 disabled:cursor-not-allowed disabled:opacity-30 sm:w-[5.5rem] sm:text-[11px]"
            >
              {chat.clearing ? "삭제 중…" : "전체 삭제"}
            </button>
          )}
          <button type="button" onClick={chat.refresh} className="h-9 w-20 shrink-0 whitespace-nowrap rounded-full border border-white/15 px-2 text-[10px] leading-none text-white/65 transition hover:border-lime/50 hover:text-lime sm:w-[5.5rem] sm:text-[11px]">
            새로고침
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-white/55">방에 들어가기 전에도 {nickname} 님으로 대화할 수 있어요.</p>
      {isAdmin && (
        <div className="mt-3 rounded-2xl border border-lime/20 bg-lime/5 p-3">
          <label htmlFor="lobby-admin-key" className="whitespace-nowrap text-xs font-semibold text-lime">Kevin 관리자 인증</label>
          <input
            id="lobby-admin-key"
            type="password"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            autoComplete="off"
            placeholder="관리자 키 입력"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/40"
          />
          <p className="mt-1 text-[10px] text-white/45">인증 후 채팅마다 삭제 버튼이 표시됩니다.</p>
        </div>
      )}
      <div ref={logRef} className="mt-3 h-56 overflow-y-auto rounded-2xl bg-black/25 p-3" role="log" aria-live="polite" aria-label="한국 서버 로비 채팅">
        {chat.loading && chat.messages.length === 0 ? (
          <p className="grid h-full place-items-center text-xs text-white/50">채팅을 불러오는 중…</p>
        ) : chat.messages.length === 0 ? (
          <p className="grid h-full place-items-center text-xs text-white/50">첫 인사를 남겨보세요.</p>
        ) : (
          <ul className="space-y-2">
            {chat.messages.map((message) => (
              <li key={message.id} className="text-xs leading-snug">
                <div className="flex items-baseline gap-1.5">
                  <span className={message.name === nickname ? "font-semibold text-lime" : "font-semibold text-white/85"}>{message.name}</span>
                  <time className="text-[10px] text-white/40" dateTime={new Date(message.at).toISOString()}>{TIME_FORMAT.format(message.at)}</time>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("이 채팅을 삭제할까요?")) void chat.remove(message.id, adminKey);
                      }}
                      disabled={!adminKey.trim() || chat.deletingId === message.id}
                      className="ml-auto rounded-full border border-pink/30 px-1.5 py-0.5 text-[10px] text-pink disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label={`${message.name}의 채팅 삭제`}
                    >
                      {chat.deletingId === message.id ? "…" : "삭제"}
                    </button>
                  )}
                </div>
                <p className="break-words text-white/75">{message.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      {chat.error && <p className="mt-2 text-xs text-pink" role="status">{chat.error}</p>}
      <form className="mt-3 flex gap-2" onSubmit={submit}>
        <label htmlFor="lobby-chat-input" className="sr-only">한국 서버 채팅 메시지</label>
        <input
          id="lobby-chat-input"
          name="lobbyMessage"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={CHAT_TEXT_MAX}
          autoComplete="off"
          enterKeyHint="send"
          placeholder="방금 들어온 사람에게 인사하기…"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/40"
        />
        <button type="submit" disabled={chat.sending || !draft.trim()} className="rounded-xl bg-lime px-3.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">
          {chat.sending ? "…" : "전송"}
        </button>
      </form>
    </section>
  );
}
