"use client";

import { useState, type FormEvent } from "react";
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_NAME_MAX } from "@/lib/config";
import { AccessibleModal } from "../AccessibleModal";

export type CreateRoomInput = { roomName: string; maxPlayers: number; isPrivate: boolean };

interface CreateRoomModalProps {
  nick: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: CreateRoomInput) => void;
}

export function CreateRoomModal({ nick, busy, onClose, onCreate }: CreateRoomModalProps) {
  const [roomName, setRoomName] = useState(`${nick}의 방`);
  const [maxPlayers, setMaxPlayers] = useState(MAX_PLAYERS);
  const [isPrivate, setIsPrivate] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    onCreate({ roomName: roomName.trim().slice(0, ROOM_NAME_MAX), maxPlayers, isPrivate });
  };

  return (
    <AccessibleModal titleId="create-room-title" onClose={onClose} panelClassName="w-full max-w-md rounded-3xl bg-[#142019] p-6 shadow-2xl">
      <h2 id="create-room-title" className="text-wrap-balance font-display text-3xl">
        방 만들기
      </h2>
      <form className="mt-5 flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-1 text-xs text-white/60">
          방 이름
          <input
            name="roomName"
            autoComplete="off"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={ROOM_NAME_MAX}
            className="rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-base text-paper outline-none focus-visible:ring-2 focus-visible:ring-lime/40"
          />
        </label>
        <div className="text-xs text-white/60">
          <span id="max-players-label">최대 인원</span>
          <div className="mt-1 grid grid-cols-7 gap-1" role="radiogroup" aria-labelledby="max-players-label">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={maxPlayers === n}
                onClick={() => setMaxPlayers(n)}
                className={`rounded-lg py-2 font-display text-lg ${maxPlayers === n ? "bg-lime text-black" : "bg-white/10 text-paper"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 text-sm">
          <span>
            <span className="block">비공개 방</span>
            <span className="block text-[11px] text-white/55">목록에 뜨지 않고 코드로만 입장</span>
          </span>
          <input type="checkbox" name="isPrivate" className="h-5 w-5 accent-lime" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        </label>
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-full border border-white/20 py-2.5 text-sm">
            취소
          </button>
          <button type="submit" disabled={busy} className="flex-1 rounded-full bg-lime py-2.5 font-display text-lg text-black disabled:opacity-50">
            {busy ? "만드는 중…" : "만들기"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}
