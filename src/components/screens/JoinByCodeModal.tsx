"use client";

import { useState, type FormEvent } from "react";
import { parseRoomCode } from "@/lib/rooms/code";
import { AccessibleModal } from "../AccessibleModal";

interface JoinByCodeModalProps {
  busy: boolean;
  error: string;
  onClose: () => void;
  onJoin: (code: string) => void;
}

export function JoinByCodeModal({ busy, error, onClose, onJoin }: JoinByCodeModalProps) {
  const [raw, setRaw] = useState("");
  const [localError, setLocalError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const code = parseRoomCode(raw);
    if (!code) {
      setLocalError("방 코드는 영문·숫자 4~16자입니다. 예: KR7F3K9Q");
      return;
    }
    setLocalError("");
    onJoin(code);
  };

  const message = localError || error;

  return (
    <AccessibleModal titleId="join-code-title" onClose={onClose} panelClassName="w-full max-w-sm rounded-3xl bg-[#142019] p-6 shadow-2xl">
      <h2 id="join-code-title" className="text-wrap-balance font-display text-3xl">
        코드로 참가
      </h2>
      <p className="mt-2 text-sm text-white/65">친구가 알려준 방 코드나 초대 링크를 붙여 넣으세요.</p>
      <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
        <input
          name="roomCode"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="KR7F3K9Q"
          aria-invalid={Boolean(message)}
          aria-describedby={message ? "join-code-error" : undefined}
          className="rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-center font-display text-2xl tracking-[0.2em] text-paper outline-none focus-visible:ring-2 focus-visible:ring-lime/40"
        />
        {message && (
          <p id="join-code-error" className="text-sm text-pink" aria-live="polite">
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-full border border-white/20 font-display text-lg">
            취소
          </button>
          <button type="submit" disabled={busy} className="h-12 flex-1 rounded-full bg-lime font-display text-lg text-black disabled:opacity-50">
            {busy ? "입장 중…" : "입장"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}
