"use client";

import { REVEAL_TIME, SCORE_HUNT_WIN, SCORE_SURVIVE, SCORE_TAG } from "@/lib/config";
import type { PlayerSnap, RoomState } from "@/lib/types";
import { AccessibleModal } from "../AccessibleModal";

export function ResultPanel({
  room,
  people,
  host,
  onNext,
}: {
  room: RoomState;
  people: PlayerSnap[];
  host: boolean;
  onNext: () => void;
}) {
  const ranked = [...people].sort((a, b) => (room.scores[b.id] ?? 0) - (room.scores[a.id] ?? 0));
  return (
    <AccessibleModal
      titleId="result-title"
      panelClassName="max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-[#121c17] p-6 text-center shadow-2xl"
    >
        <p className="text-lime">라운드 {room.round}</p>
        <h2 id="result-title" className="text-wrap-balance font-display text-4xl">{room.winner === "hiders" ? "카멜레온 승!" : "술래 승!"}</h2>
        <p className="mt-2 text-xs text-white/65">
          발견 +{SCORE_TAG} · 생존 승리 +{SCORE_SURVIVE} · 술래 승리 +{SCORE_HUNT_WIN}
        </p>
        <ul className="mt-4 space-y-1 text-left">
          {ranked.map((p, i) => (
            <li key={p.id} className="flex justify-between rounded-lg bg-white/5 px-3 py-1">
              <span>
                {i + 1}. {p.name}
              </span>
              <span className="text-lime">{room.scores[p.id] ?? 0}</span>
            </li>
          ))}
        </ul>
        {host && (
          <button type="button" onClick={onNext} className="mt-5 w-full rounded-full bg-lime py-2 font-display text-black">
            다음 라운드
          </button>
        )}
    </AccessibleModal>
  );
}

export function RevealPanel({ room, timeLeft }: { room: RoomState; timeLeft: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/25 p-4">
      <div className="w-full max-w-md rounded-3xl border border-lime/25 bg-[#121c17]/90 p-6 text-center shadow-2xl backdrop-blur-sm">
        <p className="text-sm tracking-[0.18em] text-lime">마지막 {REVEAL_TIME}초</p>
        <h2 className="text-wrap-balance mt-2 font-display text-4xl">검증 라운드</h2>
        <p className="mt-3 text-sm text-white/75">
          모든 카멜레온의 위치가 공개됩니다.
          <br />
          숨은 장소를 감상하고 다음 라운드를 준비하세요.
        </p>
        <div className="mt-5 font-display text-6xl tabular-nums text-lime">{timeLeft}</div>
        <p className="mt-2 text-xs text-white/60">
          {room.winner === "hiders" ? "카멜레온 팀 승리" : "술래 팀 승리"} · Tab으로 현황 보기
        </p>
      </div>
    </div>
  );
}
