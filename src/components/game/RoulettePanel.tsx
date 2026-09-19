"use client";

import { useEffect, useState } from "react";
import { rouletteState } from "@/lib/gather";
import { isHunter } from "@/lib/round";
import type { PlayerSnap, RoomState } from "@/lib/types";

interface RoulettePanelProps {
  room: RoomState;
  people: PlayerSnap[];
  myId: string;
}

/**
 * Prepare-phase overlay: everyone stands on the gather ring while a name roulette
 * ticks down and lands on the hunter. The state is derived from the room clock, so
 * every client sees the same spin and the same reveal moment.
 */
export function RoulettePanel({ room, people, myId }: RoulettePanelProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(id);
  }, []);

  const state = rouletteState(room, now);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "…";
  const current = state.order[state.index];
  const hunters = room.hunterIds;
  const iAmHunter = isHunter(room, myId);
  const secondsLeft = Math.max(0, Math.ceil((room.phaseEndsAt - now) / 1000));
  // Speed the pulse up as the spin slows: tension before the reveal.
  const pulse = state.settled ? "animate-none" : state.progress > 0.75 ? "animate-pulse" : "";
  // Lock stage: the landed name strobes (150 ms on/off) before it is announced as the hunter.
  const locking = state.stage === "lock";
  const blinkOn = !locking || Math.floor(state.settledFor / 150) % 2 === 0;
  const announced = state.stage === "settled";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/35 text-center" role="status" aria-live="polite">
      <p className="text-sm tracking-[0.2em] text-lime">{announced ? "술래 확정!" : locking ? "멈췄다…" : "술래는 누구?"}</p>
      <div
        className={`mt-3 rounded-3xl border px-10 py-5 backdrop-blur-sm transition-transform ${
          announced
            ? "scale-110 border-pink bg-pink/20 shadow-[0_0_40px_rgba(255,122,162,0.55)]"
            : locking
              ? `border-lime bg-black/70 ${blinkOn ? "shadow-[0_0_32px_rgba(198,255,74,0.7)]" : "opacity-40"}`
              : "border-lime/40 bg-black/60"
        } ${pulse}`}
      >
        <div className={`font-display leading-none ${announced ? "text-6xl text-pink" : "text-5xl text-paper"}`}>{nameOf(current)}</div>
        {announced && hunters.length > 1 && (
          <p className="mt-2 text-sm text-pink/80">함께 술래: {hunters.slice(1).map(nameOf).join(", ")}</p>
        )}
      </div>
      {announced ? (
        <p className="mt-4 font-display text-2xl text-paper">
          {iAmHunter ? "당신이 술래입니다 — 카멜레온들이 숨는 동안 기다리세요" : "숨을 준비! 곧 흩어집니다"}
        </p>
      ) : (
        <ul className="mt-4 flex flex-wrap justify-center gap-1.5" aria-hidden="true">
          {state.order.map((id, i) => (
            <li
              key={id}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                i === state.index ? (blinkOn ? "bg-lime text-black" : "bg-lime/30 text-black/60") : "bg-white/10 text-white/70"
              }`}
            >
              {nameOf(id)}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 font-display text-5xl text-lime tabular-nums">{secondsLeft}</div>
    </div>
  );
}
