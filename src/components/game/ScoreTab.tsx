"use client";

import { memo } from "react";
import { SCORE_HUNT_WIN, SCORE_SURVIVE, SCORE_TAG } from "@/lib/config";
import { hiderAlive, isHunter } from "@/lib/round";
import type { PlayerSnap, RoomState } from "@/lib/types";
import { HostCrown } from "./Lobby";

export const ScoreTab = memo(function ScoreTab({
  room,
  people,
  myId,
}: {
  room: RoomState;
  people: PlayerSnap[];
  myId: string;
}) {
  // Hunters only get the 30-second-old snapshot so the ranking cannot be used as a radar.
  const missedSource = isHunter(room, myId) ? room.missedShown : room.missed;
  const missedOf = (id: string) => missedSource?.[id] ?? 0;
  const survivors = people.filter((p) => hiderAlive(room, p.id));
  const dead = people.filter((p) => room.caughtIds.includes(p.id));
  const ranked = [...people].sort((a, b) => (room.scores[b.id] ?? 0) - (room.scores[a.id] ?? 0));
  const row = (p: PlayerSnap) => (
    <li
      key={p.id}
      className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${
        p.id === myId ? "bg-lime/15" : "bg-white/5"
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {room.hostId === p.id && <HostCrown />}
        <span className="truncate">
          {p.name}
          {p.id === myId ? " (나)" : ""}
          {room.phase !== "lobby" && isHunter(room, p.id) ? " · 술래" : ""}
        </span>
      </span>
      <span className="ml-2 flex shrink-0 items-baseline gap-2 tabular-nums">
        {room.phase === "hunt" && missedOf(p.id) > 0 && (
          <span className="text-[11px] text-cyan-200" title="술래 눈앞에서 속인 점수">속임 +{Math.round(missedOf(p.id))}</span>
        )}
        <span className="text-lime">{room.scores[p.id] ?? 0}</span>
      </span>
    </li>
  );
  return (
    <section
      className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/55 p-4"
      aria-label="게임 현황"
      aria-live="polite"
    >
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-[#121c17]/95 p-5 shadow-2xl">
        <div className="flex items-end justify-between">
          <h2 className="text-wrap-balance font-display text-3xl">현황</h2>
          <p className="text-xs text-white/60">Tab을 떼면 닫힙니다</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <section className="rounded-2xl bg-black/30 p-3">
            <h4 className="text-xs tracking-wide text-white/55">참여자 {ranked.length}</h4>
            <ul className="mt-2 space-y-1">{ranked.map(row)}</ul>
          </section>
          <section className="rounded-2xl bg-black/30 p-3">
            <h4 className="text-xs tracking-wide text-lime/80">생존자 {survivors.length}</h4>
            <ul className="mt-2 space-y-1">
              {survivors.length ? survivors.map(row) : <li className="text-sm text-white/60">없음</li>}
            </ul>
          </section>
          <section className="rounded-2xl bg-black/30 p-3">
            <h4 className="text-xs tracking-wide text-pink/80">죽은자 {dead.length}</h4>
            <ul className="mt-2 space-y-1">
              {dead.length ? dead.map(row) : <li className="text-sm text-white/60">없음</li>}
            </ul>
          </section>
        </div>
        <p className="mt-4 text-center text-xs text-white/65">
          점수 기준 · 발견 +{SCORE_TAG} · 생존 +{SCORE_SURVIVE} · 술래 승리 +{SCORE_HUNT_WIN} · 술래 시야 안에서 정지한 채 안 들키면 초당 최대 10점(술래 화면은 30초 지연)
        </p>
      </div>
    </section>
  );
});
